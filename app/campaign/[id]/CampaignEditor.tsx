"use client";

import { useState, useRef } from "react";

interface Campaign {
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
}

interface Recipient {
  id: string;
  email: string;
  unsubscribed_at: string | null;
  created_at: string;
}

interface SendLogEntry {
  id: string;
  sent_at: string;
  recipient_count: number;
  status: "sent" | "failed" | "partial";
  error: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const inputClass =
  "rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500";

export default function CampaignEditor({
  campaign,
  initialRecipients,
  initialSendLog,
}: {
  campaign: Campaign;
  initialRecipients: Recipient[];
  initialSendLog: SendLogEntry[];
}) {
  const [companyName, setCompanyName] = useState(campaign.company_name);
  const [subject, setSubject] = useState(campaign.subject);
  const [fromName, setFromName] = useState(campaign.from_name);
  const [linkUrl, setLinkUrl] = useState(campaign.link_url ?? "");
  const [imageUrl, setImageUrl] = useState(campaign.image_url);
  const [frequency, setFrequency] = useState(campaign.schedule_frequency);
  const [scheduleTime, setScheduleTime] = useState(campaign.schedule_time?.slice(0, 5) ?? "09:00");
  const [dayOfWeek, setDayOfWeek] = useState<number>(campaign.schedule_day_of_week ?? new Date().getDay());
  const [active, setActive] = useState(campaign.active);

  const [recipients, setRecipients] = useState(initialRecipients);
  const [pasteText, setPasteText] = useState("");
  const [sendLog, setSendLog] = useState(initialSendLog);

  const [savingDetails, setSavingDetails] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingRecipients, setAddingRecipients] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeRecipientCount = recipients.filter((r) => !r.unsubscribed_at).length;

  async function saveDetails() {
    setSavingDetails(true);
    setMessage(null);
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName, subject, from_name: fromName, link_url: linkUrl }),
    });
    setSavingDetails(false);
    setMessage(res.ok ? "Saved." : "Failed to save.");
  }

  async function saveSchedule(overrides: Partial<{ frequency: string; active: boolean }> = {}) {
    setSavingSchedule(true);
    setMessage(null);
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_frequency: overrides.frequency ?? frequency,
        schedule_time: `${scheduleTime}:00`,
        schedule_day_of_week: frequency === "weekly" ? dayOfWeek : null,
        active: overrides.active ?? active,
      }),
    });
    setSavingSchedule(false);
    setMessage(res.ok ? "Schedule saved." : "Failed to save schedule.");
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/campaigns/${campaign.id}/image`, { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setMessage(data.error ?? "Upload failed.");
      return;
    }
    setImageUrl(data.image_url);
  }

  async function addRecipients() {
    if (!pasteText.trim()) return;
    setAddingRecipients(true);
    setMessage(null);
    const res = await fetch(`/api/campaigns/${campaign.id}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pasteText }),
    });
    const data = await res.json();
    setAddingRecipients(false);
    if (!res.ok) {
      setMessage(data.error ?? "Failed to add recipients.");
      return;
    }
    setPasteText("");
    setMessage(
      `Added ${data.added} address${data.added === 1 ? "" : "es"}.${
        data.invalidCount ? ` Skipped ${data.invalidCount} invalid.` : ""
      }`
    );
    const listRes = await fetch(`/api/campaigns/${campaign.id}/recipients`);
    const listData = await listRes.json();
    setRecipients(listData.recipients ?? []);
  }

  async function removeRecipient(recipientId: string) {
    setRecipients((r) => r.filter((x) => x.id !== recipientId));
    await fetch(`/api/campaigns/${campaign.id}/recipients`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId }),
    });
  }

  // A single call caps out at whatever fits in one ~50s serverless
  // invocation (see lib/sendCampaign.ts). For a bigger list, the API
  // returns done:false and this keeps calling the same endpoint — each
  // call resumes exactly where the last one left off, so nobody gets
  // double-emailed — until it comes back done:true.
  async function sendNow() {
    if (!confirm(`Send this ad to ${activeRecipientCount} recipient(s) right now?`)) return;
    setSending(true);
    setMessage(null);

    let totalSent = 0;
    let totalFailed = 0;

    while (true) {
      const res = await fetch(`/api/campaigns/${campaign.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSending(false);
        setMessage(data.error ?? "Send failed.");
        return;
      }
      totalSent += data.sent;
      totalFailed += data.failed;
      if (data.done) break;
      setMessage(`Sending… ${totalSent} sent so far, ${data.pending} left. Keep this tab open.`);
    }

    setSending(false);
    setMessage(`Sent to ${totalSent}, failed ${totalFailed}.`);
    setSendLog((prev) => [
      { id: crypto.randomUUID(), sent_at: new Date().toISOString(), recipient_count: totalSent, status: totalFailed > 0 ? "partial" : "sent", error: null },
      ...prev,
    ]);
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Slot {campaign.slot_number}</p>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          onBlur={saveDetails}
          placeholder="Company name"
          className={`${inputClass} w-full text-lg font-semibold`}
        />
      </div>

      {/* Ad image */}
      <div>
        <p className="mb-2 text-sm font-medium">Ad image</p>
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-xs text-neutral-500">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              "None"
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:border-neutral-500 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
            </button>
          </div>
        </div>
      </div>

      {/* Subject / from name */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Subject line
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onBlur={saveDetails}
            placeholder="e.g. This week's offer"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          &quot;From&quot; name (shown to recipients)
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            onBlur={saveDetails}
            placeholder={companyName || "Company name"}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Website link (adds a &quot;Click here to visit website&quot; button to the email — optional)
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onBlur={saveDetails}
            placeholder="example.com"
            className={inputClass}
          />
        </label>
        {savingDetails && <p className="text-xs text-neutral-500">Saving…</p>}
      </div>

      {/* Recipients */}
      <div>
        <p className="mb-2 text-sm font-medium">
          Recipients — {activeRecipientCount} active
          {recipients.length !== activeRecipientCount ? ` (${recipients.length - activeRecipientCount} unsubscribed)` : ""}
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste email addresses — one per line, or separated by commas/spaces"
          rows={4}
          className={`${inputClass} w-full font-mono text-xs`}
        />
        <button
          onClick={addRecipients}
          disabled={addingRecipients || !pasteText.trim()}
          className="mt-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:border-neutral-500 disabled:opacity-50"
        >
          {addingRecipients ? "Adding…" : "Add to list"}
        </button>

        {recipients.length > 0 && (
          <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-neutral-800">
            {recipients.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-sm last:border-0"
              >
                <span className={r.unsubscribed_at ? "text-neutral-600 line-through" : ""}>{r.email}</span>
                <button
                  onClick={() => removeRecipient(r.id)}
                  className="text-xs text-neutral-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule */}
      <div>
        <p className="mb-2 text-sm font-medium">Schedule</p>
        <div className="flex flex-col gap-3">
          <select
            value={frequency}
            onChange={(e) => {
              const v = e.target.value as Campaign["schedule_frequency"];
              setFrequency(v);
              saveSchedule({ frequency: v });
            }}
            className={inputClass}
          >
            <option value="none">Manual send only</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>

          {frequency !== "none" && (
            <>
              <div className="flex items-center gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Time (UK)
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    onBlur={() => saveSchedule()}
                    className={inputClass}
                  />
                </label>
                {frequency === "weekly" && (
                  <label className="flex flex-col gap-1 text-sm">
                    Day
                    <select
                      value={dayOfWeek}
                      onChange={(e) => {
                        setDayOfWeek(Number(e.target.value));
                        saveSchedule();
                      }}
                      className={inputClass}
                    >
                      {DAYS.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => {
                    setActive(e.target.checked);
                    saveSchedule({ active: e.target.checked });
                  }}
                />
                Auto-sending on
              </label>
              <p className="text-xs text-neutral-500">
                Checked once daily — exact send time may lag your chosen time by
                a few hours depending on when that check runs.
              </p>
            </>
          )}
          {savingSchedule && <p className="text-xs text-neutral-500">Saving…</p>}
        </div>
      </div>

      {/* Send now */}
      <div>
        <button
          onClick={sendNow}
          disabled={sending || !imageUrl || !subject || activeRecipientCount === 0}
          className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-40"
        >
          {sending ? "Sending…" : `Send now to ${activeRecipientCount}`}
        </button>
        {(!imageUrl || !subject || activeRecipientCount === 0) && (
          <p className="mt-1 text-xs text-neutral-500">
            Needs an image, a subject line, and at least one recipient.
          </p>
        )}
      </div>

      {message && <p className="text-sm text-neutral-300">{message}</p>}

      {/* Send history */}
      {sendLog.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Send history</p>
          <div className="flex flex-col gap-1">
            {sendLog.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-xs text-neutral-500">
                <span>{new Date(entry.sent_at).toLocaleString("en-GB")}</span>
                <span>
                  {entry.status} · {entry.recipient_count} sent
                  {entry.error ? ` · ${entry.error}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
