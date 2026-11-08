import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The record may have been removed, or you may not have access to it. Organization
        boundaries are enforced on the server.
      </p>
      <Link href="/dashboard" className="mt-5 text-sm font-medium text-indigo-700 hover:underline">
        Return to dashboard
      </Link>
    </div>
  );
}
