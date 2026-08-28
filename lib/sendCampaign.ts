import {
  getCampaign,
  getActiveRecipientEmails,
  getInProgressAttempt,
  createAttempt,
  getPendingAttemptRecipients,
  markAttemptRecipientsResult,
  countAttemptProgress,
  completeAttempt,
  insertSendLog,
  markSent,
} from "./db";
import { sendCampaignToRecipients } from "./email";
import { computeNextSendAt } from "./schedule";

// 60s is the max Vercel function duration on the Hobby plan (see the two
// route files that set maxDuration=60). Leaving a chunky margin for the
// final DB writes, the response, and one slow chunk that was already
// in-flight when the deadline was checked.
export const BUDGET_MS = 50_000;

// Fetched (and inserted into send_attempt_recipients) in batches this size
// per DB round trip, each internally sub-chunked to 8-at-a-time concurrent
// sends by sendCampaignToRecipients — this number just bounds one query's
// result set, not the send concurrency itself.
const FETCH_BATCH_SIZE = 500;

export type SendResult =
  | { ok: true; done: true; sent: number; failed: number }
  | { ok: true; done: false; sent: number; failed: number; pending: number }
  | { ok: false; error: string };

// Resumable: call this again with the same campaignId and it picks up
// exactly where the last call left off, rather than starting over or
// re-emailing anyone already sent to. See migrations/0001_init.sql's
// send_attempts/send_attempt_recipients comment for the full design.
//
// `deadline` defaults to a fresh BUDGET_MS window for a single-campaign
// call (the manual send route). The cron route processes up to 5 campaigns
// in one invocation and must instead pass ONE shared deadline computed
// once at the start of its run — otherwise each campaign would get its own
// fresh 50s budget and the batch could blow well past the outer function's
// own 60s hard limit.
export async function sendCampaignNow(campaignId: string, deadline = Date.now() + BUDGET_MS): Promise<SendResult> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found" };
  if (!campaign.image_url) return { ok: false, error: "No ad image uploaded for this campaign" };
  if (!campaign.subject) return { ok: false, error: "No subject line set for this campaign" };

  let attempt = await getInProgressAttempt(campaignId);
  if (!attempt) {
    const recipients = await getActiveRecipientEmails(campaignId);
    if (recipients.length === 0) return { ok: false, error: "No recipients to send to" };
    attempt = await createAttempt(campaignId, recipients);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let invocationSent = 0;
  let invocationFailed = 0;

  try {
    while (Date.now() < deadline) {
      const pending = await getPendingAttemptRecipients(attempt.id, FETCH_BATCH_SIZE);
      if (pending.length === 0) break;

      const { successEmails, failedEmails } = await sendCampaignToRecipients({
        campaignId,
        companyName: campaign.company_name || "Ad",
        fromName: campaign.from_name,
        subject: campaign.subject,
        imageUrl: campaign.image_url,
        linkUrl: campaign.link_url,
        recipients: pending,
        siteUrl,
        deadline,
      });
      await markAttemptRecipientsResult(attempt.id, successEmails, failedEmails);
      invocationSent += successEmails.length;
      invocationFailed += failedEmails.length;

      // Fewer results than requested means the deadline was hit mid-batch —
      // no point looping again to immediately hit the same deadline check.
      if (successEmails.length + failedEmails.length < pending.length) break;
    }
  } catch (err) {
    // Attempt stays in_progress (not marked completed) so the next call
    // retries the remaining pending recipients rather than losing the job.
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }

  const progress = await countAttemptProgress(attempt.id);

  if (progress.pending > 0) {
    return { ok: true, done: false, sent: invocationSent, failed: invocationFailed, pending: progress.pending };
  }

  await completeAttempt(attempt.id);
  await insertSendLog({
    campaignId,
    recipientCount: progress.sent,
    status: progress.failed === 0 ? "sent" : progress.sent === 0 ? "failed" : "partial",
    error: null,
  });

  const nextSendAt =
    campaign.schedule_frequency === "none"
      ? null
      : computeNextSendAt(campaign.schedule_frequency, campaign.schedule_time, campaign.schedule_day_of_week);
  await markSent(campaignId, nextSendAt);

  return { ok: true, done: true, sent: progress.sent, failed: progress.failed };
}
