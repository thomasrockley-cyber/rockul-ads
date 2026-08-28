import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Lazy, same reasoning as every other external-client init in this
// codebase — calling neon() eagerly at module load throws immediately if
// DATABASE_URL isn't set, which breaks `next build` (it imports route
// modules to collect their metadata) before real env vars exist.
let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export interface Campaign {
  id: string;
  slot_number: number;
  company_name: string;
  image_url: string | null;
  link_url: string | null;
  subject: string;
  from_name: string;
  schedule_frequency: "none" | "daily" | "weekly";
  schedule_time: string;
  schedule_day_of_week: number | null;
  active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recipient {
  id: string;
  campaign_id: string;
  email: string;
  unsubscribed_at: string | null;
  created_at: string;
}

export interface SendLogEntry {
  id: string;
  campaign_id: string;
  sent_at: string;
  recipient_count: number;
  status: "sent" | "failed" | "partial";
  error: string | null;
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  const rows = await getSql()`SELECT * FROM campaigns ORDER BY slot_number ASC`;
  return rows as Campaign[];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const rows = await getSql()`SELECT * FROM campaigns WHERE id = ${id}`;
  return (rows[0] as Campaign) ?? null;
}

export async function getDueCampaigns(): Promise<Campaign[]> {
  const rows = await getSql()`
    SELECT * FROM campaigns
    WHERE active = true
      AND schedule_frequency != 'none'
      AND next_send_at IS NOT NULL
      AND next_send_at <= now()
  `;
  return rows as Campaign[];
}

// Always writes every column — the caller merges any partial changes onto
// the current row first, so this stays a plain fixed-shape query rather
// than needing dynamic SQL text (which would otherwise be needed to tell
// "field not provided" apart from "field explicitly set to null", e.g. for
// schedule_day_of_week when switching away from weekly).
export async function updateCampaign(
  id: string,
  fields: Pick<
    Campaign,
    | "company_name"
    | "subject"
    | "from_name"
    | "link_url"
    | "schedule_frequency"
    | "schedule_time"
    | "schedule_day_of_week"
    | "active"
    | "next_send_at"
  >
): Promise<Campaign> {
  const rows = await getSql()`
    UPDATE campaigns SET
      company_name = ${fields.company_name},
      subject = ${fields.subject},
      from_name = ${fields.from_name},
      link_url = ${fields.link_url},
      schedule_frequency = ${fields.schedule_frequency},
      schedule_time = ${fields.schedule_time},
      schedule_day_of_week = ${fields.schedule_day_of_week},
      active = ${fields.active},
      next_send_at = ${fields.next_send_at},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] as Campaign;
}

export async function setCampaignImage(id: string, imageUrl: string): Promise<void> {
  await getSql()`UPDATE campaigns SET image_url = ${imageUrl}, updated_at = now() WHERE id = ${id}`;
}

export async function markSent(id: string, nextSendAt: string | null): Promise<void> {
  await getSql()`
    UPDATE campaigns SET last_sent_at = now(), next_send_at = ${nextSendAt}
    WHERE id = ${id}
  `;
}

export async function listRecipients(campaignId: string): Promise<Recipient[]> {
  const rows = await getSql()`
    SELECT * FROM recipients WHERE campaign_id = ${campaignId} ORDER BY created_at DESC
  `;
  return rows as Recipient[];
}

export async function countActiveRecipients(campaignId: string): Promise<number> {
  const rows = await getSql()`
    SELECT count(*)::int AS count FROM recipients
    WHERE campaign_id = ${campaignId} AND unsubscribed_at IS NULL
  `;
  return (rows[0]?.count as number) ?? 0;
}

export async function getActiveRecipientEmails(campaignId: string): Promise<string[]> {
  const rows = await getSql()`
    SELECT email FROM recipients WHERE campaign_id = ${campaignId} AND unsubscribed_at IS NULL
  `;
  return rows.map((r) => r.email as string);
}

// Re-pasting a list that includes someone already unsubscribed does NOT
// re-subscribe them — ON CONFLICT DO NOTHING leaves their existing row,
// unsubscribed_at included, untouched.
export async function addRecipients(campaignId: string, emails: string[]): Promise<number> {
  if (emails.length === 0) return 0;
  const rows = await getSql()`
    INSERT INTO recipients (campaign_id, email)
    SELECT ${campaignId}, unnest(${emails}::text[])
    ON CONFLICT (campaign_id, email) DO NOTHING
    RETURNING id
  `;
  return rows.length;
}

export async function removeRecipient(recipientId: string, campaignId: string): Promise<void> {
  await getSql()`DELETE FROM recipients WHERE id = ${recipientId} AND campaign_id = ${campaignId}`;
}

export async function markUnsubscribed(campaignId: string, email: string): Promise<void> {
  await getSql()`
    UPDATE recipients SET unsubscribed_at = now()
    WHERE campaign_id = ${campaignId} AND email = ${email}
  `;
}

export async function insertSendLog(entry: {
  campaignId: string;
  recipientCount: number;
  status: "sent" | "failed" | "partial";
  error: string | null;
}): Promise<void> {
  await getSql()`
    INSERT INTO send_log (campaign_id, recipient_count, status, error)
    VALUES (${entry.campaignId}, ${entry.recipientCount}, ${entry.status}, ${entry.error})
  `;
}

export async function listSendLog(campaignId: string, limit: number): Promise<SendLogEntry[]> {
  const rows = await getSql()`
    SELECT * FROM send_log WHERE campaign_id = ${campaignId}
    ORDER BY sent_at DESC LIMIT ${limit}
  `;
  return rows as SendLogEntry[];
}
