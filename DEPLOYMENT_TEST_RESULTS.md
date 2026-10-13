# KEDCO migration: local validation report

**Prepared:** 13 October 2026  
**Target domain:** `teams.com.ng`  
**Scope:** Deployment configuration and local routing/authentication smoke checks only.

## Passed

- TypeScript compiler: `tsc -p backend/tsconfig.json` passed using dependencies restored from the uploaded archive for testing.
- Role manifest: 27 unique dashboard files found, including the corrected lowercase `pages/tmo/analyzer.html`.
- Dashboard HTML links: all referenced local script, image and stylesheet files resolved in the inspected role pages.
- Local HTTP server: startup succeeded with a temporary data directory and a dynamic port.
- `GET /health` returned 200 JSON.
- `GET /` returned the original `frontend/index.html` landing page.
- Anonymous `GET /pages/tmo/analyzer.html` redirected to login.
- Unauthenticated `POST /api/auth/setup` returned 403.
- One-time setup with a valid temporary test token succeeded.
- A test admin was able to sign in, receive an HttpOnly dashboard session cookie, and view `analyzer.html`.
- A static landing image returned HTTP 200.
- An anonymous table API request was rejected with HTTP 401.
- Test user and temporary data were created solely in an isolated temporary directory and were not included in the deliverable.

## Not yet verified

- A remote Railway Docker build/release and healthcheck in a real Railway project.
- DNS ownership verification, SSL issuance, or external availability of `https://teams.com.ng`.
- Transfer of historical `cloud data` onto a mounted Railway volume.
- Application-wide eForms, calculations, visual dashboards, account roles and performance under real data.
- Full security audit: the existing generic data API requires more granular authorization before unrestricted production use.

**Status:** *GitHub/Railway deployment package locally checked; live deployment remains pending owner configuration and broader acceptance testing.*
