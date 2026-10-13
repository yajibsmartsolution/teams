// ============================================================
// KEDCO TECHNICAL AUTOMATION
// Backend Server Entry Point
// ============================================================

import app from "./app.js";
import { config } from "./config.js";

app.listen(config.port, "0.0.0.0", () => {
  console.log(`KEDCO backend running on port ${config.port}`);
});
