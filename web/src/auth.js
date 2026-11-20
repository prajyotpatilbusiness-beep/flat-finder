const PROJECT_URL = (import.meta.env.VITE_SUPABASE_URL || "https://smfcnhclacqombiolhjt.supabase.co").replace(/\/+$/, "");
// Supabase Publishable keys are designed for browser exposure; never use a secret/service_role key here.
const PUBLISHABLE_KEY = "sb_publishable_I0bLcPBehyCGxlq04b_eNQ_EbX8qzBb";
const sdk = typeof window !== "undefined" ? window.supabase : null;

export const authConfigured = Boolean(PROJECT_URL && PUBLISHABLE_KEY && typeof sdk?.createClient === "function");

export const authClient = authConfigured
  ? sdk.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
