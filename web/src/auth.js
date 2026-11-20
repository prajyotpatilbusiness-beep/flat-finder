const PROJECT_URL = (import.meta.env.VITE_SUPABASE_URL || "https://smfcnhclacqombiolhjt.supabase.co").replace(/\/+$/, "");
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const sdk = typeof window !== "undefined" ? window.supabase : null;

// Only the public publishable key belongs in browser code. Never use a service_role key here.
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
