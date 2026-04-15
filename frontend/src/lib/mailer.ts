/**
 * Email helper for invite setup links.
 *
 * D-01: Uses Resend SDK - no SMTP config.
 * D-02: Exposes only sendInviteEmail(to, setupUrl) - single responsibility.
 *
 * Server-only: Never import in browser/client components.
 * The Resend client requires RESEND_API_KEY and MAIL_FROM env vars.
 */
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends an account setup link to an invited user.
 *
 * @param to - The invited user's email address (must match their future BA account email)
 * @param setupUrl - The full invite acceptance URL including the one-time token
 * @throws Error if RESEND_API_KEY or MAIL_FROM is not set, or if Resend API returns an error
 */
export async function sendInviteEmail(to: string, setupUrl: string): Promise<void> {
  if (!process.env.MAIL_FROM) {
    throw new Error("MAIL_FROM environment variable is not set");
  }

  const { error } = await resend.emails.send({
    from: process.env.MAIL_FROM,
    to,
    subject: "You're invited - set up your Claims Workbench account",
    html: `
      <p>You have been invited to join the Claims Investigation Workbench.</p>
      <p>Follow this link to set up your account (expires in 7 days):</p>
      <p><a href="${setupUrl}">${setupUrl}</a></p>
      <p>If you did not expect this invitation, you can safely ignore this email.</p>
    `.trim(),
  });

  if (error) {
    throw new Error(`Failed to send invite email to ${to}: ${error.message}`);
  }
}
