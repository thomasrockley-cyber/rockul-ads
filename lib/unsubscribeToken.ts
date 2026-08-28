import crypto from "node:crypto";

// Signed, stateless unsubscribe links — no login needed to click one (the
// recipient isn't a user of this tool), just a valid signature tying a
// specific campaign+email pair together so a link can't be forged to
// unsubscribe someone else's address or the wrong campaign.
function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET!;
  return crypto.createHmac("sha256", secret).update(`unsub:${payload}`).digest("hex");
}

export function createUnsubscribeToken(campaignId: string, email: string): string {
  const payload = Buffer.from(`${campaignId}\n${email}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { campaignId: string; email: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const [campaignId, email] = decoded.split("\n");
  if (!campaignId || !email) return null;
  return { campaignId, email };
}
