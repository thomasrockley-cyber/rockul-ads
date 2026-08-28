import { createClient } from "@supabase/supabase-js";

// Service-role client — only ever used in server-side code (API routes,
// server components), never sent to the browser. This tool has no user
// accounts of its own (single shared password, see lib/auth.ts), so there's
// no per-user RLS to enforce — every authenticated request is "the owner".
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
