import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calculator,
  CheckCircle2,
  FileSearch,
  Fingerprint,
  Landmark,
  LockKeyhole,
  ScanText,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { getAppContext } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { DEMO_USERS } from "@/lib/demo";

export const dynamic = "force-dynamic";

const workflow = [
  {
    icon: ScanText,
    title: "Capture",
    description:
      "Upload a PDF or image. Extraction is schema-validated and every field stays human-editable before use.",
  },
  {
    icon: Calculator,
    title: "Reconcile",
    description:
      "A deterministic three-way engine compares invoice, purchase order, and goods receipts using integer minor units.",
  },
  {
    icon: FileSearch,
    title: "Build evidence",
    description:
      "Source references, rule calculations, and an append-only timeline stay attached to every reconciliation run.",
  },
  {
    icon: Landmark,
    title: "Settle with control",
    description:
      "Approvals, segregation of duties, vendor acceptance, and PayPal sandbox capture are recorded, never assumed.",
  },
];

const controls = [
  {
    icon: Fingerprint,
    title: "Server-side authorization",
    description:
      "Every request resolves the session, active organization, role, and vendor scope on the server. The UI never grants access.",
  },
  {
    icon: ShieldCheck,
    title: "AI explains, rules decide",
    description:
      "The model may extract fields and summarize evidence. It cannot compute balances, choose outcomes, or move money.",
  },
  {
    icon: LockKeyhole,
    title: "Immutable financial trail",
    description:
      "Balances are stored as exact integers. Approval and payment events carry provider references and evidence timestamps.",
  },
  {
    icon: BadgeCheck,
    title: "No simulated success",
    description:
      "A payment is only marked paid after PayPal confirms the capture. Unconfigured integrations are labelled as such.",
  },
];

export default async function LandingPage() {
  const ctx = await getAppContext();
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Brand subtitle="Financial operations" />
          <nav aria-label="Primary" className="hidden items-center gap-6 text-sm md:flex">
            <a href="#workflow" className="text-slate-600 hover:text-slate-900">
              Workflow
            </a>
            <a href="#controls" className="text-slate-600 hover:text-slate-900">
              Controls
            </a>
            <a href="#demo" className="text-slate-600 hover:text-slate-900">
              Demo workspace
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {ctx ? (
              <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
                Open workspace
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Sign in
                </Link>
                <Link href="/register" className={buttonVariants({ size: "sm" })}>
                  Create workspace
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-200 bg-[#fbfcfd]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600">
                <Workflow className="h-3.5 w-3.5 text-indigo-600" />
                Invoice intelligence · Three-way match · Controlled settlement
              </p>
              <h1 className="mt-5 max-w-2xl text-[38px] font-semibold leading-[1.14] tracking-tight text-slate-950 sm:text-[46px]">
                See the gap between the invoice and the goods before money moves.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-600">
                ReconPay AI turns vendor invoices, purchase orders, and goods receipts into a
                reproducible reconciliation record — with exact arithmetic, source evidence,
                approval controls, and an honest payment trail.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href={ctx ? "/dashboard" : "/register"} className={buttonVariants({ size: "lg" })}>
                  {ctx ? "Open your workspace" : "Create a workspace"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className={buttonVariants({ variant: "secondary", size: "lg" })}
                >
                  Sign in to the demo
                </Link>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                No credit card. Demo data is clearly labelled. Credentials are server-side and
                never committed.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Reconciliation example</p>
                    <p className="text-[10px] text-slate-500">PO-2026-001 · ABC Office Supplies</p>
                  </div>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Needs review
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 px-2 py-3">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-500">Ordered</dt>
                  <dd className="numeric mt-1 text-lg font-semibold text-slate-900">100</dd>
                  <dd className="text-[10px] text-slate-500">chairs</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-3">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-500">Usable</dt>
                  <dd className="numeric mt-1 text-lg font-semibold text-slate-900">90</dd>
                  <dd className="text-[10px] text-slate-500">received</dd>
                </div>
                <div className="rounded-lg bg-amber-50 px-2 py-3">
                  <dt className="text-[10px] uppercase tracking-wide text-amber-700">Short</dt>
                  <dd className="numeric mt-1 text-lg font-semibold text-amber-800">10</dd>
                  <dd className="text-[10px] text-amber-700">units</dd>
                </div>
              </dl>
              <div className="mt-3 rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Invoice value</span>
                  <span className="numeric font-medium text-slate-900">₹5,00,000.00</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Potential quantity exposure</span>
                  <span className="numeric font-medium text-amber-700">₹50,000.00</span>
                </div>
                <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-500">
                  Flagged exposure is a review signal, not an amount owed. Source evidence is
                  attached to the run.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Deterministic · Integer minor units · Reproducible
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
            The operating workflow
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-slate-950">
            From an uncontrolled document to a reviewable financial decision.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((step, index) => (
              <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">0{index + 1}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="controls" className="border-y border-slate-200 bg-[#fbfcfd]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
              Control boundaries
            </p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-slate-950">
              Built for finance teams that need to defend the number.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {controls.map((control) => (
                <div key={control.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-600">
                    <control.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{control.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {control.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 lg:grid-cols-[1fr_0.9fr] lg:p-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
                Demo workspace
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Inspect a complete, seeded reconciliation.
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
                The demo organization is labelled as demo data and can be reset. It contains an
                exact quantity shortfall, a clean invoice, a price mismatch, and a USD settlement
                prepared for the PayPal sandbox flow.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/login" className={buttonVariants({ size: "sm" })}>
                  Sign in
                </Link>
                <Link href="/register" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Create your own workspace
                </Link>
              </div>
            </div>
            {env.demoMode ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-900">Demo credentials</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Seeded accounts. Do not use these credentials in production.
                </p>
                <ul className="mt-3 space-y-2">
                  {DEMO_USERS.map((user) => (
                    <li key={user.email} className="rounded-md border border-slate-200 bg-white p-2.5">
                      <p className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-800">
                        <span>{user.email}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {user.password}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{user.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                Demo mode is disabled. Create a workspace to begin, then configure the integrations
                in Settings.
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-5 text-[11px] text-slate-500 sm:flex-row sm:items-center">
          <Brand />
          <p>
            ReconPay AI · Financial operations software. Integration status is shown accurately
            in Settings.
          </p>
        </div>
      </footer>
    </div>
  );
}
