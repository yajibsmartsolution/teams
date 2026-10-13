/* KEDCO browser authentication and role-aware landing-page routing. */
(function () {
  "use strict";

  let client = null;

  // Authentication must remain usable even when operational browser caches
  // have filled localStorage. Prefer localStorage for normal persistence, but
  // keep the current login in sessionStorage when the local quota is full.
  function readAuthStorage(key) {
    try {
      const value = sessionStorage.getItem(key);
      if (value !== null) return value;
    } catch {}
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeAuthStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      try { sessionStorage.removeItem(key); } catch {}
      return true;
    } catch (localError) {
      try {
        sessionStorage.setItem(key, value);
        return true;
      } catch {
        throw localError;
      }
    }
  }

  function config() {
    const configured = window.KEDCO_SUPABASE_CONFIG || {};
    const shared = window.KEDCO_SUPABASE?.getConfig?.() || {};
    return {
      url: String(configured.url || shared.url || "").trim(),
      key: String(configured.anonKey || shared.anonKey || "").trim()
    };
  }

  function getClient() {
    if (client) return client;
    if (!window.supabase?.createClient) {
      throw new Error("The KEDCO local data client did not load.");
    }

    const current = config();
    if (!current.url || !current.key) {
      throw new Error("Local storage configuration is missing.");
    }

    client = window.supabase.createClient(current.url, current.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  function routeForRole(role) {
    const code = String(role || "").trim().toUpperCase();
    const routes = window.KEDCO_PAGE_ROUTES || {};
    return routes[code] || "";
  }

  function apiBase() {
    const host = String(window.location.hostname || "").toLowerCase();
    const local = host === "localhost" || host === "::1" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host) || /^192\.168(?:\.\d{1,3}){2}$/.test(host) || /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){3}$/.test(host) || host.endsWith(".local") || (!!host && !host.includes("."));
    if (!local) return window.location.origin;
    const configured = String(window.KEDCO_SUPABASE_CONFIG?.apiBase || "").trim();
    if (configured) return configured.replace(/\/$/, "");
    if (window.location.port === "5500") return window.location.origin;
    return "http://localhost:5500";
  }

  async function backendRequest(path, body) {
    let response;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
      response = await fetch(`${apiBase()}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("The KEDCO server did not respond within 6 seconds. Please check your connection and try again.");
      }
      throw new Error("The KEDCO server is unreachable. Please check your connection or contact your system administrator.");
    } finally {
      window.clearTimeout(timer);
    }

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // The status below provides the useful failure message.
    }
    if (!response.ok) {
      throw new Error(payload.error || `Backend authentication failed (${response.status}).`);
    }
    return payload;
  }

  function persistSession(session) {
    const current = config();
    const projectRef = new URL(current.url).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const serialized = JSON.stringify(session);
    writeAuthStorage(storageKey, serialized);
    writeAuthStorage("KEDCO_AUTH_SESSION_V1", serialized);
  }

  async function resolveRole(supabase) {
    if (window.KEDCO_LOCAL_MODE && typeof supabase.auth?.getUser === "function") {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        throw new Error(error?.message || "Your local KEDCO session is no longer active.");
      }
      const user = data.user;
      const primaryRole = String(user.app_metadata?.primary_role || "").trim().toUpperCase();
      const roleCodes = [...new Set((user.app_metadata?.roles || [primaryRole])
        .map((value) => String(value || "").trim().toUpperCase()).filter(Boolean))];
      let selected = "";
      try {
        selected = String(readAuthStorage("KEDCO_AUTH_ROLE") || readAuthStorage("KEDCO_ACTIVE_ROLE_CODE") || "").trim().toUpperCase();
      } catch {}
      const role = roleCodes.includes(selected) ? selected : primaryRole;
      if (!role) throw new Error("This KEDCO account has no primary role assigned.");
      if (!routeForRole(role)) throw new Error(`No dashboard is configured for role ${role}.`);
      writeAuthStorage("KEDCO_AUTH_ROLE", role);
      writeAuthStorage("KEDCO_AUTH_ROLES", JSON.stringify(roleCodes));
      writeAuthStorage("KEDCO_ACTIVE_ROLE_CODE", role);
      return role;
    }
    const { data: active, error: activeError } = await supabase.rpc(
      "kedco_is_active_user"
    );
    if (activeError) throw new Error(`Account authorization failed: ${activeError.message}`);
    if (active !== true) throw new Error("This KEDCO account is inactive or awaiting approval.");

    const { data: primary, error: primaryError } = await supabase.rpc(
      "kedco_primary_role_code"
    );
    if (primaryError) throw new Error(`Role lookup failed: ${primaryError.message}`);

    const primaryRole = String(primary || "").trim().toUpperCase();
    let roleCodes = primaryRole ? [primaryRole] : [];
    try {
      const { data: assigned, error: assignedError } = await supabase.rpc(
        "kedco_current_user_role_codes"
      );
      if (!assignedError && Array.isArray(assigned)) {
        roleCodes = [...new Set(assigned.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean))];
      }
    } catch {
      // The primary role remains a safe fallback if the role-list RPC is unavailable.
    }
    let selected = "";
    try {
      selected = String(readAuthStorage("KEDCO_AUTH_ROLE") || readAuthStorage("KEDCO_ACTIVE_ROLE_CODE") || "").trim().toUpperCase();
    } catch {}
    const role = roleCodes.includes(selected) ? selected : primaryRole;
    if (!role) throw new Error("This KEDCO account has no primary role assigned.");
    if (!routeForRole(role)) throw new Error(`No dashboard is configured for role ${role}.`);
    writeAuthStorage("KEDCO_AUTH_ROLE", role);
    writeAuthStorage("KEDCO_AUTH_ROLES", JSON.stringify(roleCodes));
    writeAuthStorage("KEDCO_ACTIVE_ROLE_CODE", role);
    return role;
  }

  function notice(id, message, kind) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.dataset.state = kind || "info";
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button, input").forEach((element) => {
      element.disabled = busy;
    });
    form.classList.toggle("busy", busy);
  }

  function clearPersistedAuth() {
    const explicitKeys = ["KEDCO_AUTH_SESSION_V1", "KEDCO_AUTH_ROLE", "KEDCO_AUTH_ROLES", "KEDCO_ACTIVE_ROLE_CODE"];
    for (const storage of [localStorage, sessionStorage]) {
      try {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
          const key = storage.key(index);
          if (explicitKeys.includes(key) || /^sb-.+-auth-token$/i.test(key || "")) storage.removeItem(key);
        }
      } catch {}
    }
  }

  async function signIn(form) {
    const email = String(form.elements.email?.value || "").trim().toLowerCase();
    const password = String(form.elements.password?.value || "");
    const validMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!validMail) {
      notice("loginNotice", "Enter a valid work email address.", "error");
      form.elements.email?.focus();
      return;
    }
    if (password.length < 8) {
      notice("loginNotice", "Password must contain at least 8 characters.", "error");
      form.elements.password?.focus();
      return;
    }

    setBusy(form, true);
    notice("loginNotice", "Signing in securely…", "info");
    try {
      // Login must not request location permission or wait for a GPS fix.
      // Include coordinates only when the browser already has a fresh position.
      const loginLocation = typeof window.KEDCO_GET_LOGIN_LOCATION === "function"
        ? window.KEDCO_GET_LOGIN_LOCATION()
        : null;
      const payload = await backendRequest("/api/auth/login", {
        email,
        password,
        ...(loginLocation ? { login_location: loginLocation } : {})
      });
      if (!payload.session?.access_token || !payload.session?.refresh_token) {
        throw new Error("The backend did not return an authenticated session.");
      }

      persistSession(payload.session);

      // The local adapter already reads the persisted backend session, so avoid
      // an extra /api/auth/me round trip before routing in Local Cloud mode.
      if (!window.KEDCO_LOCAL_MODE) {
        try {
          const supabase = getClient();
          const activated = await supabase.auth.setSession({
            access_token: payload.session.access_token,
            refresh_token: payload.session.refresh_token
          });
          if (activated?.error) {
            console.warn("KEDCO browser session activation warning", activated.error);
          } else if (activated?.data?.session) {
            persistSession(activated.data.session);
          }
        } catch (sessionError) {
          console.warn("KEDCO browser session activation warning", sessionError);
        }
      }

      let role = String(payload.role || "").trim().toUpperCase();
      const backendRoles = Array.isArray(payload.roles)
        ? [...new Set(payload.roles.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
        : [role].filter(Boolean);
      const preferredRole = String(window.KEDCO_LOGIN_LANDING_ROLE?.[email] || "").trim().toUpperCase();
      if (preferredRole && backendRoles.includes(preferredRole) && routeForRole(preferredRole)) role = preferredRole;
      const configuredRoles = window.KEDCO_USER_DIRECTORY?.[email];
      if (configuredRoles?.length && !backendRoles.some((value) => configuredRoles.includes(value))) {
        throw new Error("This email is not assigned to the returned KEDCO role.");
      }
      if (!role || !routeForRole(role)) throw new Error("The backend returned no valid dashboard role.");
      writeAuthStorage("KEDCO_AUTH_ROLE", role);
      writeAuthStorage("KEDCO_AUTH_ROLES", JSON.stringify(backendRoles));
      writeAuthStorage("KEDCO_ACTIVE_ROLE_CODE", role);
      notice("loginNotice", `Signed in as ${role}. Opening your workspace…`, "success");
      window.location.assign(routeForRole(role));
    } catch (error) {
      try {
        if (client) {
          try { void Promise.resolve(client.auth.signOut()).catch(() => {}); } catch {}
          clearPersistedAuth();
        }
      } catch {
        // Keep the original sign-in/authorization error visible.
      }
      notice("loginNotice", error?.message || "Sign-in failed. Please try again.", "error");
      setBusy(form, false);
    } finally {
      if (form.elements.password) form.elements.password.value = "";
    }
  }

  async function requestReset(form) {
    const email = String(form.elements.resetEmail?.value || "").trim().toLowerCase();
    const validMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validMail) {
      notice("resetNotice", "Enter a valid work email address.", "error");
      form.elements.resetEmail?.focus();
      return;
    }

    setBusy(form, true);
    notice("resetNotice", "Creating a secure, time-limited reset link…", "info");
    try {
      const payload = await backendRequest("/api/auth/reset", { email });
      notice("resetNotice", payload.message || "If an active account matches that address, a secure reset link has been sent.", "success");
    } catch (error) {
      notice("resetNotice", error?.message || "Password recovery failed. Please try again.", "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function completeReset(form) {
    const password = String(form.elements.newPassword?.value || "");
    const confirmation = String(form.elements.confirmPassword?.value || "");
    const token = new URLSearchParams(window.location.search).get("resetToken") || "";
    if (!token) {
      notice("completeResetNotice", "This reset link is missing its security token. Request a new link.", "error");
      return;
    }
    if (password.length < 8) {
      notice("completeResetNotice", "Choose a password with at least 8 characters.", "error");
      form.elements.newPassword?.focus();
      return;
    }
    if (password !== confirmation) {
      notice("completeResetNotice", "The passwords do not match. Check both fields and try again.", "error");
      form.elements.confirmPassword?.focus();
      return;
    }
    setBusy(form, true);
    notice("completeResetNotice", "Updating your KEDCO account password…", "info");
    try {
      const payload = await backendRequest("/api/auth/reset/complete", { token, password });
      form.reset();
      form.hidden = true;
      document.getElementById("resetForm").hidden = true;
      document.getElementById("resetDescription").textContent = payload.message || "Password updated. You can now sign in with your new password.";
      document.getElementById("resetHeading").textContent = "Password updated";
      document.getElementById("backToLogin").textContent = "Return to sign in →";
      document.querySelector(".reset-footnote").hidden = true;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("resetToken");
      window.history.replaceState({}, "", cleanUrl);
      notice("resetNotice", "Your password has been reset successfully.", "success");
    } catch (error) {
      notice("completeResetNotice", error?.message || "Password reset failed. Request a new link and try again.", "error");
    } finally {
      setBusy(form, false);
      if (form.elements.newPassword) form.elements.newPassword.value = "";
      if (form.elements.confirmPassword) form.elements.confirmPassword.value = "";
    }
  }

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id !== "loginForm" && form.id !== "resetForm" && form.id !== "completeResetForm") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.id === "loginForm") void signIn(form);
    else if (form.id === "resetForm") void requestReset(form);
    else void completeReset(form);
  }, true);

  window.addEventListener("DOMContentLoaded", async () => {
    const resetToken = new URLSearchParams(window.location.search).get("resetToken");
    if (resetToken) {
      const modal = document.getElementById("loginModal");
      const dialog = document.getElementById("dialog");
      document.getElementById("resetForm").hidden = true;
      document.getElementById("completeResetForm").hidden = false;
      document.getElementById("resetHeading").textContent = "Choose a new password";
      document.getElementById("resetDescription").textContent = "Your secure reset link is ready. Set a new password for your account below.";
      dialog.classList.add("reset");
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
      window.setTimeout(() => document.getElementById("newPassword")?.focus(), 30);
    }
    try {
      const supabase = getClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      // The local launcher intentionally opens the public index/start page on
      // every restart.  Keep a persisted session available for the explicit
      // sign-in flow, but do not silently jump to a role page while the start
      // page is loading.  Login below still routes directly to the assigned
      // workspace after credentials and location have been confirmed.
      return;
    } catch {
      // An anonymous visitor should remain on the public landing page.
    }
  });
})();
