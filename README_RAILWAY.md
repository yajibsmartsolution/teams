# Optional Analyzer–TMO compatibility add-on (13 October 2026)

The new uploaded pages have been staged alongside the original ones to protect existing features:

- `/pages/tmo/progressive-analyzer.html`
- `/pages/tmo/tmo-preview.html`

The new pages share progressive monthly feeder/day records via authenticated `/api/energy/*` endpoints and persistent Railway files. They do **not** replace or rewrite the standard KEDCO Analyzer/TMO reporting datasets. See [`COMPATIBILITY_REPORT.md`](COMPATIBILITY_REPORT.md) before approving a production rollout.

---

# KEDCO Technical Automation — GitHub + Railway deployment

**Target address:** `https://teams.com.ng`  
**Frontend entry:** `frontend/index.html` is served at `/`.  
**Dashboard folder:** `frontend/pages/` (the actual existing path; no renaming to `front/pages/`).  
**Backend:** Node.js 22, Express 5, TypeScript, Dockerfile build.  
**Persisted data:** existing JSON/files adapter, using a Railway persistent volume.

## 1. What changed in this package

- Added `Dockerfile`, `.dockerignore`, root `.gitignore`, and `railway.json` with `/health` check.
- Railway starts the compiled Express backend on `process.env.PORT`, bound to all interfaces.
- `GET /` delivers `frontend/index.html` automatically; `GET /pages/...` serves the original dashboards.
- Fixed Linux case sensitivity: `frontend/pages/tmo/Analyzer.html` is now `frontend/pages/tmo/analyzer.html`. Requests for the old exact case are redirected after authentication.
- Made role-page route manifest absolute (`/pages/...`) and verified all registered route files exist.
- Changed executive frontend configuration to use `location.origin` when accessed over HTTP(S), not a hardcoded localhost server.
- Production mode refuses to start without a durable `KEDCO_LOCAL_DATA_ROOT` or Railway's automatically provided `RAILWAY_VOLUME_MOUNT_PATH`. This avoids silently losing data on redeploy.
- Guarded one-time `/api/auth/setup` with a secret `x-kedco-setup-token` header (minimum 32 characters), and required a valid session cookie to load `/pages` HTML. The existing bearer-auth API remains in use.
- Excluded `.env`, local credentials, `cloud data/`, dependencies, build artifacts and backups from the source bundle.
- Included `tools/verify-deployment.mjs` for local route checks and live HTTP checks.

**Important:** No Railway service or DNS account was accessed, so this package is not yet deployed or publicly verified. Dashboard logic, all internal API flows, and production role-level data authorization have NOT received a complete security / load / business-logic audit. A pilot with authorized test users should precede live KEDCO production access.

## 2. Push safely to GitHub

Extract this ZIP to a normal folder on your computer. In PowerShell from that directory:

```powershell
git init
git add .
git status --short
git commit -m "Configure KEDCO Automation for Railway and teams.com.ng"
git branch -M main
git remote add origin https://github.com/yajibsmartsolution/KEDCO-Automation-Cloud.git
git push -u origin main
```

**Create the GitHub repository first** (private recommended). If `origin` already exists, use `git remote -v` and `git remote set-url origin <correct-repository-url>` instead of `git remote add`. Do not force-push into an unrelated repository. Never commit the original `.rar`, `cloud data`, `.env`, or `LOGIN_DETAILS_PRIVATE.csv`. If credentials were previously pushed, rotate them and consider Git history remediation.

GitHub stores the source; **Railway runs the Node.js application**. GitHub Pages is not used and does not need its own root-level `index.html`.

## 3. Deploy to Railway

1. In [Railway](https://railway.com/new), create a project **Deploy from GitHub Repo** and choose the repository. Authorize GitHub access if requested.
2. Set **Root Directory to repository root (`/`)**. Leave the Dockerfile at root, which lets Railway copy both `frontend/` and `backend/`.
3. In Railway's service settings, attach a **persistent Volume** mounted to **`/data/kedco`**. This is essential. Railway sets `RAILWAY_VOLUME_MOUNT_PATH=/data/kedco` automatically; alternatively explicitly set `KEDCO_LOCAL_DATA_ROOT=/data/kedco`.
4. Add service variables (Railway > Service > Variables):

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` (already set in Dockerfile) |
   | `KEDCO_PUBLIC_URL` | `https://teams.com.ng` |
   | `CORS_ORIGIN` | `https://teams.com.ng` (add more origins, comma-separated, only when necessary) |
   | `KEDCO_LOCAL_DATA_ROOT` | `/data/kedco` (optional if volume auto variable works) |
   | `KEDCO_SETUP_TOKEN` | A **temporary, secret random 32+ character** token, for first admin creation only |
   | `KEDCO_SMTP_HOST`, `KEDCO_SMTP_PORT`, `KEDCO_SMTP_USER`, `KEDCO_SMTP_PASS`, `KEDCO_SMTP_FROM` | Optional, required for password-reset email |

5. Deploy and check Railway logs. The `/health` healthcheck should succeed. Under **Settings > Networking**, generate a temporary Railway public domain and test the login page there first.
6. After the test passes, select **+ Custom Domain** and add `teams.com.ng` to this same service. Set its target port to the service's actual `PORT` if required.
7. At the registrar/DNS provider, create **both** the DNS routing record (Railway-provided CNAME target, using CNAME flattening, ALIAS or ANAME for the apex domain) **and the Railway-provided TXT domain-verification record**. Copy the exact names/targets shown by Railway, not examples from another domain. A root-domain DNS host without flattening support may require DNS migration to a compatible provider.
8. Allow DNS verification and Railway-managed HTTPS to complete. When the domain is verified, browse `https://teams.com.ng/` and confirm the login landing page.
9. Connect the GitHub repo's `main` branch to the Railway service's deployment source to enable automatic deployments on future pushes.

**Note on `PORT`:** do not set a fixed production port merely because localhost used 5500. The server reads Railway's runtime `PORT`; the public domain routes to it.

## 4. Move the existing data separately (do NOT push data to GitHub)

The uploaded original archive contains around **4 GB of uncompressed operational data**, including very large historical snapshots and backup/event files. This ZIP intentionally does **not** include it. A newly attached volume starts empty, so historical dashboards and existing accounts will not appear until the appropriate source data has been migrated.

**Preferred process:**

1. Back up the entire original `cloud data` folder offline, including `system/users.json`, `tables/`, `load-flow/`, `files/`, `operations/`, `registry/`, `workflows/`, and `audit/`.
2. Review backups and `*.tmp` separately. Only **after taking a verified backup**, create a smaller migration archive that excludes old `backups/` and temporary files (they are not needed by the running service). Do not delete original data.
3. Mount `/data/kedco` on Railway. Stop user writes during migration; don't overwrite an already active volume with older data.
4. Upload the data archive through Railway CLI (`railway volume files upload ./cloud-data-migration.tar.gz /cloud-data-migration.tar.gz`) or through `railway volume browse /`. Use a supported authenticated Railway CLI session linked to the correct project/service.
5. To import a tar.gz uploaded at the volume root, open a shell with `railway ssh` for the selected service and run:

   ```bash
   cd /data/kedco
   tar -xzf cloud-data-migration.tar.gz
   # Check that /data/kedco/system and /data/kedco/tables exist directly,
   # rather than a second nested 'cloud data/' directory.
   rm cloud-data-migration.tar.gz
   ```

6. Restart the service, verify a migrated staff account login and representative historical records, and enable Railway Volume backups.

**Important:** A Railway volume is only persistent storage; this application is still a JSON file-backed adapter, **not a migrated PostgreSQL database**. If multi-instance scaling, high concurrency, complex authorization, or large continuous historical datasets are required, plan a proper PostgreSQL/object-storage migration with tested conversion and reconciliation. Avoid scaling this single JSON adapter horizontally: simultaneous writers to multiple replicas can lose updates.

**Railway volume capacity:** verify the selected plan's storage allowance against the dataset size *before* attempting transfer. At the time this guide was prepared, Railway's docs listed 0.5 GB on Free/Trial, 5 GB on Hobby and 50 GB on Pro by default; the source archive's expanded data exceeds Free/Trial volume capacity. Check [current Railway volume limits](https://docs.railway.com/volumes/reference).

## 5. Create the first administrator **only for an empty data volume**

If you have **migrated** the original `cloud data/system/users.json`, existing users should remain available; do not create a replacement admin without validating the migrated files. For a new, empty volume:

1. Generate a random setup token **locally**:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Set `KEDCO_SETUP_TOKEN` to this generated value **only in Railway Variables**. Once the deployment is active and HTTPS is verified, in PowerShell:

   ```powershell
   $token = Read-Host "Enter the temporary Railway KEDCO_SETUP_TOKEN"
   $adminEmail = Read-Host "New admin email"
   $secretPassword = Read-Host "New admin password" -AsSecureString
   $password = [System.Net.NetworkCredential]::new('', $secretPassword).Password
   $body = @{ email = $adminEmail; password = $password; full_name = "KEDCO Administrator" } | ConvertTo-Json
   Invoke-RestMethod -Uri "https://teams.com.ng/api/auth/setup" -Method Post -ContentType "application/json" -Headers @{ "x-kedco-setup-token" = $token } -Body $body
   Remove-Variable token,password,body,secretPassword
   ```

3. **Remove `KEDCO_SETUP_TOKEN` from Railway Variables immediately after success**, and redeploy if prompted. The setup route rejects new setup if a user already exists.
4. Test the first admin sign-in, dashboard routing, logout, password reset (only if SMTP is configured), and normal user creation.

Treat initial account credentials and the setup secret as highly sensitive. Do not store them in source-control examples, tickets, or screenshots.

## 6. Verify locally and on the deployed domain

For development on Windows, install dependencies in `backend/` and run:

```powershell
cd backend
npm ci
npm run build
$env:KEDCO_LOCAL_DATA_ROOT="../cloud data"
$env:PORT="5500"
npm start
```

From the repository root, run:

```powershell
node tools/verify-deployment.mjs
node tools/verify-deployment.mjs https://teams.com.ng
```

The live checker verifies the root page, healthcheck and Analyzer URL **only**. Because dashboards now require login, the live Analyzer request redirects to `/` before authentication; both return HTTP 200 after the checker follows redirects. To verify authorized dashboard access, sign in in the browser and navigate to an authorized role page. Also check network requests, data, charts, eForms and uploads with test accounts.

**Deployment remains pending** until the Railway service, DNS records, durable data migration, and full application acceptance testing are completed in the owner's accounts.

## 7. Remaining security and performance work for a full production launch

- Role-based authorization is not fully enforced on the server's generic table APIs. The new page session check prevents anonymous dashboard HTML navigation, but **does not replace resource-level ACLs**. Conduct a route-by-route API authorization review before exposing confidential operational data to many employees.
- Rate-limit `/api/auth/login`, `/api/auth/reset`, and other sensitive endpoints; establish brute-force monitoring, server-side session controls, and incident response.
- Review the legacy signed-download URL/token implementation, audit logging (do not log secrets or reset tokens), restrictive CORS, CSP and data-retention policies.
- Validate app-wide navigation in-browser, cross-page role switching, historical data integrity, uploaded documents and all data calculations. The static manifest/link checks are not equivalent to complete E2E testing.
- Benchmark multi-GB snapshot reads and synchronous JSON files. Introduce a transactional database for concurrency and a managed object store for larger uploads when ready.
- Only launch to the public after approval by the relevant KEDCO system/data owners.

**References:** [Railway custom domain setup](https://docs.railway.com/networking/domains/working-with-domains), [persistent volumes](https://docs.railway.com/volumes), [Railway configuration as code](https://docs.railway.com/config-as-code), [Railway monorepo setup](https://docs.railway.com/deployments/monorepo).
