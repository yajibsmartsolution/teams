import "dotenv/config";
import path from "node:path";

const production = process.env.NODE_ENV === "production";
const dataRoot = process.env.KEDCO_LOCAL_DATA_ROOT || process.env.RAILWAY_VOLUME_MOUNT_PATH;
if (production && !dataRoot) {
  throw new Error("Persistent storage is required: attach a Railway volume and set KEDCO_LOCAL_DATA_ROOT or use RAILWAY_VOLUME_MOUNT_PATH.");
}

const requestedPort = Number(process.env.PORT || 5500);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
  throw new Error("PORT must be a valid TCP port number.");
}

export const config = {
  port: requestedPort,
  storageMode: "local" as const,
  localDataRoot: path.resolve(dataRoot || "../cloud data"),
  corsOrigin: process.env.CORS_ORIGIN || (production
    ? "https://teams.com.ng"
    : "http://localhost:3000,http://localhost:5500,http://localhost:5501,http://localhost:5502,http://127.0.0.1:3000,http://127.0.0.1:5500,http://127.0.0.1:5501,http://127.0.0.1:5502")
};
