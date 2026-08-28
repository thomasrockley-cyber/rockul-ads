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
  // Several mail clients ignore the width:100% CSS on <img> and fall back to
  // its native pixel size — when that happens, only centering the container
  // (which was the whole bug: an image narrower than its container just
  // sits at the container's default left alignment) doesn't help. Fixed
  // three ways at once: an explicit HTML width attribute for clients that
  // honour that over CSS, max-width:100% so it still shrinks on narrow
  // screens, and margin:0 auto directly on the image itself so it centers
  // even when it renders at its native (narrower-than-container) width.
  const img = `<img src="${imageUrl}" alt="${companyName}" width="600" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border-radius:8px" />`;
  // The image itself is clickable when a link is set (common pattern), plus
  // an explicit button below it — some clients/screen readers don't make an
  // image's clickability obvious otherwise.
  const imageBlock = linkUrl ? `<a href="${linkUrl}" style="text-decoration:none">${img}</a>` : img;
  const button = linkUrl
    ? `
      <div style="text-align:center;margin:20px 0 0">
        <a href="${linkUrl}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600">Click here to visit website</a>
      </div>
    `
    : "";
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;text-align:center">
      ${imageBlock}
      ${button}
      <p style="font-size:11px;color:#888;text-align:center;margin:20px 0 0;line-height:1.6">
        You're receiving this because you gave ${companyName} permission to email you.
        <a href="${unsubscribeUrl}" style="color:#888">Unsubscribe</a> at any time.
      </p>
    </div>
  `.trim();
}

// 8 concurrent requests, then a pause before the next chunk — sized to stay
// safely under Resend's 10-requests/second limit on the free plan (8 in
// under a second, then a full second of headroom before the next burst,
// rather than firing every chunk back-to-back and bursting past it).
const CONCURRENCY = 8;
const CHUNK_DELAY_MS = 1000;

// Resend's rate limit and quota-exceeded responses aren't failures of the
// email address itself — retrying later should work fine. Treating them as
// permanent failures (the original bug here) would wrongly discard good
// recipients just because a burst of sends briefly exceeded 10 req/s.
const RETRIABLE_ERROR_NAMES = new Set(["rate_limit_exceeded", "daily_quota_exceeded", "monthly_quota_exceeded"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stops picking up new chunks once past this deadline, returning whatever's
// been processed so far — the caller (sendCampaign.ts) persists per-chunk
// progress and resumes the rest in a later invocation. Bounded per-recipient
// list in, per-recipient results out, rather than aggregate counts, so the
// caller can mark exactly who succeeded/failed in the database. Recipients
// hit by a retriable error appear in neither list — the caller leaves them
// pending rather than recording any result, so the next invocation retries
// them automatically rather than losing them.
export async function sendCampaignToRecipients(params: {
  campaignId: string;
  companyName: string;
  fromName: string;
  subject: string;
  imageUrl: string;
  linkUrl: string | null;
  recipients: string[];
  siteUrl: string;
  deadline: number; // Date.now()-comparable timestamp
}): Promise<{ successEmails: string[]; failedEmails: string[]; quotaExceeded: boolean }> {
  const { campaignId, companyName, fromName, subject, imageUrl, linkUrl, recipients, siteUrl, deadline } = params;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "ads@ads.rockul.com";
  const from = `${fromName || companyName} <${fromAddress}>`;

  const successEmails: string[] = [];
  const failedEmails: string[] = [];
  let quotaExceeded = false;

  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    if (Date.now() >= deadline || quotaExceeded) break;
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
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && !r.value.error) {
        successEmails.push(chunk[idx]);
        return;
      }
      const errorName = r.status === "fulfilled" ? r.value.error?.name : undefined;
      if (errorName && RETRIABLE_ERROR_NAMES.has(errorName)) {
        // Left out of both lists — stays pending, retried next time.
        if (errorName === "daily_quota_exceeded" || errorName === "monthly_quota_exceeded") {
          quotaExceeded = true; // no point burning through more chunks right now
        }
        return;
      }
      failedEmails.push(chunk[idx]); // genuinely bad address / permanent error
    });

    if (i + CONCURRENCY < recipients.length && Date.now() < deadline && !quotaExceeded) {
      await sleep(CHUNK_DELAY_MS);
    }
  }

  return { successEmails, failedEmails, quotaExceeded };
}
