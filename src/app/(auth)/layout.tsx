import Link from "next/link";
import { Brand } from "@/components/brand";
import { CheckCircle2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.05fr]">
      <div className="hidden flex-col justify-between bg-[var(--navy)] p-10 text-white lg:flex">
        <Brand tone="dark" subtitle="Financial operations" />
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            The reconciliation record your finance team can defend.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Exact arithmetic, human verification, deterministic rules, source evidence, and
            controlled settlement — in one auditable workflow.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-200">
            {[
              "Invoice extraction that never invents fields",
              "Three-way match with integer minor units",
              "Server-side roles and organization isolation",
              "Payments confirmed only by the provider",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-slate-400">
          ReconPay AI · Demo and production configuration are kept distinct.
        </p>
      </div>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 lg:hidden">
          <Brand subtitle="Financial operations" />
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-800">
            Back home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <div className="hidden border-t border-slate-100 px-5 py-3 text-center text-[11px] text-slate-400 lg:block">
          ReconPay AI · Financial operations software · All access is checked server-side
        </div>
      </div>
    </div>
  );
}
