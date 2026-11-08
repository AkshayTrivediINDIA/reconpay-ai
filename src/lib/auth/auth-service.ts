import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  integrationConnections,
  organizationMembers,
  organizations,
  passwordResetTokens,
  sessions,
  users,
} from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { generateOpaqueToken, sha256 } from "./tokens";
import { createSession } from "./session";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "workspace"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  const db = await getDb();
  const root = slugify(base);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${generateOpaqueToken(3).toLowerCase().replace(/[-_]/g, "").slice(0, 5)}`;
    const candidate = `${root}${suffix}`.slice(0, 80);
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (!existing[0]) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`.slice(0, 80);
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ organizationId: string; userId: string }> {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const slug = await uniqueSlug(input.organizationName);
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email,
      name: input.name.trim().slice(0, 160),
      passwordHash,
    });
    await tx.insert(organizations).values({
      id: organizationId,
      name: input.organizationName.trim().slice(0, 160),
      slug,
      baseCurrency: "INR",
      country: "IN",
    });
    await tx.insert(organizationMembers).values({
      organizationId,
      userId,
      role: "ADMIN",
      status: "ACTIVE",
      approvalLimitMinor: null,
      joinedAt: new Date(),
    });
    await tx.insert(integrationConnections).values([
      { organizationId, provider: "OPENAI", status: env.openaiKey ? "CONFIGURED" : "NOT_CONFIGURED", environment: "production" },
      { organizationId, provider: "PAYPAL", status: env.paypalClientId ? "CONFIGURED" : "NOT_CONFIGURED", environment: env.paypalEnv },
    ]);
  });

  await writeAudit({
    organizationId,
    actor: { type: "USER", id: userId, label: `${input.name} <${email}>` },
    action: "AUTH_REGISTER",
    entityType: "organization",
    entityId: organizationId,
    description: `Created the organization "${input.organizationName}" and the administrator account`,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  await createSession(userId, organizationId, {
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { organizationId, userId };
}

export async function authenticate(input: {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ userId: string; organizationId: string }> {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = rows[0];

  if (!user) {
    // Constant-ish work factor for unknown accounts.
    await verifyPassword(input.password, "scrypt$16384$8$1$c2FsdHNhbHQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    throw new UnauthorizedError("Invalid email or password");
  }
  if (user.disabled) {
    throw new ForbiddenError("This account has been disabled");
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new ForbiddenError("Account temporarily locked after repeated failed sign-ins. Try again later.");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db
      .update(users)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: lock,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const membership = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);
    if (membership[0]) {
      await writeAudit({
        organizationId: membership[0].organizationId,
        actor: { type: "USER", id: user.id, label: `${user.name} <${user.email}>` },
        action: "AUTH_LOGIN_FAILED",
        entityType: "user",
        entityId: user.id,
        description: "Failed sign-in attempt",
        ip: input.ip,
        userAgent: input.userAgent,
      });
    }
    throw new UnauthorizedError("Invalid email or password");
  }

  const activeMemberships = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId),
    )
    .where(
      and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.status, "ACTIVE"),
      ),
    )
    .orderBy(organizationMembers.createdAt);

  if (!activeMemberships[0]) {
    throw new ForbiddenError("Your account has no active organization membership");
  }

  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  const organizationId = activeMemberships[0].organizationId;
  await createSession(user.id, organizationId, {
    ip: input.ip,
    userAgent: input.userAgent,
  });
  await writeAudit({
    organizationId,
    actor: { type: "USER", id: user.id, label: `${user.name} <${user.email}>` },
    action: "AUTH_LOGIN",
    entityType: "user",
    entityId: user.id,
    description: "Signed in",
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { userId: user.id, organizationId };
}

export async function requestPasswordReset(emailInput: string): Promise<{
  devResetUrl?: string;
}> {
  const db = await getDb();
  const email = normalizeEmail(emailInput);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = rows[0];
  if (!user) return {};

  await db
    .delete(passwordResetTokens)
    .where(
      and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)),
    );

  const token = generateOpaqueToken(32);
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  const resetUrl = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  let delivered = false;
  try {
    const result = await sendEmail({
      to: user.email,
      subject: "Reset your ReconPay AI password",
      text: `Hello ${user.name},\n\nUse the link below to reset your password. It expires in 30 minutes.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    });
    delivered = result.delivered;
  } catch (error) {
    console.error("[auth] password reset email failed", error);
  }

  const membership = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);
  if (membership[0]) {
    await writeAudit({
      organizationId: membership[0].organizationId,
      actor: { type: "USER", id: user.id, label: `${user.name} <${user.email}>` },
      action: "AUTH_PASSWORD_RESET_REQUESTED",
      entityType: "user",
      entityId: user.id,
      description: "Password reset requested",
      metadata: { delivered },
    });
  }

  return env.isProduction ? {} : { devResetUrl: resetUrl };
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, sha256(input.token)),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .limit(1);
  const record = rows[0];
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("This reset link is invalid or has expired");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, record.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id));
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, record.userId), isNull(sessions.revokedAt)));
  });

  const userRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, record.userId))
    .limit(1);
  const membership = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, record.userId))
    .limit(1);
  if (userRows[0] && membership[0]) {
    await writeAudit({
      organizationId: membership[0].organizationId,
      actor: {
        type: "USER",
        id: userRows[0].id,
        label: `${userRows[0].name} <${userRows[0].email}>`,
      },
      action: "AUTH_PASSWORD_RESET",
      entityType: "user",
      entityId: userRows[0].id,
      description: "Password reset completed; all existing sessions revoked",
    });
  }
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  sessionId: string,
  organizationId: string,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw new UnauthorizedError();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ValidationError("Current password is incorrect");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, userId),
          ne(sessions.id, sessionId),
          isNull(sessions.revokedAt),
        ),
      );
  });
  await writeAudit({
    organizationId,
    actor: { type: "USER", id: userId, label: `${user.name} <${user.email}>` },
    action: "AUTH_PASSWORD_CHANGED",
    entityType: "user",
    entityId: userId,
    description: "Password changed; other sessions revoked",
  });
}

export async function countSessions(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
      ),
    );
  return rows[0]?.count ?? 0;
}
