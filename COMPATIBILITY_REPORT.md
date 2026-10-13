# Two-page integration report · 2026-10-13

## Delivery strategy

The uploaded `anaalyzer.html` and `tmo(20261013-035009).html` are **not safe drop-in replacements** for the existing `frontend/pages/tmo/analyzer.html` and `frontend/pages/tmo/tmo.html`.
The existing Analyzer has substantially more capabilities and different storage models. The newer TMO includes an embedded July 2026 dataset. Neither uploaded page is automatically a live source of current-day figures.

To preserve the prior app, this integration adds **parallel, authenticated preview pages**:
- `/pages/tmo/progressive-analyzer.html` — the uploaded progressive Analyzer, with shared-server storage integration and a correction for non-consecutive uploaded days.
- `/pages/tmo/tmo-preview.html` — the newly uploaded TMO HTML, with a read-only *Progressive Feeder Energy* panel that pulls the same month's actual records from the Railway backend.

Production role links continue to point to the original Analyzer and TMO pages. Promote these two preview pages only after validating their datasets and reporting calculations with the CTO/TMO team.

## Data model and integration details

`POST /api/energy/months/YYYY-MM/merge` saves 1–5000 validated feeder/day energy rows to persistent server files. A unique `(day, normalized feeder name, voltage)` key avoids duplicate rows; a later revision replaces the previous value.

`GET /api/energy/months/YYYY-MM` provides month records to both authenticated pages.
`POST /api/energy/months/YYYY-MM/classify` changes the customer group for a feeder in the selected month.
`DELETE /api/energy/months/YYYY-MM` clears the selected month in server storage, leaving an empty month marker and audit event.

The two pages now share *progressive* feeder energy across logged-in devices when the Railway storage volume is configured. The TMO preview displays this as an **independent source panel** and intentionally does not rewrite existing hourly readings, frequency, feeder-status KPIs, or executive figures to avoid double-counting.

In the new Analyzer, the month-end forecast uses the **number of uploaded days**, not the latest numbered day. This avoids one error with missing dates, but cannot detect incomplete feeder coverage on each uploaded day; forecasts remain provisional.

## Known limits before public production approval

1. The original full Analyzer uses `yajib-feeder-analyzer-v1`, not `kedco.tmo.energy.v3`. The preview does **not** migrate this legacy dataset into the new endpoint.
2. The new Analyzer's 11kV-to-Regional and 33kV-to-MD fallbacks are only editable assumptions. Validate circuit classifications before taking revenue decisions.
3. The new Analyzer uses a **single editable tariff** for regional-excess valuation and does not automatically implement band-specific tariff conversions; review ₦ calculations independently.
4. Different feeder records with different source names may still represent the same physical circuit; manual reconciliation remains necessary.
5. The TMO preview has its own complex hourly/operational-source logic, which has **not** been regression-tested against every chart, file type, market segment, or date combination. Its own July-2026 embedded dataset should not be mistaken for current October-2026 readings.
6. Only the special `/api/energy` endpoints have the new role-specific access gate. Existing legacy endpoints have their own policies and require a separate comprehensive security review.
7. Browser-only historical progressive records are not silently uploaded. Export them before migrating to the shared backend.
8. Changes to customer classifications in other previously uploaded months are not propagated by the preview to all remote months; update each affected reporting month separately.
9. Railway must have a correctly mounted persistent volume and a working account login before cross-device sync is possible.

## Tests to perform in Railway staging

1. Log in as a TMO/Analyzer/CTO authorized role; open `/pages/tmo/progressive-analyzer.html`.
2. Import a sample CSV for two nonconsecutive October days; preview and merge. Verify server-sync status and the correct uploaded-day denominator for provisional forecasts.
3. Open `/pages/tmo/tmo-preview.html`. Its *Progressive Feeder Energy* card should show the same October totals after selecting October.
4. Open the same pages from a second authenticated device; verify totals agree.
5. Attempt the backend endpoint unauthenticated (401) and with an unapproved role (403).
6. Verify the existing original `/pages/tmo/analyzer.html` and `/pages/tmo/tmo.html` still load unchanged.

## Rollout

Use this branch as a staging/candidate release. Do not make the larger new TMO the default until approved by operational management and validated against known feeder sheets.
