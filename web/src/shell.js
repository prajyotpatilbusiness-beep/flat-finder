import { authClient, authConfigured } from "./auth.js";

(() => {
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const views = {
    homes: document.getElementById("view-homes"),
    research: document.getElementById("view-research")
  };
  const frames = {
    homes: document.getElementById("frame-homes"),
    research: document.getElementById("frame-research")
  };
  const shellMain = document.querySelector(".shell-main");
  const authButton = document.getElementById("shell-auth-button");
  const authGate = document.getElementById("auth-gate");
  const gateIntro = document.getElementById("gate-intro");
  const gateForm = document.getElementById("gate-auth-form");
  const gateNameField = document.getElementById("gate-name-field");
  const gateNameInput = document.getElementById("gate-name");
  const gateTitle = document.getElementById("gate-form-title");
  const gateEmail = document.getElementById("gate-email");
  const gatePassword = document.getElementById("gate-password");
  const gateMessage = document.getElementById("gate-message");
  const gateSubmit = document.getElementById("gate-submit");
  let signedIn = false;

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
    if (updateHash) history.replaceState(null, "", location.pathname + location.search + (name === "homes" ? "#homes" : "#research"));
  }

  function setGateHome() {
    gateForm.hidden = true;
    gateIntro.hidden = false;
    gateForm.reset();
    gateMessage.textContent = "";
  }

  function setLocked(locked) {
    signedIn = !locked;
    shellMain.classList.toggle("is-locked", locked);
    authGate.hidden = !locked;
    for (const view of Object.values(views)) {
      view.inert = locked;
      view.setAttribute("aria-hidden", String(locked));
    }
    if (authButton) authButton.textContent = signedIn ? "Account" : "Sign in";
    if (locked) setGateHome();
  }

  function setGateMode(mode) {
    const creating = mode === "signup";
    gateIntro.hidden = true;
    gateForm.hidden = false;
    gateNameField.hidden = !creating;
    gateNameInput.required = creating;
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

  function openMarketplaceAuth(mode) {
    activate("homes");
    const frame = frames.homes;
    const send = () => frame?.contentWindow?.postMessage({ type: "flat-finder:open-auth", mode }, location.origin);
    if (!frame) return;
    try {
      if (frame.contentDocument?.readyState === "complete") send();
      else frame.addEventListener("load", send, { once: true });
    } catch {
      send();
    }
  }

  document.getElementById("gate-sign-in")?.addEventListener("click", () => setGateMode("signin"));
  document.getElementById("gate-create-account")?.addEventListener("click", () => setGateMode("signup"));
  document.getElementById("gate-back")?.addEventListener("click", setGateHome);
  document.getElementById("gate-switch-mode")?.addEventListener("click", () => {
    setGateMode(gateForm.dataset.mode === "signup" ? "signin" : "signup");
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
            data: { display_name: displayName },
            emailRedirectTo: new URL("/", location.origin).href
          }
        });
        if (error) throw error;
        if (data.session?.user) {
          setLocked(false);
        } else {
          gateMessage.textContent = "Account created. Check your email for the confirmation link. After confirming, return to Flat Finder to unlock the site.";
        }
      } else {
        const { data, error } = await authClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session?.user) throw new Error("We couldn't start your session. Please try signing in again.");
        setLocked(false);
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
    if (signedIn) openMarketplaceAuth("account");
    else setGateMode("signin");
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== frames.homes?.contentWindow) return;
    if (event.data?.type === "flat-finder:auth-state") setLocked(!event.data.signedIn);
  });

  if (authClient) {
    authClient.auth.onAuthStateChange((_event, session) => setLocked(!session?.user));
    authClient.auth.getSession()
      .then(({ data }) => setLocked(!data.session?.user))
      .catch(() => setLocked(true));
  } else {
    setLocked(true);
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => activate(tab.dataset.tab)));
  const initial = location.hash === "#research" ? "research" : "homes";
  activate(initial, { updateHash: false });
})();
