"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { navigationForRole } from "./nav";
import { cn, initials } from "@/lib/ui";
import { apiFetch } from "@/lib/client-api";
import { useToast } from "@/components/toast";

type Organization = { id: string; name: string; slug: string; role: string };

export function AppShell({
  user,
  organization,
  role,
  unread,
  organizations,
  isDemo,
  children,
}: {
  user: { name: string; email: string };
  organization: { id: string; name: string; slug: string; baseCurrency: string };
  role: string;
  unread: number;
  organizations: Organization[];
  isDemo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [orgMenu, setOrgMenu] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const orgRef = useRef<HTMLDivElement>(null);
  const navigation = navigationForRole(role);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenu(false);
    setOrgMenu(false);
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (userRef.current && !userRef.current.contains(event.target as Node)) setUserMenu(false);
      if (orgRef.current && !orgRef.current.contains(event.target as Node)) setOrgMenu(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST", body: "{}" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      toast({
        tone: "error",
        title: "Sign-out failed",
        description: error instanceof Error ? error.message : "Please retry.",
      });
    }
  }

  async function switchOrganization(id: string) {
    if (id === organization.id) {
      setOrgMenu(false);
      return;
    }
    try {
      await apiFetch("/api/auth/switch-organization", {
        method: "POST",
        body: JSON.stringify({ organizationId: id }),
      });
      setOrgMenu(false);
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast({
        tone: "error",
        title: "Could not switch organization",
        description: error instanceof Error ? error.message : "Please retry.",
      });
    }
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-[var(--navy)]">
      <div className="flex h-14 items-center justify-between border-b border-[var(--navy-border)] px-4">
        <Link href="/dashboard" aria-label="ReconPay AI dashboard">
          <Brand tone="dark" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-[var(--navy-border)] px-3 py-3">
        <div className="rounded-md border border-[var(--navy-border)] bg-[var(--navy-soft)] px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-white/10 text-[10px] font-semibold text-white">
              {initials(organization.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-white">{organization.name}</p>
              <p className="truncate text-[10px] text-slate-400">
                {organization.baseCurrency} · {role.replaceAll("_", " ").toLowerCase()}
              </p>
            </div>
            {isDemo ? (
              <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                DEMO
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <nav
        aria-label="Sidebar"
        className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3"
      >
        {navigation.map((section) => (
          <div key={section.label} className="mb-4">
            <p className="mb-1 px-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                        active
                          ? "bg-white/10 font-medium text-white"
                          : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          active ? "text-indigo-300" : "text-slate-400",
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--navy-border)] px-3 py-3">
        <div className="flex items-start gap-2 text-[10px] leading-4 text-slate-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <p>
            Server-side access control.
            <br />
            AI explains. Rules decide.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[272px] shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form action="/search" className="relative hidden max-w-sm flex-1 sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              placeholder="Search invoices, POs, settlements…"
              aria-label="Search"
              className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            {organizations.length > 1 ? (
              <div ref={orgRef} className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setOrgMenu((open) => !open)}
                  aria-expanded={orgMenu}
                  aria-haspopup="menu"
                  className="flex h-8 max-w-[190px] items-center gap-1.5 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  <span className="truncate">{organization.name}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {orgMenu ? (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                  >
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                      Switch organization
                    </p>
                    {organizations.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => switchOrganization(item.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50",
                          item.id === organization.id ? "font-medium text-slate-900" : "text-slate-600",
                        )}
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                          {item.role.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <Link
              href="/notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              className="relative flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--primary)] px-0.5 text-[9px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>

            <div ref={userRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenu((open) => !open)}
                aria-expanded={userMenu}
                aria-haspopup="menu"
                className="flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-slate-100"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[9px] font-semibold text-white">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-[120px] truncate text-[11px] font-medium text-slate-700 sm:block">
                  {user.name}
                </span>
                <ChevronDown className="hidden h-3 w-3 text-slate-400 sm:block" />
              </button>
              {userMenu ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                >
                  <div className="border-b border-slate-100 px-2 py-2">
                    <p className="truncate text-xs font-medium text-slate-900">{user.name}</p>
                    <p className="truncate text-[10px] text-slate-500">{user.email}</p>
                  </div>
                  <Link
                    href="/settings"
                    role="menuitem"
                    className="mt-1 flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Settings className="h-3.5 w-3.5" /> Account settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
