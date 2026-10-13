# KEDCO Frontend Cleanup — Audit Report

**Source:** User-uploaded `frontend.rar` (13 October 2026).
**Scope:** Only `frontend/`; backend and existing GitHub working tree were not modified.

**Original:** 114 files (53.29 MiB).
**Removed from production frontend:** 37 files, including 34 HTML pages (16.42 MiB).
**Remaining:** 77 files (36.87 MiB).

## Retained intentionally
- Main login/landing `index.html`, active role routes and all production module pages.
- `pages/tmo/analyzer.html` and `pages/tmo/tmo.html`, plus the mutually connected progressive Analyzer/TMO preview.
- `pages/operations-maintenance/ws.html` (redirect used by `works.html`) and `wsr.html`.
- `pages/preparedness.html` and `pages/developer/preparedness.html` because the directory/register references both.
- All `assets/` files and shared JavaScript, JSON and CSS resources. Only one existing RE/TE Home link was corrected; all other retained source content is unchanged.

## Checks
- Role route targets from `kedco-page-routes.js`: 27 distinct, missing: 0.
- Local static HTML links checked: 310, missing targets: 0.
- Kept-source references to removed filenames: 0.
- SHA-256 checks: 76 of 77 retained files match the originals byte-for-byte; one has the documented Home-link correction.

This is a static source-reference audit, not a browser acceptance test. Dynamic page URLs, stored user links, other repositories and browser bookmarks may still point to historical pages.

## Removed files (also available in separate backup ZIP)

| Removed path | Reason |
|---|---|
| `README_FRONTEND_STRUCTURE.txt` | Development notes; retained in archived copy, not needed for frontend runtime |
| `__dispatch-11kv-paste-test.html` | Developer test page; not referenced from runtime navigation |
| `clear-kedco-33kv-cache.html` | Standalone development/cache reset utility; not linked from runtime navigation |
| `clear-kedco-browser-data.html` | Standalone browser wipe utility; not linked from runtime navigation |
| `local-access-diagnostic.html` | Development diagnostic; should not be published as a public page |
| `pages/operations-maintenance/re22_te.html` | Unreferenced historical RE/TE variant; identical to re_te7.html |
| `pages/operations-maintenance/re_te (2).html` | Unreferenced alternate RE/TE page |
| `pages/operations-maintenance/re_te1.html` | Unreferenced numbered RE/TE page |
| `pages/operations-maintenance/re_te2.html` | Unreferenced numbered RE/TE page |
| `pages/operations-maintenance/re_te7.html` | Unreferenced historical RE/TE variant; identical to re22_te.html |
| `pages/operations-maintenance/re_teABC.html` | Unreferenced historical RE/TE page |
| `pages/pcm/KEDCO-Head-PCM-Fix-Test-Report-20260920.txt` | Development test report, not a runtime dependency |
| `pages/pcm/KEDCO-Head-PCM-Fix-Test-Report.txt` | Development test report, not a runtime dependency |
| `pages/pcm/headpcm(7).html` | Unreferenced older Head PCM variant |
| `pages/pcm/headpcm1.html` | Unreferenced older Head PCM variant |
| `pages/planning-investment/headpia.html` | Unreferenced alternate Head P&I page |
| `pages/stores/tory7.html` | Unreferenced older store variant |
| `pages/system-operations/7dispatch.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/ddispatch.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/dispatch1 (2).html` | Unreferenced historical dispatch variant |
| `pages/system-operations/dispatch1.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/dispatch11.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/dispatch12.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/dispatch3.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/dispatchA.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/dispatchAAA.html` | Unreferenced historical dispatch variant |
| `pages/system-operations/operator77.html` | Unreferenced historical operator variant |
| `pages/tmo/7analyzer.html` | Unreferenced historical Analyzer variant |
| `pages/tmo/7tmo.html` | Unreferenced historical TMO variant |
| `pages/tmo/KEDCO_TMO_Dashboard_DARK_NO_HSE_WORKFLOW.html` | Unreferenced older TMO variant; identical to tmoASA.html |
| `pages/tmo/KEDCO_TMO_Dashboard_KEDCO_APPROVED_ALL_CHARTS.html` | Unreferenced historical TMO variant |
| `pages/tmo/YAJIB_Feeder_Analyzer_TMO_Validation.html` | Exact duplicate of preserved pages/tmo/analyzer.html |
| `pages/tmo/YAJIB_Intelligent_Feeder_Analyzer_KEDCO_APPROVED_CHARTS.html` | Unreferenced historical Analyzer variant |
| `pages/tmo/YAJIB_Intelligent_Feeder_Analyzer_TMO_65_35_CSS_FIXED.html` | Unreferenced Analyzer variant; identical to analyzerABC.html and analyzerq.html |
| `pages/tmo/analyzerABC.html` | Unreferenced historical Analyzer variant; identical to analyzerq.html |
| `pages/tmo/analyzerq.html` | Unreferenced historical Analyzer variant; identical to analyzerABC.html |
| `pages/tmo/tmoASA.html` | Unreferenced historical TMO variant; identical to KEDCO_TMO_Dashboard_DARK_NO_HSE_WORKFLOW.html |

## Missing static files in existing source (if any)

None found by the HTML static asset/link scan.

## Deployment precautions

1. Keep a copy of the current GitHub frontend and the separate redundant-pages backup archive.
2. Reconcile the cleaned `frontend/` with your VS Code repository. Do **not** use automatic mirror deletion on arbitrary directories.
3. Check `git status` and `git diff --cached` before committing; stage `frontend/` only when appropriate.
4. Deploy on a Railway test service before changing the approved production site; test login, role routing, TMO, Analyzer, Dispatch, eForms, workshop and Reports.
5. Do not publish internal KEDCO operational data or secrets in a public GitHub repository.
