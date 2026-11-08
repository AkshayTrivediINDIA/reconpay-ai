import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth/session";
import { RegisterForm } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const ctx = await getAppContext();
  if (ctx) redirect("/dashboard");
  return <RegisterForm />;
}
