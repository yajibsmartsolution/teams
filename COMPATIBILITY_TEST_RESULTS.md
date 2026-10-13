# Compatibility test results · 2026-10-13

## Passed

- `npm run build` (TypeScript): passed.
- `node --check` for extracted inline JavaScript scripts in both newly staged HTML pages: passed.
- Local HTTP `/health`: 200 OK.
- Accessing `/api/energy/months/2026-10` without authentication: 401.
- Accessing new `/pages/tmo/progressive-analyzer.html` without login: 302 redirect to home.
- Authenticated administrator setup and login: passed.
- Authenticated HTTP GET of both new preview pages: 200.
- POST shared feeder/day records: passed.
- GET both feeder records from the central backend: passed.
- Upsert replacing an earlier feeder/day without duplicate: passed.
- Reclassify a feeder in selected month: passed.
- Reject invalid February day and invalid month: 400.
- Clear selected month: passed; subsequent GET returns no records.

## Not verified

- A complete interactive Chromium browser test could not be completed because navigation to the local test server was blocked by administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). Browser rendering of all menus and XLSX parsing remains unverified.
- Cross-device Railway test, Railway persistence restart test, production DNS/HTTPS, all original app modules, and full TMO calculation reconciliation remain unverified.

## Release decision

Candidate for **controlled Railway staging only**. Keep original role paths unchanged until approved and end-to-end-tested with real feeder data.
