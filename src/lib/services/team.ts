import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizationMembers, users, vendors } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/rbac";
import { actorFromContext, writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { hashPassword } from "@/lib/auth/password";
import { generateOpaqueToken, sha256 } from "@/lib/auth/tokens";
import { passwordResetTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { parseMoneyInput } from "@/lib/money";
import type { teamInviteSchema, teamUpdateSchema } from "@/lib/validation";
import type { z } from "zod";

export type TeamInviteInput = z.infer<typeof teamInviteSchema>;
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;

export async function listTeam(ctx: AuthContext) {
  requirePermission(ctx, "manage_team");
  const db = await getDb();
  const rows = await db
    .select({
      member: organizationMembers,
      userName: users.name,
      userEmail: users.email,
      lastLoginAt: users.lastLoginAt,
      vendorName: vendors.name,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .leftJoin(vendors, eq(vendors.id, organizationMembers.vendorId))
    .where(eq(organizationMembers.organizationId, ctx.organization.id))
    .orderBy(organizationMembers.createdAt);
  const activeAdmins = rows.filter(
    (row) => row.member.role === "ADMIN" && row.member.status === "ACTIVE",
  ).length;
  return { members: rows, activeAdmins };
}

async function countOtherActiveAdmins(organizationId: string, excludeMemberId: string) {
  const db = await getDb();
  const rows = await db
    .select({ total: count() })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.role, "ADMIN"),
        eq(organizationMembers.status, "ACTIVE"),
      ),
    );
  const memberships = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.role, "ADMIN"),
        eq(organizationMembers.status, "ACTIVE"),
      ),
    );
  return Math.max(0, (rows[0]?.total ?? 0) - (memberships.some((m) => m.id === excludeMemberId) ? 1 : 0));
}

export async function inviteTeamMember(
  ctx: AuthContext,
  input: TeamInviteInput,
): Promise<{ memberId: string; invitationSent: boolean; devSetPasswordUrl?: string }> {
  requirePermission(ctx, "manage_team");
  if (ctx.membership.role !== "ADMIN") {
    throw new ForbiddenError("Only administrators can invite team members");
  }
  const db = await getDb();
  if (input.role === "VENDOR") {
    if (!input.vendorId) throw new ValidationError("Select a vendor for this membership");
    const vendorRows = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!vendorRows[0]) throw new ValidationError("Vendor not found");
  }
  const approvalLimitMinor =
    input.role === "FINANCE_MANAGER" && input.approvalLimit
      ? parseMoneyInput(input.approvalLimit, "approval limit")
      : null;

  const existingUserRows = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  let user = existingUserRows[0];
  let createdUser = false;
  let resetToken: string | null = null;

  if (user) {
    const membership = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, ctx.organization.id),
          eq(organizationMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (membership[0]) {
      throw new ConflictError("This person is already a member of the organization");
    }
  } else {
    const temporaryPassword = generateOpaqueToken(32);
    const passwordHash = await hashPassword(temporaryPassword);
    const inserted = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash,
      })
      .returning();
    user = inserted[0]!;
    createdUser = true;
    resetToken = generateOpaqueToken(32);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(resetToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  const insertedMember = await db
    .insert(organizationMembers)
    .values({
      organizationId: ctx.organization.id,
      userId: user.id,
      role: input.role,
      status: "ACTIVE",
      vendorId: input.role === "VENDOR" ? input.vendorId : null,
      approvalLimitMinor,
      invitedBy: ctx.user.id,
      joinedAt: new Date(),
    })
    .returning();
  const member = insertedMember[0]!;

  let invitationSent = false;
  let devSetPasswordUrl: string | undefined;
  try {
    if (createdUser && resetToken) {
      const url = `${env.appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
      if (!env.isProduction) devSetPasswordUrl = url;
      const email = await sendEmail({
        to: user.email,
        subject: `You have been invited to ${ctx.organization.name} on ReconPay AI`,
        text: `Hello ${user.name},\n\n${ctx.user.name} invited you to ${ctx.organization.name} as ${input.role.replaceAll("_", " ").toLowerCase()}.\n\nSet your password using this link (valid for 7 days):\n${url}\n\nIf you were not expecting this invitation, contact the organization administrator.`,
      });
      invitationSent = email.delivered;
    } else {
      const email = await sendEmail({
        to: user.email,
        subject: `You were added to ${ctx.organization.name} on ReconPay AI`,
        text: `Hello ${user.name},\n\n${ctx.user.name} added you to ${ctx.organization.name} as ${input.role.replaceAll("_", " ").toLowerCase()}. Sign in with your existing ReconPay account.\n\n${env.appUrl}/login`,
      });
      invitationSent = email.delivered;
    }
  } catch (error) {
    console.error("[team] invitation email failed", error);
  }

  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "TEAM_MEMBER_INVITED",
    entityType: "organization_member",
    entityId: member.id,
    description: `Invited ${user.name} <${user.email}> as ${input.role}`,
    metadata: {
      role: input.role,
      vendorId: input.vendorId,
      approvalLimitMinor: approvalLimitMinor?.toString() ?? null,
      invitationSent,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  await notify({
    organizationId: ctx.organization.id,
    type: "INFO",
    title: `New team member: ${user.name}`,
    body: `${ctx.user.name} added ${user.name} as ${input.role.replaceAll("_", " ").toLowerCase()}.`,
    entityType: "ORGANIZATION_MEMBER",
    entityId: member.id,
  });

  return { memberId: member.id, invitationSent, devSetPasswordUrl };
}

export async function updateTeamMember(
  ctx: AuthContext,
  memberId: string,
  input: TeamUpdateInput,
): Promise<void> {
  requirePermission(ctx, "manage_team");
  if (ctx.membership.role !== "ADMIN") {
    throw new ForbiddenError("Only administrators can change team members");
  }
  const db = await getDb();
  const rows = await db
    .select({ member: organizationMembers, userName: users.name, userEmail: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.id, memberId),
        eq(organizationMembers.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Team member");
  const member = row.member;
  if (
    member.userId === ctx.user.id &&
    (input.status === "SUSPENDED" || (input.role && input.role !== "ADMIN"))
  ) {
    throw new ForbiddenError("You cannot suspend or demote your own administrator account");
  }
  if (input.status === "SUSPENDED" && member.role === "ADMIN") {
    const otherAdmins = await countOtherActiveAdmins(ctx.organization.id, member.id);
    if (otherAdmins === 0) {
      throw new ConflictError("The organization must keep at least one active administrator");
    }
  }
  if (input.role && input.role !== "ADMIN" && member.role === "ADMIN") {
    const otherAdmins = await countOtherActiveAdmins(ctx.organization.id, member.id);
    if (otherAdmins === 0) {
      throw new ConflictError("The organization must keep at least one active administrator");
    }
  }
  if (input.role === "VENDOR" && !input.vendorId && !member.vendorId) {
    throw new ValidationError("A vendor membership must be linked to a vendor");
  }
  if (input.vendorId) {
    const vendorRows = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!vendorRows[0]) throw new ValidationError("Vendor not found");
  }
  const nextRole = input.role ?? member.role;
  const approvalLimitMinor =
    input.approvalLimit === undefined
      ? member.approvalLimitMinor
      : input.approvalLimit === null
        ? null
        : parseMoneyInput(input.approvalLimit, "approval limit");

  await db
    .update(organizationMembers)
    .set({
      role: nextRole,
      status: input.status ?? member.status,
      vendorId: nextRole === "VENDOR" ? (input.vendorId ?? member.vendorId) : null,
      approvalLimitMinor: nextRole === "FINANCE_MANAGER" ? approvalLimitMinor : null,
      updatedAt: new Date(),
    })
    .where(eq(organizationMembers.id, member.id));

  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "TEAM_MEMBER_UPDATED",
    entityType: "organization_member",
    entityId: member.id,
    description: `Updated team member ${row.userName} <${row.userEmail}>`,
    metadata: {
      previousRole: member.role,
      newRole: nextRole,
      previousStatus: member.status,
      newStatus: input.status ?? member.status,
      approvalLimitMinor: approvalLimitMinor?.toString() ?? null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export async function getTeamSummary(ctx: AuthContext) {
  requirePermission(ctx, "manage_team");
  const db = await getDb();
  const rows = await db
    .select({ status: organizationMembers.status, total: count() })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, ctx.organization.id))
    .groupBy(organizationMembers.status);
  return rows;
}
