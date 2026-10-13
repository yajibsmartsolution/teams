# Build the existing TypeScript backend; keep the existing HTML/JS pages unchanged.
FROM node:22-bookworm-slim AS builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/scripts ./scripts
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY backend/package.json ./backend/package.json
COPY frontend ./frontend
WORKDIR /app/backend
EXPOSE 5500
CMD ["node", "dist/server.js"]
