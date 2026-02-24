/**
 * Envio de email via Resend API (fetch, compatível com Cloudflare Workers).
 * @see https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const USER_AGENT = "edgepress/1.0";

export type SendPasswordResetEmailOptions = {
  apiKey: string;
  from: string;
  to: string;
  url: string;
};

/**
 * Envia email de recuperação de senha via Resend.
 * Não faz throw; erros são apenas logados para não afetar timing da resposta.
 */
export async function sendPasswordResetEmail(options: SendPasswordResetEmailOptions): Promise<void> {
  const { apiKey, from, to, url } = options;
  const subject = "Redefinir sua senha";
  const html = `
    <p>Você solicitou a redefinição de senha.</p>
    <p>Clique no link abaixo para definir uma nova senha (válido por 1 hora):</p>
    <p><a href="${escapeHtml(url)}" style="word-break: break-all;">${escapeHtml(url)}</a></p>
    <p>Se você não solicitou isso, ignore este email.</p>
  `.trim();
  const text = `Redefinir sua senha\n\nAcesse o link abaixo para definir uma nova senha (válido por 1 hora):\n${url}\n\nSe você não solicitou isso, ignore este email.`;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Resend] Falha ao enviar email de recuperação de senha:", res.status, body);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
