import {
  Building2,
  CheckCircle2,
  KeyRound,
  ServerCog,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { can, isVendor } from "@/lib/auth/rbac";
import { getOrganizationSettings } from "@/lib/services/settings";
import { formatDateTime } from "@/lib/ui";
import { PageHeader, DescriptionList } from "@/components/ui/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ChangePasswordForm, OrganizationSettingsForm } from "@/components/settings/settings-forms";
import { IntegrationTestButton } from "@/components/settings/integration-test-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireAppContext();
  const vendorView = isVendor(ctx);
  const canManageOrg = can(ctx, "manage_organization");
  const canManageIntegrations = can(ctx, "manage_integrations");
  const settings =
    canManageOrg || canManageIntegrations
      ? await getOrganizationSettings(ctx)
      : null;

  return (
    <div>
      <PageHeader
        title={vendorView ? "Account settings" : "Settings"}
        description={
          vendorView
            ? "Your membership and security settings. Organization configuration is managed by the buyer."
            : "Organization profile, integration truth, runtime configuration, and account security."
        }
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {ctx.membership.role.replaceAll("_", " ").toLowerCase()}
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {settings && canManageOrg ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Organization profile</CardTitle>
                  <CardDescription>
                    Name and base currency. Changing the base currency does not rewrite historical
                    records.
                  </CardDescription>
                </div>
                <Building2 className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <OrganizationSettingsForm
                  name={settings.organization.name}
                  baseCurrency={settings.organization.baseCurrency}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Account</CardTitle>
                <CardDescription>Your identity in this organization.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={2}
                items={[
                  { label: "Name", value: ctx.user.name },
                  { label: "Email", value: ctx.user.email },
                  {
                    label: "Organization",
                    value: ctx.organization.name,
                  },
                  {
                    label: "Role",
                    value: ctx.membership.role.replaceAll("_", " ").toLowerCase(),
                  },
                  {
                    label: "Vendor scope",
                    value: vendorView ? "Linked vendor only" : "Organization-wide",
                  },
                  {
                    label: "Approval limit",
                    value:
                      ctx.membership.approvalLimitMinor !== null
                        ? `${ctx.membership.approvalLimitMinor.toString()} minor units`
                        : "Not assigned",
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Change password</CardTitle>
                <CardDescription>
                  Passwords are hashed with scrypt. Other active sessions are revoked on change.
                </CardDescription>
              </div>
              <KeyRound className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          {settings && canManageIntegrations ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Integration connectivity</CardTitle>
                  <CardDescription>
                    Tests make real outbound requests. Missing credentials are reported as
                    NOT_CONFIGURED; no test pretends to succeed.
                  </CardDescription>
                </div>
                <ServerCog className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <ul className="divide-y divide-[var(--border)]">
                  {settings.integrations.map((integration) => (
                    <li key={integration.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-slate-900">
                              {integration.label}
                            </p>
                            <StatusBadge status={integration.status} />
                            <span className="text-[10px] text-slate-400">
                              {integration.environment}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {integration.provider === "OPENAI"
                              ? "Structured invoice extraction and evidence summaries. Falls back to a deterministic local parser when not configured."
                              : integration.provider === "PAYPAL"
                                ? "Sandbox orders, capture verification, and signed webhooks. Payments remain blocked when credentials are missing."
                                : "Private document storage. Local HMAC-signed storage is used when Supabase is not configured."}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            Status: {integration.status.replaceAll("_", " ").toLowerCase()}
                            {integration.lastCheckedAt
                              ? ` · checked ${formatDateTime(integration.lastCheckedAt)}`
                              : " · never checked"}
                          </p>
                          {integration.lastError ? (
                            <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                              {integration.lastError}
                            </p>
                          ) : null}
                        </div>
                        <IntegrationTestButton
                          provider={integration.provider}
                          configured={integration.status === "CONFIGURED" || integration.status === "CONNECTED"}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Security model</CardTitle>
                <CardDescription>Controls active in this deployment.</CardDescription>
              </div>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-[11px] leading-5 text-slate-600">
                {[
                  "Opaque, hashed session tokens in httpOnly cookies",
                  "Origin and CSRF checks on mutations",
                  "Server-side RBAC on every page and API route",
                  "Organization-scoped queries and membership checks",
                  "Rate limiting on authentication and sensitive actions",
                  "Immutable audit records for financial actions",
                  "Private evidence storage with expiring signed links",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800">
                Row-level security is not active with the custom authentication layer. Tenant
                isolation is enforced in application queries and covered by integration tests. See
                the security documentation before deploying a multi-tenant production environment.
              </p>
            </CardContent>
          </Card>

          {settings ? (
            <>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Runtime</CardTitle>
                    <CardDescription>Configuration visible to administrators.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <DescriptionList
                    columns={1}
                    items={[
                      { label: "Environment", value: settings.runtime.environment },
                      { label: "Application URL", value: settings.runtime.appUrl },
                      { label: "Demo mode", value: settings.runtime.demoMode ? "Enabled" : "Disabled" },
                      { label: "Database", value: settings.runtime.database ?? "external connection" },
                      { label: "AI", value: settings.ai.configured ? `Configured (${settings.ai.model})` : "Deterministic fallback" },
                      { label: "Storage", value: settings.storage.provider },
                      { label: "Members", value: settings.memberCount },
                      { label: "Vendors", value: settings.vendorCount },
                      { label: "Invoices", value: settings.invoiceCount },
                    ]}
                  />
                </CardContent>
              </Card>

              {settings.demoCredentials ? (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Demo accounts</CardTitle>
                      <CardDescription>
                        Shown only because this organization is labelled demo and DEMO_MODE is on.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-slate-100">
                      {settings.demoCredentials.map((user) => (
                        <li key={user.email} className="py-2">
                          <p className="text-[11px] font-medium text-slate-800">{user.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {user.email} · {user.role.replaceAll("_", " ").toLowerCase()}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-800">
                      Demo data is labeled and seeded. Do not reuse demo credentials in production.
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Need something changed?</CardTitle>
                  <CardDescription>Organization settings require administrator access.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-5 text-slate-600">
                  Contact your organization administrator for role, approval limit, vendor scope, or
                  integration changes.
                </p>
                <a
                  href="/dashboard"
                  className={buttonVariants({ variant: "secondary", size: "sm" }) + " mt-3"}
                >
                  Return to dashboard
                </a>
              </CardContent>
            </Card>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-500">
            <p className="flex items-center gap-1.5 font-medium text-slate-700">
              <XCircle className="h-3.5 w-3.5 text-slate-400" /> Honest status
            </p>
            <p className="mt-1">
              Integrations are reported as configured, connected, error, or not configured based on
              environment variables and real connectivity checks. The UI never claims a payment,
              extraction, or storage action succeeded without server confirmation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
