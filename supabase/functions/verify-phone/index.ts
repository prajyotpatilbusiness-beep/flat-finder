import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID") ?? "";
const SITE_ORIGIN = "https://flat-finder-57f.pages.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validIndianPhone(value: string) {
  return /^\+91[6-9][0-9]{9}$/.test(value);
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function twilioAuthHeader() {
  return "Basic " + btoa(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN);
}

async function twilioPost(path: string, body: URLSearchParams) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("SMS_PROVIDER_NOT_CONFIGURED");
  }
  const response = await fetch(
    "https://verify.twilio.com/v2/Services/" +
      encodeURIComponent(TWILIO_VERIFY_SERVICE_SID) + path,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = String(payload?.code ?? "");
    console.error("Twilio Verify request failed", response.status, providerCode);
    if (response.status === 429) throw new Error("SMS_RATE_LIMITED");
    if (response.status === 400 && providerCode === "60200") throw new Error("INVALID_MOBILE_NUMBER");
    throw new Error("SMS_PROVIDER_REQUEST_FAILED");
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN && origin !== "http://localhost:5173") {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "SIGN_IN_REQUIRED" }, 401);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "SUPABASE_FUNCTION_CONFIG_MISSING" }, 503);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await userClient.auth.getUser();
  const user = userResult?.user;
  if (userError || !user) return json({ error: "INVALID_SESSION" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const action = String(input.action ?? "");
  const phone = String(input.phone ?? "");
  if (!validIndianPhone(phone)) return json({ error: "INVALID_INDIAN_MOBILE_NUMBER" }, 400);

  try {
    const phoneHash = await sha256(phone);
    const now = new Date();
    const nowIso = now.toISOString();

    if (action === "send") {
      const { data: existingProfile, error: profileError } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .not("phone_verified_at", "is", null)
        .neq("id", user.id)
        .maybeSingle();
      if (profileError) throw new Error("PHONE_OWNERSHIP_CHECK_FAILED");
      if (existingProfile) return json({ error: "MOBILE_ALREADY_REGISTERED" }, 409);

      const { data: reservationRows, error: reservationError } = await admin.rpc(
        "reserve_phone_otp_send",
        {
          p_user_id: user.id,
          p_phone_hash: phoneHash,
          p_phone_last_four: phone.slice(-4),
          p_now: nowIso,
        },
      );
      if (reservationError) {
        const reason = String(reservationError.message ?? "");
        if (reason.includes("OTP_PHONE_DAILY_LIMIT_REACHED")) {
          return json({ error: "OTP_PHONE_DAILY_LIMIT_REACHED" }, 429);
        }
        if (reason.includes("OTP_PHONE_COOLDOWN_ACTIVE")) {
          return json({ error: "OTP_PHONE_COOLDOWN_ACTIVE" }, 429);
        }
        if (reason.includes("OTP_DAILY_LIMIT_REACHED")) {
          return json({ error: "OTP_DAILY_LIMIT_REACHED" }, 429);
        }
        if (reason.includes("OTP_COOLDOWN_ACTIVE")) {
          return json({ error: "OTP_COOLDOWN_ACTIVE" }, 429);
        }
        throw new Error("OTP_RESERVATION_FAILED");
      }
      const request = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
      if (!request?.request_id) throw new Error("OTP_RESERVATION_FAILED");

      try {
        const body = new URLSearchParams({ To: phone, Channel: "sms" });
        await twilioPost("/Verifications", body);
      } catch (error) {
        await admin.from("phone_verification_requests")
          .update({ status: "failed" })
          .eq("id", request.request_id)
          .eq("user_id", user.id);
        throw error;
      }

      return json({
        success: true,
        requestId: request.request_id,
        phoneLastFour: phone.slice(-4),
        expiresInSeconds: 600,
        resendAfterSeconds: 60,
      });
    }

    if (action === "verify") {
      const code = String(input.code ?? "").replace(/\D/g, "");
      if (!/^\d{6}$/.test(code)) return json({ error: "INVALID_OTP_FORMAT" }, 400);

      const { data: attemptRows, error: attemptError } = await admin.rpc(
        "claim_phone_otp_attempt",
        {
          p_user_id: user.id,
          p_phone_hash: phoneHash,
          p_now: nowIso,
        },
      );
      if (attemptError) {
        const reason = String(attemptError.message ?? "");
        if (reason.includes("OTP_ATTEMPT_LIMIT_REACHED")) {
          return json({ error: "OTP_ATTEMPT_LIMIT_REACHED" }, 429);
        }
        if (reason.includes("OTP_EXPIRED_OR_NOT_FOUND")) {
          return json({ error: "OTP_EXPIRED_OR_NOT_FOUND" }, 400);
        }
        throw new Error("OTP_ATTEMPT_RESERVATION_FAILED");
      }
      const request = Array.isArray(attemptRows) ? attemptRows[0] : attemptRows;
      if (!request?.request_id) return json({ error: "OTP_EXPIRED_OR_NOT_FOUND" }, 400);

      const checkBody = new URLSearchParams({ To: phone, Code: code });
      let checked: Record<string, unknown>;
      try {
        checked = await twilioPost("/VerificationCheck", checkBody);
      } catch (error) {
        if (error instanceof Error && error.message === "SMS_PROVIDER_REQUEST_FAILED") {
          return json({ error: "OTP_NOT_APPROVED" }, 400);
        }
        throw error;
      }
      if (checked.status !== "approved") return json({ error: "OTP_NOT_APPROVED" }, 400);

      // Unique partial index prevents one number from being verified by two profiles.
      const verifiedAt = new Date().toISOString();
      const { data: profile, error: updateError } = await admin
        .from("profiles")
        .update({ phone, phone_verified_at: verifiedAt })
        .eq("id", user.id)
        .select("id,phone,phone_verified_at")
        .single();
      if (updateError) {
        console.error("Verified phone profile update failed", updateError.code ?? "unknown");
        return json({ error: "MOBILE_ALREADY_REGISTERED_OR_PROFILE_UPDATE_FAILED" }, 409);
      }

      await admin.from("phone_verification_requests")
        .update({ status: "verified", verified_at: verifiedAt })
        .eq("id", request.request_id)
        .eq("user_id", user.id);

      return json({
        success: true,
        verified: true,
        phoneLastFour: String(profile.phone).slice(-4),
        verifiedAt: profile.phone_verified_at,
      });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const messages: Record<string, string> = {
      SMS_PROVIDER_NOT_CONFIGURED: "SMS_PROVIDER_NOT_CONFIGURED",
      SMS_RATE_LIMITED: "SMS_RATE_LIMITED",
      OTP_COOLDOWN_ACTIVE: "OTP_COOLDOWN_ACTIVE",
      OTP_DAILY_LIMIT_REACHED: "OTP_DAILY_LIMIT_REACHED",
      OTP_PHONE_DAILY_LIMIT_REACHED: "OTP_PHONE_DAILY_LIMIT_REACHED",
      OTP_PHONE_COOLDOWN_ACTIVE: "OTP_PHONE_COOLDOWN_ACTIVE",
      PHONE_OWNERSHIP_CHECK_FAILED: "PHONE_OWNERSHIP_CHECK_FAILED",
      SMS_PROVIDER_REQUEST_FAILED: "SMS_PROVIDER_REQUEST_FAILED",
    };
    const publicError = messages[reason] ?? "PHONE_VERIFICATION_FAILED";
    const status = reason === "SMS_PROVIDER_NOT_CONFIGURED" ? 503
      : reason.includes("LIMIT") || reason.includes("COOLDOWN") ? 429
      : 400;
    if (reason === "SMS_PROVIDER_NOT_CONFIGURED") {
      return json({
        error: publicError,
        message: "Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID in Supabase Edge Function secrets.",
      }, status);
    }
    console.error("Phone verification failed", reason);
    return json({ error: publicError }, status);
  }
});
