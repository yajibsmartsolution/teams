import crypto from "node:crypto";
import { Router } from "express";
import { createSession, createUser, refreshSession, revokeAccessToken, userCount, verifyUser, users, publicUser, setPassword, createPasswordReset, completePasswordReset } from "./auth-store.js";
import { bearerToken, requireLocalAuth } from "./middleware.js";
import nodemailer from "nodemailer";

const router = Router();

/** Dashboard navigation uses a short-lived, HttpOnly cookie; APIs continue using bearer auth. */
function setDashboardCookie(res: import("express").Response, session: { access_token: string; expires_in: number }) {
  res.cookie("kedco_dashboard", session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/pages",
    maxAge: Math.max(0, session.expires_in) * 1000
  });
}


router.get("/", (_req, res) => res.json({ ok: true, module: "Local Authentication", mode: "local" }));
router.get("/setup-status", (_req, res) => res.json({ ok: true, setup_required: userCount() === 0, users: userCount() }));

router.post("/setup", async (req, res, next) => {
  try {
    if (userCount() > 0) return res.status(409).json({ error: "Local KEDCO authentication is already initialized." });
    const expected = String(process.env.KEDCO_SETUP_TOKEN || "");
    const provided = String(req.get("x-kedco-setup-token") || "");
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (expected.length < 32 || !provided || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: "Administrator setup is disabled or requires a valid setup token." });
    }
    const user = await createUser({
      email: String(req.body?.email || ""),
      password: String(req.body?.password || ""),
      fullName: String(req.body?.full_name || "KEDCO Local Administrator"),
      roles: ["SUPER_ADMIN", "DEVELOPER"],
      primaryRole: "SUPER_ADMIN"
    });
    res.json({ ok: true, user });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (userCount() === 0) return res.status(503).json({ error: "Local KEDCO login is not initialized. Run Initialize-KEDCO-LocalAdmin.ps1 first." });
    const user = verifyUser(email, password);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    const rawLocation = req.body?.login_location;
    const latitude = Number(rawLocation?.latitude);
    const longitude = Number(rawLocation?.longitude);
    const accuracy = Number(rawLocation?.accuracy);
    const loginLocation = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
      ? { latitude, longitude, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 0, timestamp: String(rawLocation.timestamp || new Date().toISOString()).slice(0, 40) }
      : undefined;
    const session = await createSession(user, {
      ipAddress: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim() || undefined,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 400) || undefined,
      loginLocation
    });
    setDashboardCookie(res, session);
    res.json({ user: session.user, role: user.primary_role, roles: user.roles, session });
  } catch (error) { next(error); }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const token = String(req.body?.refresh_token || "").trim();
    const session = await refreshSession(token);
    if (!session) return res.status(401).json({ error: "KEDCO local session expired. Please sign in again." });
    setDashboardCookie(res, session);
    res.json({ user: session.user, session });
  } catch (error) { next(error); }
});

router.post("/logout", requireLocalAuth, async (req, res, next) => {
  try {
    await revokeAccessToken(bearerToken(req.headers.authorization));
    res.clearCookie("kedco_dashboard", { path: "/pages" });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post("/reset", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const host = process.env.KEDCO_SMTP_HOST;
    const user = process.env.KEDCO_SMTP_USER;
    const pass = process.env.KEDCO_SMTP_PASS;
    const from = process.env.KEDCO_SMTP_FROM || user;
    if (!host || !user || !pass || !from) {
      return res.status(503).json({ error: "Password reset email is not configured yet. Set KEDCO_SMTP_HOST, KEDCO_SMTP_USER, KEDCO_SMTP_PASS and KEDCO_SMTP_FROM in the backend .env file." });
    }
    const reset = await createPasswordReset(email);
    if (reset) {
      const secure = String(process.env.KEDCO_PUBLIC_URL || "https://teams.com.ng").replace(/\/$/, "");
      const link = new URL("/", secure);
      link.searchParams.set("resetToken", reset.token);
      const transport = nodemailer.createTransport({
        host,
        port: Number(process.env.KEDCO_SMTP_PORT || 587),
        secure: String(process.env.KEDCO_SMTP_SECURE || "false").toLowerCase() === "true",
        auth: { user, pass }
      });
      await transport.sendMail({
        from,
        to: email,
        subject: "Reset your KEDCO Technical Automation password",
        text: `Hello ${reset.fullName},\n\nUse this secure link to reset your password. It expires in 30 minutes and can only be used once:\n${link.href}\n\nIf you did not request this, you can ignore this email.`,
        html: `<div style="margin:0;padding:32px;background:#eef4fa;font-family:Arial,sans-serif;color:#10243b"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #d7e2ef;border-radius:18px;overflow:hidden"><div style="padding:24px 28px;background:linear-gradient(120deg,#061b3a,#0d62b8);color:#fff"><div style="font-size:11px;letter-spacing:2px;color:#ffe08a;font-weight:bold">KEDCO · TECHNICAL AUTOMATION</div><h1 style="font-size:24px;margin:12px 0 0">Reset your password</h1></div><div style="padding:28px"><p>Hello ${String(reset.fullName).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] || c))},</p><p>We received a request to reset your KEDCO account password. Use the button below to choose a new password.</p><p style="margin:26px 0"><a href="${link.href}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#087747;color:#fff;text-decoration:none;font-weight:bold">Set a new password</a></p><p style="font-size:13px;color:#52657c">This secure link expires in 30 minutes and works once. If you did not request the reset, ignore this message.</p><div style="padding-top:16px;border-top:1px solid #e2eaf3;font-size:11px;color:#718096">For your security, the link is tied to your KEDCO account and updates its password immediately after confirmation.</div></div></div></div>`
      });
    }
    res.json({ ok: true, message: "If an active account matches that address, a secure reset link has been sent." });
  } catch (error) { next(error); }
});

router.post("/reset/complete", async (req, res, next) => {
  try {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (password.length < 8) return res.status(400).json({ error: "Choose a password with at least 8 characters." });
    const changed = await completePasswordReset(token, password);
    if (!changed) return res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." });
    res.json({ ok: true, message: "Your password has been updated. Sign in with your new password." });
  } catch (error) { next(error); }
});

router.get("/me", requireLocalAuth, (_req, res) => {
  const user = res.locals.kedcoUser;
  res.json({ user: publicUser(user), role: user.primary_role, roles: user.roles });
});

router.get("/local-users", requireLocalAuth, (_req, res) => {
  const actor = res.locals.kedcoUser;
  if (!actor.roles?.some((r: string) => ["SUPER_ADMIN", "DEVELOPER"].includes(r))) return res.status(403).json({ error: "Administrator role required" });
  res.json({ users: users().map(publicUser) });
});

router.post("/local-users", requireLocalAuth, async (req, res, next) => {
  try {
    const actor = res.locals.kedcoUser;
    if (!actor.roles?.some((r: string) => ["SUPER_ADMIN", "DEVELOPER"].includes(r))) return res.status(403).json({ error: "Administrator role required" });
    const user = await createUser({
      email: String(req.body?.email || ""), password: String(req.body?.password || ""), fullName: String(req.body?.full_name || ""),
      roles: Array.isArray(req.body?.roles) ? req.body.roles : [String(req.body?.primary_role || "")], primaryRole: String(req.body?.primary_role || "")
    });
    res.json({ ok: true, user });
  } catch (error) { next(error); }
});

router.post("/local-users/password", requireLocalAuth, async (req, res, next) => {
  try {
    const actor = res.locals.kedcoUser;
    if (!actor.roles?.some((r: string) => ["SUPER_ADMIN", "DEVELOPER"].includes(r))) return res.status(403).json({ error: "Administrator role required" });
    await setPassword(String(req.body?.email || ""), String(req.body?.password || ""));
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
