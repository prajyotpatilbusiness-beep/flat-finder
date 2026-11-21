import { authClient, authConfigured } from "./auth.js";

(() => {
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const views = {
    homes: document.getElementById("view-homes"),
    research: document.getElementById("view-research"),
    plans: document.getElementById("view-plans")
  };
  const frames = {
    homes: document.getElementById("frame-homes"),
    research: document.getElementById("frame-research"),
    plans: document.getElementById("frame-plans")
  };
  const shellMain = document.querySelector(".shell-main");
  const authButton = document.getElementById("shell-auth-button");
  const authLabel = document.getElementById("shell-auth-label");
  const accountAvatar = document.getElementById("shell-account-avatar");
  const authGate = document.getElementById("auth-gate");
  const gateIntro = document.getElementById("gate-intro");
  const gateForm = document.getElementById("gate-auth-form");
  const gateNameField = document.getElementById("gate-name-field");
  const gateNameInput = document.getElementById("gate-name");
  const gatePhoneField = document.getElementById("gate-phone-field");
  const gatePhoneInput = document.getElementById("gate-phone");
  const gateTitle = document.getElementById("gate-form-title");
  const gateEmail = document.getElementById("gate-email");
  const gatePassword = document.getElementById("gate-password");
  const gateMessage = document.getElementById("gate-message");
  const gateSubmit = document.getElementById("gate-submit");
  const accountLayer = document.getElementById("account-layer");
  const accountContent = document.getElementById("account-content");
  const accountTitle = document.getElementById("account-title");
  const accountSubtitle = document.getElementById("account-subtitle");
  let signedIn = false;
  let currentUser = null;
  let currentProfile = null;
  let currentAccountTab = "overview";
  let pendingProfileChange = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const getName = () => currentProfile?.display_name || currentUser?.user_metadata?.display_name || "";
  const getPhone = () => currentProfile?.phone || currentUser?.user_metadata?.phone || "";
  const initials = (value) => {
    const parts = String(value || "").trim().split(/[\s@._-]+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "A").slice(0, 2)).toUpperCase();
  };
  const indianMobileDigits = (value) => {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    return digits.slice(0, 10);
  };
  const validIndianMobile = (value) => /^[6-9]\d{9}$/.test(indianMobileDigits(value));
  const dateLabel = (value) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(value)) : "Not available";
  const tabTitle = (tab) => ({
    overview: "Your account",
    membership: "Membership",
    details: "Personal details",
    settings: "Settings & preferences",
    security: "Security"
  }[tab] || "Your account");

  function activate(name, { updateHash = true } = {}) {
    if (!views[name]) name = "homes";
    for (const key of Object.keys(views)) {
      const active = key === name;
      views[key].hidden = !active;
      views[key].classList.toggle("active", active);
      tabs.find((tab) => tab.dataset.tab === key)?.classList.toggle("active", active);
      tabs.find((tab) => tab.dataset.tab === key)?.setAttribute("aria-selected", String(active));
    }
    const frame = frames[name];
    if (frame && !frame.hasAttribute("src") && frame.dataset.src) frame.src = frame.dataset.src;
    if (frame) {
      try {
        const win = frame.contentWindow;
        if (win) win.dispatchEvent(new win.Event("resize"));
      } catch {}
    }
    if (updateHash) history.replaceState(null, "", location.pathname + location.search + (name === "homes" ? "#homes" : name === "plans" ? "#plans" : "#research"));
  }

  function syncAccountButton() {
    if (authLabel) authLabel.textContent = signedIn ? "Account" : "Sign in";
    if (accountAvatar) {
      accountAvatar.hidden = !signedIn;
      accountAvatar.textContent = signedIn
        ? initials(getName() || currentUser?.email || "Account")
        : "";
    }
    authButton?.setAttribute("aria-label", signedIn ? "Open your account" : "Sign in");
  }

  function closeAccountPanel() {
    accountLayer.hidden = true;
    document.body.classList.remove("account-open");
  }

  function setGateHome() {
    gateForm.hidden = true;
    gateIntro.hidden = false;
    gateForm.reset();
    gateMessage.textContent = "";
    gateMessage.classList.remove("error");
  }

  function setLocked(locked, user = null) {
    signedIn = !locked;
    currentUser = locked ? null : (user || currentUser);
    if (locked) currentProfile = null;

    // Keep every app view inaccessible until Supabase confirms an authenticated session.
    shellMain.classList.toggle("is-locked", locked);
    document.querySelector(".shell-header")?.classList.toggle("is-locked", locked);
    authGate.hidden = !locked;
    for (const view of Object.values(views)) {
      view.inert = locked || view.hidden;
      view.setAttribute("aria-hidden", String(locked || view.hidden));
    }
    syncAccountButton();
    if (locked) closeAccountPanel();
  }

  function setGateMode(mode) {
    const creating = mode === "signup";
    gateIntro.hidden = true;
    gateForm.hidden = false;
    gateNameField.hidden = !creating;
    gateNameInput.required = creating;
    gatePhoneField.hidden = !creating;
    gatePhoneInput.required = creating;
    gateNameInput.autocomplete = "name";
    gateTitle.textContent = creating ? "Create your account" : "Welcome back";
    gateSubmit.textContent = creating ? "Create account" : "Sign in";
    gatePassword.autocomplete = creating ? "new-password" : "current-password";
    gateForm.dataset.mode = mode;
    gateMessage.textContent = "";
    gateMessage.classList.remove("error");
    document.getElementById("gate-switch-label").textContent = creating
      ? "Already have an account?"
      : "New to Flat Finder?";
    document.getElementById("gate-switch-mode").textContent = creating ? "Sign in" : "Create account";
    gateEmail.focus();
  }

  async function loadProfile() {
    if (!authClient || !currentUser) return null;
    const { data, error } = await authClient
      .from("profiles")
      .select("id,display_name,phone,phone_verified_at,created_at")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (error) throw error;
    currentProfile = data || {
      id: currentUser.id,
      display_name: currentUser.user_metadata?.display_name || "",
      phone: currentUser.user_metadata?.phone || "",
      role: "seeker",
      created_at: currentUser.created_at
    };
    syncAccountButton();
    return currentProfile;
  }

  function setAccountTab(tab) {
    currentAccountTab = tab;
    document.querySelectorAll("[data-account-tab]").forEach((button) => {
      const active = button.dataset.accountTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    renderAccountContent();
  }

  function renderAccountContent(notice = "") {
    if (!currentUser) return;
    const name = getName();
    const email = currentUser.email || "";
    const phone = getPhone();
    const phoneDigits = indianMobileDigits(phone);
    const role = "Flat Finder member";
    const created = dateLabel(currentProfile?.created_at || currentUser.created_at);
    const emailStatus = currentUser.email_confirmed_at ? "Email confirmed" : "Email not confirmed";
    const noticeHtml = notice ? '<p class="account-notice" role="status">' + escapeHtml(notice) + '</p>' : "";

    if (accountTitle) accountTitle.textContent = tabTitle(currentAccountTab);
    if (accountSubtitle) accountSubtitle.textContent = email;

    if (currentAccountTab === "overview") {
      accountContent.innerHTML = `
        <div class="account-welcome">
          <span class="account-eyebrow">YOUR FLAT FINDER ACCOUNT</span>
          <h2>Hello, ${escapeHtml(name || (email.split("@")[0] || "there"))}</h2>
          <p>Your personal details, preferences and security options are all in one place.</p>
        </div>
        ${noticeHtml}
        <div class="account-overview-grid">
          <article><span>Account type</span><strong>${escapeHtml(role)}</strong><small>Default member access</small></article>
          <article><span>Member since</span><strong>${escapeHtml(created)}</strong><small>Your Flat Finder journey</small></article>
          <article><span>Email status</span><strong>${escapeHtml(emailStatus)}</strong><small>Used for sign-in and account messages</small></article>
          <article><span>Mobile number</span><strong>${escapeHtml(phone || "Add your number")}</strong><small>India · +91</small></article>
        </div>
        <div class="account-quick-actions">
          <button type="button" data-jump-account="membership"><span>01</span><b>Membership</b><small>View your plan and owner-contact allowance</small><i>→</i></button>
          <button type="button" data-jump-account="details"><span>02</span><b>Personal details</b><small>Update your name and mobile number</small><i>→</i></button>
          <button type="button" data-jump-account="settings"><span>03</span><b>Settings & preferences</b><small>Choose your account preferences</small><i>→</i></button>
          <button type="button" data-jump-account="security"><span>04</span><b>Security</b><small>Manage your password and sign-in</small><i>→</i></button>
        </div>`;
      accountContent.querySelectorAll("[data-jump-account]").forEach((button) =>
        button.addEventListener("click", () => setAccountTab(button.dataset.jumpAccount))
      );
      return;
    }

    if (currentAccountTab === "membership") {
      accountContent.innerHTML = `
        <div class="account-section-intro"><h2>Membership</h2><p>See your current plan and how many verified owner contacts remain.</p></div>
        <div id="account-membership-summary" class="account-membership-summary"><div class="account-loading">Checking your membership…</div></div>
        <button class="account-primary" id="account-open-plans" type="button">View plans and upgrade</button>
        <p class="account-fine">Owner contacts count once per unique owner in each paid billing period. Contact limits are enforced by the database.</p>`;
      const summary = accountContent.querySelector("#account-membership-summary");
      authClient.rpc("get_my_contact_usage").then(({ data, error }) => {
        if (!summary.isConnected) return;
        if (error) {
          summary.innerHTML = '<p class="account-notice error">' + escapeHtml(error.message || "Could not load membership details.") + '</p>';
          return;
        }
        const usage = Array.isArray(data) ? data[0] : data;
        const planId = usage?.plan_id || "free";
        const limit = Number(usage?.contacts_limit || 0);
        const used = Number(usage?.contacts_used || 0);
        const names = { free: "Free Explorer", starter: "Starter", plus: "Plus", pro: "Pro" };
        const renewal = usage?.current_period_end
          ? dateLabel(usage.current_period_end)
          : "No paid membership is active";
        summary.innerHTML = `
          <article><span>Current plan</span><strong>${escapeHtml(names[planId] || "Free Explorer")}</strong></article>
          <article><span>Owner contacts used</span><strong>${used} of ${limit}</strong></article>
          <article><span>Membership expires</span><strong>${escapeHtml(renewal)}</strong></article>
          <div class="account-membership-track"><i style="width:${limit ? Math.min(100, used / limit * 100) : 0}%"></i></div>`;
      }).catch((error) => {
        if (summary.isConnected) summary.innerHTML = '<p class="account-notice error">' + escapeHtml(error?.message || "Could not load membership details.") + '</p>';
      });
      accountContent.querySelector("#account-open-plans").addEventListener("click", () => {
        closeAccountPanel();
        activate("plans");
      });
      return;
    }

    if (currentAccountTab === "details") {
      if (pendingProfileChange) {
        accountContent.innerHTML = `
          <div class="account-section-intro"><h2>Verify your new mobile number</h2><p>We sent a 6-digit OTP to ${escapeHtml(pendingProfileChange.phone)}. Verify it before we update your account contact details.</p></div>
          ${noticeHtml}
          <form class="account-form" id="account-phone-verify-form">
            <label>6-digit SMS code
              <input name="token" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="123456">
            </label>
            <button class="account-primary" type="submit">Verify new number</button>
            <button class="ghost" id="account-phone-resend" type="button">Send code again</button>
            <button class="account-text-button" id="account-phone-cancel" type="button">Cancel</button>
          </form>`;
        accountContent.querySelector("#account-phone-verify-form").addEventListener("submit", verifyProfilePhone);
        accountContent.querySelector("#account-phone-resend").addEventListener("click", resendProfilePhoneOtp);
        accountContent.querySelector("#account-phone-cancel").addEventListener("click", () => {
          pendingProfileChange = null;
          renderAccountContent("Mobile number change cancelled.");
        });
        return;
      }
      accountContent.innerHTML = `
        <div class="account-section-intro"><h2>Personal details</h2><p>Keep your contact information up to date.</p></div>
        ${noticeHtml}
        <form class="account-form" id="account-profile-form">
          <label>Full name
            <input name="displayName" type="text" maxlength="80" autocomplete="name" required value="${escapeHtml(name)}" placeholder="Your full name">
          </label>
          <label>Email address
            <input type="email" value="${escapeHtml(email)}" readonly aria-readonly="true">
            <small>Email changes are managed separately to protect your sign-in.</small>
          </label>
          <label>Indian mobile number
            <span class="account-phone-field"><b>+91</b><input name="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" pattern="[6-9][0-9]{9}" required value="${escapeHtml(phoneDigits)}" placeholder="10-digit mobile number"></span>
            <small>${currentProfile?.phone_verified_at ? "Verified mobile number." : "Not verified yet. Verify by SMS before unlocking owner contacts."} Any new number must be verified.</small>
          </label>
          <button class="account-primary" type="submit">Save personal details</button>
        </form>`;
      accountContent.querySelector("#account-profile-form").addEventListener("submit", saveProfile);
      return;
    }

    if (currentAccountTab === "settings") {
      const prefs = currentUser.user_metadata?.preferences || {};
      accountContent.innerHTML = `
        <div class="account-section-intro"><h2>Settings & preferences</h2><p>Choose how Flat Finder should contact you.</p></div>
        ${noticeHtml}
        <form class="account-form" id="account-settings-form">
          <label class="account-toggle-row"><span><b>Saved-home updates</b><small>Receive updates when saved-home alerts become available.</small></span><input type="checkbox" name="savedHomeAlerts" ${prefs.savedHomeAlerts === true ? "checked" : ""}></label>
          <label class="account-toggle-row"><span><b>Product and service news</b><small>Receive occasional Flat Finder product announcements.</small></span><input type="checkbox" name="productNews" ${prefs.productNews === true ? "checked" : ""}></label>
          <label>Preferred city
            <input name="preferredCity" type="text" maxlength="80" value="${escapeHtml(prefs.preferredCity || "")}" placeholder="e.g. Pune">
            <small>Used as a preference only; it does not change your current search.</small>
          </label>
          <button class="account-primary" type="submit">Save settings</button>
        </form>
        <p class="account-fine">Your choices are saved to your account. Some alert delivery features will become active as Flat Finder adds them.</p>`;
      accountContent.querySelector("#account-settings-form").addEventListener("submit", saveSettings);
      return;
    }

    accountContent.innerHTML = `
      <div class="account-section-intro"><h2>Security</h2><p>Protect your Flat Finder account.</p></div>
      ${noticeHtml}
      <div class="account-security-card"><span>EMAIL ACCOUNT</span><b>${escapeHtml(email)}</b><small>${escapeHtml(emailStatus)}</small></div>
      <form class="account-form" id="account-password-form">
        <h3>Change password</h3>
        <label>New password
          <input name="newPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="At least 8 characters">
        </label>
        <label>Confirm new password
          <input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="Enter it again">
        </label>
        <button class="account-primary" type="submit">Update password</button>
      </form>
      <p class="account-fine">Never share your password or one-time verification codes with anyone.</p>`;
    accountContent.querySelector("#account-password-form").addEventListener("submit", changePassword);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const values = new FormData(form);
    const displayName = String(values.get("displayName") || "").trim();
    const mobile = indianMobileDigits(values.get("mobile"));
    const phone = "+91" + mobile;
    if (!displayName) return renderAccountContent("Please enter your full name.");
    if (!validIndianMobile(mobile)) return renderAccountContent("Enter a valid 10-digit Indian mobile number.");

    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const currentVerifiedPhone = currentProfile?.phone_verified_at ? currentProfile.phone : "";
      if (phone !== currentVerifiedPhone) {
        const { data, error } = await authClient.functions.invoke("verify-phone", {
          body: { action: "send", phone }
        });
        if (error || !data?.success) {
          const reason = data?.error || error?.message || "PHONE_VERIFICATION_FAILED";
          throw new Error(reason);
        }
        pendingProfileChange = { displayName, phone };
        renderAccountContent("A verification code was sent. Enter it to save your new mobile number.");
        return;
      }

      const { data, error } = await authClient.from("profiles")
        .update({ display_name: displayName })
        .eq("id", currentUser.id)
        .select("id,display_name,phone,phone_verified_at,created_at")
        .single();
      if (error) throw error;
      currentProfile = data;
      syncAccountButton();
      renderAccountContent("Your personal details have been saved.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Save personal details";
      const box = document.createElement("p");
      box.className = "account-notice error";
      box.setAttribute("role", "alert");
      box.textContent = error?.message || "We couldn't save your details. Please try again.";
      form.prepend(box);
    }
  }

  async function verifyProfilePhone(event) {
    event.preventDefault();
    if (!pendingProfileChange || !currentUser) return;
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const token = String(new FormData(form).get("token") || "").replace(/\D/g, "");
    if (token.length !== 6) {
      const box = document.createElement("p");
      box.className = "account-notice error";
      box.textContent = "Enter the 6-digit SMS code.";
      form.prepend(box);
      return;
    }
    button.disabled = true;
    button.textContent = "Verifying…";
    try {
      const pending = pendingProfileChange;
      const { data: verification, error: verificationError } = await authClient.functions.invoke("verify-phone", {
        body: { action: "verify", phone: pending.phone, code: token }
      });
      if (verificationError || !verification?.success) {
        throw new Error(verification?.error || verificationError?.message || "PHONE_VERIFICATION_FAILED");
      }

      const { data, error } = await authClient.from("profiles")
        .update({ display_name: pending.displayName })
        .eq("id", currentUser.id)
        .select("id,display_name,phone,phone_verified_at,created_at")
        .single();
      if (error) throw error;
      currentProfile = data;
      pendingProfileChange = null;
      syncAccountButton();
      renderAccountContent("Your new mobile number is verified and your details are saved.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Verify new number";
      const box = document.createElement("p");
      box.className = "account-notice error";
      box.textContent = error?.message || "We couldn't verify your mobile number. Check the code and try again.";
      form.prepend(box);
    }
  }

  async function resendProfilePhoneOtp() {
    if (!pendingProfileChange) return;
    try {
      const { data, error } = await authClient.functions.invoke("verify-phone", {
        body: { action: "send", phone: pendingProfileChange.phone }
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "PHONE_VERIFICATION_FAILED");
      }
      renderAccountContent("A new verification code has been requested.");
    } catch (error) {
      renderAccountContent(error?.message || "We couldn't resend the SMS code. Please try again.");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const values = new FormData(form);
    const preferences = {
      ...(currentUser.user_metadata?.preferences || {}),
      savedHomeAlerts: values.get("savedHomeAlerts") === "on",
      productNews: values.get("productNews") === "on",
      preferredCity: String(values.get("preferredCity") || "").trim()
    };
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const { data, error } = await authClient.auth.updateUser({
        data: { ...(currentUser.user_metadata || {}), preferences }
      });
      if (error) throw error;
      currentUser = data.user || currentUser;
      renderAccountContent("Your settings have been saved.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Save settings";
      const box = document.createElement("p");
      box.className = "account-notice error";
      box.setAttribute("role", "alert");
      box.textContent = error?.message || "We couldn't save your settings.";
      form.prepend(box);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const values = new FormData(form);
    const password = String(values.get("newPassword") || "");
    const confirmation = String(values.get("confirmPassword") || "");
    if (password.length < 8) return renderAccountContent("Choose a password with at least 8 characters.");
    const confirmInput = form.querySelector('[name="confirmPassword"]');
    confirmInput.setCustomValidity("");
    if (password !== confirmation) {
      confirmInput.setCustomValidity("Passwords do not match.");
      confirmInput.reportValidity();
      return;
    }
    button.disabled = true;
    button.textContent = "Updating…";
    try {
      const { data, error } = await authClient.auth.updateUser({ password });
      if (error) throw error;
      currentUser = data.user || currentUser;
      renderAccountContent("Your password has been updated.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Update password";
      const box = document.createElement("p");
      box.className = "account-notice error";
      box.setAttribute("role", "alert");
      box.textContent = error?.message || "We couldn't update your password.";
      form.prepend(box);
    }
  }

  async function openAccountPanel(tab = "overview") {
    if (!signedIn || !currentUser) {
      setGateMode("signin");
      return;
    }
    accountLayer.hidden = false;
    document.body.classList.add("account-open");
    accountContent.innerHTML = '<div class="account-loading">Loading your account…</div>';
    try {
      await loadProfile();
    } catch (error) {
      currentProfile = {
        id: currentUser.id,
        display_name: currentUser.user_metadata?.display_name || "",
        phone: currentUser.user_metadata?.phone || "",
        role: "seeker",
        created_at: currentUser.created_at
      };
      setAccountTab(tab);
      const box = document.createElement("p");
      box.className = "account-notice error";
      box.textContent = error?.message || "Some profile details could not be loaded.";
      accountContent.prepend(box);
      return;
    }
    setAccountTab(tab);
  }

  async function signOut() {
    const button = document.getElementById("account-signout");
    button.disabled = true;
    button.textContent = "Signing out…";
    const { error } = await authClient.auth.signOut();
    if (error) {
      button.disabled = false;
      button.textContent = "Sign out";
      const box = document.createElement("p");
      box.className = "account-notice error";
      box.textContent = error.message || "We couldn't sign you out.";
      accountContent.prepend(box);
      return;
    }
    currentUser = null;
    currentProfile = null;
    closeAccountPanel();
    setLocked(true);
  }

  document.getElementById("gate-sign-in")?.addEventListener("click", () => setGateMode("signin"));
  document.getElementById("gate-create-account")?.addEventListener("click", () => setGateMode("signup"));
  document.getElementById("gate-back")?.addEventListener("click", setGateHome);
  document.getElementById("gate-switch-mode")?.addEventListener("click", () => {
    setGateMode(gateForm.dataset.mode === "signup" ? "signin" : "signup");
  });

  gatePhoneInput?.addEventListener("input", () => {
    gatePhoneInput.value = gatePhoneInput.value.replace(/\D/g, "").slice(0, 10);
  });

  gateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authConfigured || !authClient) {
      gateMessage.textContent = "Account access is not available right now. Please refresh the page and try again.";
      gateMessage.classList.add("error");
      return;
    }

    const creating = gateForm.dataset.mode === "signup";
    const values = new FormData(gateForm);
    const email = String(values.get("email") || "").trim().toLowerCase();
    const password = String(values.get("password") || "");
    const displayName = String(values.get("displayName") || "").trim();
    const mobile = indianMobileDigits(values.get("mobile"));

    if (creating && !/^[6-9]\d{9}$/.test(mobile)) {
      gateMessage.textContent = "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.";
      gateMessage.classList.add("error");
      return;
    }

    gateSubmit.disabled = true;
    gateSubmit.textContent = creating ? "Creating account…" : "Signing in…";
    gateMessage.textContent = "";
    gateMessage.classList.remove("error");

    try {
      if (creating) {
        const { data, error } = await authClient.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName, phone: "+91" + mobile },
            emailRedirectTo: new URL("/", location.origin).href
          }
        });
        if (error) throw error;
        if (data.session?.user) {
          setLocked(false, data.session.user);
        } else {
          gateMessage.textContent = "Account created. Check your email for the confirmation link. After confirming, return here to sign in. Your +91 mobile number has been saved to your profile.";
        }
      } else {
        const { data, error } = await authClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session?.user) throw new Error("We couldn't start your session. Please try signing in again.");
        setLocked(false, data.session.user);
      }
    } catch (error) {
      gateMessage.textContent = error?.message || "We could not complete that request. Please try again.";
      gateMessage.classList.add("error");
    } finally {
      if (!signedIn) {
        gateSubmit.disabled = false;
        gateSubmit.textContent = creating ? "Create account" : "Sign in";
      }
    }
  });

  authButton?.addEventListener("click", () => {
    if (signedIn) openAccountPanel();
    else openMarketplaceAuth("signin");
  });

  document.querySelectorAll("[data-account-tab]").forEach((button) =>
    button.addEventListener("click", () => setAccountTab(button.dataset.accountTab))
  );
  document.getElementById("account-close")?.addEventListener("click", closeAccountPanel);
  document.getElementById("account-signout")?.addEventListener("click", signOut);
  accountLayer?.addEventListener("click", (event) => {
    if (event.target === accountLayer) closeAccountPanel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !accountLayer.hidden) closeAccountPanel();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (event.source === frames.homes?.contentWindow) {
      if (event.data?.type === "flat-finder:auth-state") {
        authClient?.auth.getSession()
          .then(({ data }) => setLocked(!data.session?.user, data.session?.user || null));
      }
      if (event.data?.type === "flat-finder:show-plans") {
        activate("plans");
        const send = () => frames.plans?.contentWindow?.postMessage({
          type: "flat-finder:pending-listing",
          listingId: event.data.listingId || null,
          note: event.data.note || ""
        }, location.origin);
        if (frames.plans?.contentDocument?.readyState === "complete") send();
        else frames.plans?.addEventListener("load", send, { once: true });
      }
    }
    if (event.source === frames.plans?.contentWindow) {
      if (event.data?.type === "flat-finder:open-auth") {
        openMarketplaceAuth(event.data.mode || "signin");
      }
      if (event.data?.type === "flat-finder:go-explore") {
        activate("homes");
      }
      if (event.data?.type === "flat-finder:subscription-active") {
        activate("homes");
        const send = () => frames.homes?.contentWindow?.postMessage({
          type: "flat-finder:reopen-detail",
          listingId: event.data.listingId || null
        }, location.origin);
        if (frames.homes?.contentDocument?.readyState === "complete") send();
        else frames.homes?.addEventListener("load", send, { once: true });
      }
    }
  });

  if (authClient) {
    authClient.auth.onAuthStateChange((_event, session) => setLocked(!session?.user, session?.user || null));
    authClient.auth.getSession()
      .then(({ data }) => setLocked(!data.session?.user, data.session?.user || null))
      .catch(() => setLocked(true));
  } else {
    setLocked(true);
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => activate(tab.dataset.tab)));
  const initial = location.hash === "#research" ? "research" : location.hash === "#plans" ? "plans" : "homes";
  activate(initial, { updateHash: false });
})();
