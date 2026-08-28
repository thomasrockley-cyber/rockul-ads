import crypto from "node:crypto";

export const SESSION_COOKIE = "rockul_ads_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET!;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Token format: "<expiryEpochSeconds>.<hmacSignature>" — no session table
// needed for a single-password, single-user tool; the signature is all
// that's needed to trust the cookie wasn't forged or tampered with.
export function createSessionToken(): string {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = String(expiry);
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > Math.floor(Date.now() / 1000);
}

export function checkPassword(submitted: string): boolean {
  const real = process.env.ADMIN_PASSWORD ?? "";
  const submittedBuf = Buffer.from(submitted);
  const realBuf = Buffer.from(real);
  if (submittedBuf.length !== realBuf.length) return false;
  return crypto.timingSafeEqual(submittedBuf, realBuf);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
