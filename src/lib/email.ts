import { env } from "@/lib/env";

type EmailInput = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Email delivery abstraction. Without a configured provider we print the
 * message to the server log in development. Production deployments must set
 * RESEND_API_KEY; otherwise password-reset delivery is unavailable and the app
 * reports that clearly.
 */
export async function sendEmail(input: EmailInput): Promise<{ delivered: boolean; provider: string }> {
  if (!env.resendKey) {
    if (env.isProduction) {
      console.warn(
        `[email] Provider not configured; message to ${input.to} was not delivered.`,
      );
      return { delivered: false, provider: "none" };
    }
    console.info(
      `\n[email:console] To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`,
    );
    return { delivered: false, provider: "console" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email provider error (${response.status}): ${body.slice(0, 300)}`);
  }
  return { delivered: true, provider: "resend" };
}
