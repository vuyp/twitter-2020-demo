import nodemailer from 'nodemailer';
import { getServerEnv } from './env';

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

function getTransport(): ReturnType<typeof nodemailer.createTransport> {
  if (!transport) {
    const env = getServerEnv();
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
    });
  }
  return transport;
}

export async function sendAuthEmail(input: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
}): Promise<void> {
  const env = getServerEnv();
  await getTransport().sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: `${input.heading}\n\n${input.body}\n\n${input.actionUrl}`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f1419"><h1 style="font-size:24px">${escapeHtml(input.heading)}</h1><p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#1da1f2;color:white;padding:12px 20px;border-radius:9999px;text-decoration:none;font-weight:700">${escapeHtml(input.actionLabel)}</a></p><p style="font-size:13px;color:#657786;word-break:break-all">${escapeHtml(input.actionUrl)}</p></div>`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    return (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ??
      character
    );
  });
}
