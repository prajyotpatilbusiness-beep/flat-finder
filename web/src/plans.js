import { authClient } from "./auth.js";
import "./plans.css";

const q = (selector) => document.querySelector(selector);
const qa = (selector) => [...document.querySelectorAll(selector)];
const PLANS = {
  starter: { monthly: 199, annual: 1990, contacts: 5 },
  plus: { monthly: 499, annual: 4990, contacts: 15 },
  pro: { monthly: 999, annual: 9990, contacts: 50 },
};
const PLAN_RANK = { starter: 1, plus: 2, pro: 3 };
const state = { interval: "monthly", user: null, profile: null, usage: null, pendingPhone: "", pendingPlan: "", pendingListingId: null, otpRequested: false };

function message(text, error = false) {
  const el = q("#page-message");
  el.textContent = text || "";
  el.classList.toggle("error", Boolean(error));
}
function verifyMessage(text, error = false) {
  const el = q("#phone-verify-message");
  el.textContent = text || "";
  el.classList.toggle("error", Boolean(error));
}
function indianDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  return digits.slice(0, 10);
}
function validIndianPhone(value) {
  return /^[6-9]\d{9}$/.test(indianDigits(value));
}
function formatMoney(value) {
  return "₹" + Number(value).toLocaleString("en-IN");
}
function renderPrices() {
  qa("[data-plan]").forEach((button) => {
    const id = button.dataset.plan;
    if (!PLANS[id]) return;
    button.textContent = "Choose " + id[0].toUpperCase() + id.slice(1);
    button.disabled = false;
  });
  for (const planId of Object.keys(PLANS)) {
    const price = PLANS[planId][state.interval];
    const priceEl = document.querySelector('[data-price="' + planId + '"]');
    const offerEl = document.querySelector('[data-offer="' + planId + '"]');
    if (priceEl) priceEl.textContent = formatMoney(price);
    if (offerEl) offerEl.textContent = PLANS[planId].contacts + " unique owner contacts per " + "month";
  }
  qa("[data-period]").forEach((el) => el.textContent = state.interval === "annual" ? "/ year" : "/ month");
}
function renderUsage() {
  const usage = state.usage;
  if (!usage) {
    q("#member-status").hidden = true;
    return;
  }
  q("#member-status").hidden = false;
  const labels = { free: "Free Explorer", starter: "Starter", plus: "Plus", pro: "Pro" };
  const used = Number(usage.contacts_used || 0);
  const limit = Number(usage.contacts_limit || 0);
  q("#member-plan-name").textContent = labels[usage.plan_id] || "Free Explorer";
  q("#member-usage").textContent = limit
    ? "Your active plan is ready for verified owner connections."
    : "Explore for free. Choose a paid plan when you want owner contact details.";
  q("#usage-count").textContent = used + " / " + limit;
  q("#usage-fill").style.width = (limit ? Math.min(100, used / limit * 100) : 0) + "%";
  q("#usage-renewal").textContent = usage.current_period_end
    ? "Membership expires on " + new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(usage.current_period_end)) + ". Contact allowance resets monthly."
    : "No paid plan is active.";
}
async function refreshUsage() {
  if (!state.user) {
    state.usage = null;
    renderUsage();
    return;
  }
  const { data, error } = await authClient.rpc("get_my_contact_usage");
  if (error) {
    message(error.message || "Could not load your membership status.", true);
    return;
  }
  state.usage = Array.isArray(data) ? data[0] : data;
  renderUsage();
}

function showPhoneVerification(phone = "") {
  state.otpRequested = false;
  q("#phone-verify-card").hidden = false;
  q("#send-otp-form").hidden = false;
  q("#verify-otp-form").hidden = true;
  q("#otp-phone").value = indianDigits(phone);
  q("#phone-verify-card").scrollIntoView({ behavior: "smooth", block: "center" });
}
async function sendOtp(event) {
  event?.preventDefault();
  if (!state.user) {
    message("Sign in or create a Flat Finder account before verifying your phone.", true);
    return;
  }
  const mobile = indianDigits(q("#otp-phone").value);
  if (!validIndianPhone(mobile)) {
    verifyMessage("Enter a valid 10-digit Indian mobile number beginning with 6, 7, 8 or 9.", true);
    return;
  }
  const phone = "+91" + mobile;
  state.otpRequested = true;
  const button = q("#send-otp-button");
  button.disabled = true;
  button.textContent = "Sending OTP…";
  verifyMessage("");
  try {
    const { data, error } = await authClient.functions.invoke("verify-phone", {
      body: { action: "send", phone },
    });
    if (error || !data?.success) throw new Error(data?.error || error?.message || "PHONE_VERIFICATION_FAILED");
    state.pendingPhone = phone;
    q("#send-otp-form").hidden = true;
    q("#verify-otp-form").hidden = false;
    q("#otp-sent-message").textContent = "A verification code was sent to " + phone + ". Enter the 6-digit code.";
    q("#otp-code").focus();
    verifyMessage("Code expires in 10 minutes. You can request another after 60 seconds.");
  } catch (error) {
    state.otpRequested = false;
    verifyMessage(error?.message || "We couldn't send the SMS code. Check the SMS provider setup and try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Send OTP";
  }
}
async function verifyOtp(event) {
  event.preventDefault();
  const token = String(q("#otp-code").value || "").replace(/\D/g, "");
  if (token.length !== 6 || !state.pendingPhone) {
    verifyMessage("Enter the 6-digit code we sent to your phone.", true);
    return;
  }
  const button = q("#verify-otp-button");
  button.disabled = true;
  button.textContent = "Verifying…";
  verifyMessage("");
  try {
    const { data, error } = await authClient.functions.invoke("verify-phone", {
      body: { action: "verify", phone: state.pendingPhone, code: token },
    });
    if (error || !data?.success) throw new Error(data?.error || error?.message || "PHONE_VERIFICATION_FAILED");
    state.otpRequested = false;
    await refreshProfile();
    q("#phone-verify-card").hidden = true;
    message("Your mobile number is verified. You can now choose a plan.");
    await refreshUsage();
    renderAuthState();
    if (state.pendingPlan) {
      const plan = state.pendingPlan;
      state.pendingPlan = "";
      await startCheckout(plan);
    }
  } catch (error) {
    verifyMessage(error?.message || "That code could not be verified. Please try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Verify number";
  }
}
async function requireVerifiedPhone() {
  if (!state.user) return false;
  if (state.profile?.phone_verified_at) return true;
  const storedPhone = state.profile?.phone || state.user.user_metadata?.phone || "";
  showPhoneVerification(storedPhone);
  return false;
}
function renderAuthState() {
  const signedIn = Boolean(state.user);
  qa("[data-plan]").forEach((button) => {
    if (button.dataset.plan === "free") return;
    button.textContent = signedIn ? "Choose " + button.dataset.plan[0].toUpperCase() + button.dataset.plan.slice(1) : "Sign in to choose";
  });
}
async function startCheckout(planId) {
  if (!PLANS[planId] || !state.user) {
    message("Please sign in before choosing a paid plan.", true);
    return;
  }
  if (state.usage?.contacts_limit) {
    const activeRank = PLAN_RANK[state.usage.plan_id] || 0;
    if ((PLAN_RANK[planId] || 0) <= activeRank) {
      message("Your " + state.usage.plan_id.toUpperCase() + " membership is already active. Choose a higher tier to upgrade, or wait for it to expire.", true);
      return;
    }
    message("Upgrading to " + planId.toUpperCase() + ". Your owner contacts already used this month will carry forward; this upgrade is charged at the listed price without proration.");
  }
  if (!(await requireVerifiedPhone())) {
    state.pendingPlan = planId;
    verifyMessage("Verify your mobile number to continue to checkout.");
    return;
  }
  const button = document.querySelector('[data-plan="' + planId + '"]');
  button.disabled = true;
  button.textContent = "Preparing secure checkout…";
  message("");
  try {
    const { data: order, error } = await authClient.functions.invoke("razorpay-payments", {
      body: { action: "create-order", planId, interval: state.interval },
    });
    if (error) {
      const detail = error.context?.body?.message || error.context?.body?.error || error.message;
      throw new Error(detail || "Checkout service is not ready.");
    }
    if (!window.Razorpay) throw new Error("Razorpay Checkout could not load. Please disable any script blocker and retry.");
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Flat Finder",
      description: planId.toUpperCase() + " membership · " + PLANS[planId].contacts + " owner contacts",
      order_id: order.orderId,
      prefill: {
        name: state.user.user_metadata?.display_name || "",
        email: state.user.email || "",
        contact: state.profile?.phone || "",
      },
      theme: { color: "#6338f2" },
      handler: async (response) => {
        message("Payment received. Verifying it securely…");
        const { data: result, error: verifyError } = await authClient.functions.invoke("razorpay-payments", {
          body: { action: "verify-payment", ...response },
        });
        if (verifyError || !result?.success) {
          message(verifyError?.message || result?.error || "Payment verification did not complete. Contact support with your Razorpay payment ID.", true);
          return;
        }
        message("Payment verified. Your " + planId.toUpperCase() + " plan is active. Your monthly owner-contact usage has been carried forward.");
        state.usage = null;
        await refreshUsage();
        if (window.parent !== window) {
          window.parent.postMessage({
            type: "flat-finder:subscription-active",
            listingId: state.pendingListingId
          }, location.origin);
        }
      },
      modal: { ondismiss: () => message("Checkout closed. No plan was activated.") },
    });
    checkout.open();
  } catch (error) {
    message(error?.message || "We couldn't start checkout. Please try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Choose " + planId[0].toUpperCase() + planId.slice(1);
  }
}
function requestSignIn() {
  if (window.parent !== window) {
    window.parent.postMessage({ type: "flat-finder:open-auth", mode: "signin" }, location.origin);
  } else {
    message("Use the Sign in button to access your Flat Finder account.", true);
  }
}
async function refreshProfile() {
  if (!state.user) {
    state.profile = null;
    return null;
  }
  const { data, error } = await authClient.from("profiles")
    .select("id,phone,phone_verified_at,display_name,created_at")
    .eq("id", state.user.id)
    .maybeSingle();
  if (error) throw error;
  state.profile = data || null;
  return state.profile;
}
async function loadSession() {
  const { data } = await authClient.auth.getSession();
  state.user = data.session?.user || null;
  await refreshProfile();
  renderAuthState();
  await refreshUsage();
}

q("#send-otp-form").addEventListener("submit", sendOtp);
q("#verify-otp-form").addEventListener("submit", verifyOtp);
q("#resend-otp").addEventListener("click", sendOtp);
q("#otp-phone").addEventListener("input", () => {
  q("#otp-phone").value = q("#otp-phone").value.replace(/\D/g, "").slice(0, 10);
});
qa("[data-interval]").forEach((button) => button.addEventListener("click", () => {
  state.interval = button.dataset.interval;
  qa("[data-interval]").forEach((other) => other.classList.toggle("active", other === button));
  renderPrices();
}));
qa("[data-plan]").forEach((button) => button.addEventListener("click", async () => {
  const planId = button.dataset.plan;
  if (planId === "free") {
    if (window.parent !== window) window.parent.postMessage({ type: "flat-finder:go-explore" }, location.origin);
    else location.href = "/";
    return;
  }
  if (!state.user) {
    state.pendingPlan = planId;
    requestSignIn();
    return;
  }
  await startCheckout(planId);
}));
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  if (event.data?.type === "flat-finder:pending-listing") {
    state.pendingListingId = event.data.listingId || null;
    if (state.pendingListingId) message("You're choosing a plan to unlock details for the selected property."); 
    if (event.data.note) message(event.data.note);
  }
});
authClient.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user || null;
  if (!state.user) {
    state.profile = null;
    state.usage = null;
    renderAuthState();
    renderUsage();
    return;
  }
  refreshProfile().then(() => {
    renderAuthState();
    refreshUsage();
    if (state.pendingPlan && !state.profile?.phone_verified_at && !state.otpRequested) {
      showPhoneVerification(state.profile?.phone || state.user.user_metadata?.phone || "");
    } else if (state.pendingPlan && state.profile?.phone_verified_at) {
      const selectedPlan = state.pendingPlan;
      state.pendingPlan = "";
      startCheckout(selectedPlan);
    }
  }).catch((error) => message(error?.message || "Could not load your profile.", true));
});
renderPrices();
loadSession().catch((error) => message(error?.message || "Could not load account status.", true));
