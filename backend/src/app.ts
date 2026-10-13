import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import catalogRoutes from "./routes/catalog.js";
import filesRoutes from "./routes/files.js";
import inventoryRoutes from "./routes/inventory.js";
import networkRoutes from "./routes/network.js";
import notificationsRoutes from "./routes/notifications.js";
import submissionsRoutes from "./routes/submissions.js";
import tasksRoutes from "./routes/tasks.js";
import localAuthRoutes from "./local/auth-routes.js";
import { userForAccessToken } from "./local/auth-store.js";
import localDataRoutes from "./local/data-routes.js";
import energyRoutes from "./local/energy-routes.js";
import localOperationsRoutes from "./local/operations-routes.js";
import localAdminRoutes from "./local/admin-routes.js";
import { requireLocalAuth } from "./local/middleware.js";
import { ensureLocalLayout } from "./local/store.js";

const app = express();
const frontendRoot = path.resolve(__dirname, "../../frontend");
const localMode = true;
if (localMode) ensureLocalLayout();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const configuredOrigins = (config.corsOrigin || "").split(",").map(origin => origin.trim()).filter(Boolean);
const localOrigins = ["http://localhost:3000", "http://localhost:5500", "http://localhost:5501", "http://localhost:5502", "http://127.0.0.1:3000", "http://127.0.0.1:5500", "http://127.0.0.1:5501", "http://127.0.0.1:5502"];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"], formAction: ["'self'"], frameAncestors: ["'self'"],
      imgSrc: ["'self'", "https:", "data:", "blob:"], objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://maps.googleapis.com", "https://maps.gstatic.com"],
      scriptSrcAttr: ["'unsafe-inline'"], styleSrc: ["'self'", "https:", "'unsafe-inline'"], workerSrc: ["'self'", "blob:"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  }
}));
app.use(cors({ origin(origin, callback) {
  if (!origin || configuredOrigins.includes("*") || configuredOrigins.includes(origin)) return callback(null, true);
  if (process.env.NODE_ENV !== "production" && (localOrigins.includes(origin) || origin === "null")) return callback(null, true);
  return callback(null, false);
}}));
app.use(express.json({ limit: "25mb" }));
app.use(morgan("combined"));

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "KEDCO Technical Automation",
  storage_mode: config.storageMode,
  timestamp: new Date().toISOString()
}));

app.use("/api/auth", localAuthRoutes);
app.use("/api/local", localDataRoutes);
app.use("/api/energy", energyRoutes);
app.use("/api/admin", requireLocalAuth, localAdminRoutes);
app.use("/api/operations", requireLocalAuth, localOperationsRoutes);
// Shared endpoint groups are backed by the local file adapter.
app.use("/api/catalog", requireLocalAuth, catalogRoutes);
app.use("/api/files", requireLocalAuth, filesRoutes);
app.use("/api/inventory", requireLocalAuth, inventoryRoutes);
app.use("/api/network", requireLocalAuth, networkRoutes);
app.use("/api/notifications", requireLocalAuth, notificationsRoutes);
app.use("/api/submissions", requireLocalAuth, submissionsRoutes);
app.use("/api/tasks", requireLocalAuth, tasksRoutes);

// Express serves the root login page, original assets, and all /pages/* dashboards.
// Keep the frontend at repository root level alongside backend: no page relocation needed.
app.use("/pages", (req, res, next) => {
  const cookie = String(req.headers.cookie || "").split(";").map(value => value.trim());
  const token = cookie.find(value => value.startsWith("kedco_dashboard="))?.slice("kedco_dashboard=".length) || "";
  if (!userForAccessToken(token)) return res.redirect(302, "/");
  next();
});
app.use((req, res, next) => {
  if (req.path === "/pages/tmo/Analyzer.html") return res.redirect(308, "/pages/tmo/analyzer.html");
  next();
});
app.use(express.static(frontendRoot, { index: "index.html", dotfiles: "deny", fallthrough: true }));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);
export default app;
