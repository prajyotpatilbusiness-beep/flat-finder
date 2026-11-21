import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const SITE_ORIGIN = "https://flat-finder-57f.pages.dev";

const PLANS: Record<string, { monthly: number; annual: number; contacts: number }> = {
  starter: { monthly: 199, annual: 1990, contacts: 5 },
  plus: { monthly: 499, annual: 4990, contacts: 15 },
  pro: { monthly: 999, annual: 9990, contacts: 50 },
};

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

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function razorpayRequest(path: string, init: RequestInit = {}) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Basic " + btoa(RAZORPAY_KEY_ID + ":" + RAZORPAY_KEY_SECRET));
  headers.set("Content-Type", "application/json");
  const response = await fetch("https://api.razorpay.com/v1" + path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Razorpay request failed", response.status, payload?.error?.code ?? "unknown");
    throw new Error("RAZORPAY_REQUEST_FAILED");
  }
  return payload;
}

function addPeriod(interval: "monthly" | "annual") {
  const end = new Date();
  if (interval === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end.toISOString();
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
  if (!user.phone_confirmed_at) return json({ error: "PHONE_VERIFICATION_REQUIRED" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  try {
    if (body.action === "create-order") {
      const planId = String(body.planId ?? "");
      const interval = body.interval === "annual" ? "annual" : "monthly";
      const plan = PLANS[planId];
      if (!plan) return json({ error: "INVALID_PLAN" }, 400);

      const rupees = plan[interval];
      const order = await razorpayRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: rupees * 100,
          currency: "INR",
          receipt: ("ff-" + user.id.replace(/-/g, "").slice(0, 10) + "-" + crypto.randomUUID().slice(0, 8)).slice(0, 40),
          notes: {
            user_id: user.id,
            plan_id: planId,
            billing_interval: interval,
            contacts_limit: String(plan.contacts),
          },
        }),
      });
      return json({
        keyId: RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        planId,
        interval,
        contacts: plan.contacts,
      });
    }

    if (body.action === "verify-payment") {
      const orderId = String(body.razorpay_order_id ?? "");
      const paymentId = String(body.razorpay_payment_id ?? "");
      const signature = String(body.razorpay_signature ?? "");
      if (!orderId || !paymentId || !signature) return json({ error: "PAYMENT_DETAILS_MISSING" }, 400);

      const signingKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(RAZORPAY_KEY_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signatureBytes = await crypto.subtle.sign(
        "HMAC",
        signingKey,
        new TextEncoder().encode(orderId + "|" + paymentId),
      );
      const expectedSignature = Array.from(new Uint8Array(signatureBytes), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");

      if (!safeEqual(expectedSignature, signature)) return json({ error: "INVALID_PAYMENT_SIGNATURE" }, 400);

      const order = await razorpayRequest("/orders/" + encodeURIComponent(orderId));
      const payment = await razorpayRequest("/payments/" + encodeURIComponent(paymentId));
      if (order?.notes?.user_id !== user.id) return json({ error: "ORDER_USER_MISMATCH" }, 403);
      if (payment?.order_id !== orderId || payment?.status !== "captured" || payment?.captured !== true) {
        return json({ error: "PAYMENT_NOT_CAPTURED" }, 400);
      }
      if (payment?.amount !== order?.amount || payment?.currency !== "INR" || order?.currency !== "INR") {
        return json({ error: "PAYMENT_AMOUNT_MISMATCH" }, 400);
      }

      const planId = String(order?.notes?.plan_id ?? "");
      const interval = order?.notes?.billing_interval === "annual" ? "annual" : "monthly";
      const plan = PLANS[planId];
      if (!plan || order?.notes?.contacts_limit !== String(plan.contacts)) {
        return json({ error: "INVALID_ORDER_PLAN" }, 400);
      }

      const { data: existing } = await admin
        .from("subscriptions")
        .select("id,plan_id,status,current_period_end")
        .eq("provider_payment_id", paymentId)
        .maybeSingle();
      if (existing) return json({ success: true, subscription: existing, duplicate: true });

      const { data: subscription, error: subscriptionError } = await admin
        .from("subscriptions")
        .insert({
          user_id: user.id,
          plan_id: planId,
          billing_interval: interval,
          provider: "razorpay",
          provider_order_id: orderId,
          provider_payment_id: paymentId,
          status: "active",
          current_period_end: addPeriod(interval),
        })
        .select("id,plan_id,status,billing_interval,current_period_end")
        .single();
      if (subscriptionError) {
        console.error("Subscription insert failed", subscriptionError.code ?? "unknown");
        return json({ error: "SUBSCRIPTION_ACTIVATION_FAILED" }, 500);
      }

      const { error: eventError } = await admin.from("payment_events").insert({
        provider_event_id: paymentId,
        event_type: "payment.captured",
        payment_id: paymentId,
        subscription_id: subscription.id,
        amount_inr: Number(payment.amount) / 100,
        currency: "INR",
        status: "captured",
        processed_at: new Date().toISOString(),
      });
      if (eventError) console.error("Payment event audit insert failed", eventError.code ?? "unknown");

      return json({ success: true, subscription, contacts: plan.contacts });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "PAYMENT_PROVIDER_NOT_CONFIGURED") {
      return json({ error: message, message: "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Supabase Edge Function secrets before accepting payments." }, 503);
    }
    console.error("Razorpay payment handler error", message);
    return json({ error: message }, 500);
  }
});
