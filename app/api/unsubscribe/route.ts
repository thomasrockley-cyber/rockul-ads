import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

function htmlPage(message: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
    <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0a0a0a;color:#ededed">
      <p style="max-width:360px;text-align:center;padding:24px">${message}</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// Public — clicked directly from an email, no login. One-click unsubscribe
// per RFC 8058 / the List-Unsubscribe-Post header set on the send side.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return htmlPage("Invalid unsubscribe link.");

  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return htmlPage("Invalid or expired unsubscribe link.");

  const admin = createAdminClient();
  await admin
    .from("recipients")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("campaign_id", parsed.campaignId)
    .eq("email", parsed.email);

  return htmlPage(`You've been unsubscribed (${parsed.email}) and won't receive any more of these emails.`);
}

export async function POST(req: Request) {
  return GET(req);
}
