import { Resend } from "resend";
import { createUnsubscribeToken } from "./unsubscribeToken";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

function emailHtml(params: {
  companyName: string;
  imageUrl: string;
  linkUrl: string | null;
  unsubscribeUrl: string;
}) {
  const { companyName, imageUrl, linkUrl, unsubscribeUrl } = params;
  const img = `<img src="${imageUrl}" alt="${companyName}" style="width:100%;height:auto;display:block;border-radius:8px" />`;
  // The image itself is clickable when a link is set (common pattern), plus
  // an explicit button below it — some clients/screen readers don't make an
  // image's clickability obvious otherwise.
  const imageBlock = linkUrl ? `<a href="${linkUrl}" style="text-decoration:none">${img}</a>` : img;
  const button = linkUrl
    ? `
      <div style="text-align:center;margin:20px 0 0">
        <a href="${linkUrl}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600">Visit website</a>
      </div>
    `
    : "";
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto">
      ${imageBlock}
      ${button}
      <p style="font-size:11px;color:#888;text-align:center;margin:20px 0 0;line-height:1.6">
        You're receiving this because you gave ${companyName} permission to email you.
        <a href="${unsubscribeUrl}" style="color:#888">Unsubscribe</a> at any time.
      </p>
    </div>
  `.trim();
}

// Sends to recipients in small concurrent batches rather than one at a time
// (slow) or all at once (risks hitting Resend's rate limit) or Resend's
// batch-send endpoint (its per-recipient personalisation is more limited,
// and this stays simple enough not to need it at this scale).
const CONCURRENCY = 8;

export async function sendCampaignToRecipients(params: {
  campaignId: string;
  companyName: string;
  fromName: string;
  subject: string;
  imageUrl: string;
  linkUrl: string | null;
  recipients: string[];
  siteUrl: string;
}): Promise<{ sent: number; failed: number }> {
  const { campaignId, companyName, fromName, subject, imageUrl, linkUrl, recipients, siteUrl } = params;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "ads@ads.rockul.com";
  const from = `${fromName || companyName} <${fromAddress}>`;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    const chunk = recipients.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((email) => {
        const token = createUnsubscribeToken(campaignId, email);
        const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
        return getResend().emails.send({
          from,
          to: email,
          subject,
          html: emailHtml({ companyName, imageUrl, linkUrl, unsubscribeUrl }),
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && !r.value.error) sent++;
      else failed++;
    }
  }

  return { sent, failed };
}
