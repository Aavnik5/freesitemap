# FreePornX Phase Execution Runbook

## Phase 0: Baseline Audit
- Use `phase0_audit.ps1` to measure endpoint availability and response time baseline.
- Core checks included:
  - homepage + stories tab
  - robots + sitemap index
  - worker health + stories feed
- Browser vitals baseline (`LCP`, `CLS`, `INP`) is logged to `localStorage.fpx_baseline_vitals_last` from `index.html`.

## Phase 1: Quick Wins
- Story feed render now uses:
  - skeleton loading UI
  - `DocumentFragment` batch append
  - timeout-safe API fetch
- Ad cards now use fixed slot height (`.ad-slot-fixed`) to reduce layout shift.
- Added preconnect hints for critical CDNs.

## Phase 2: UI System Upgrade
- Added style tokens (`:root`) for spacing/colors.
- Story cards and navigation received consistent visual system updates.
- Mobile safe-area support added for bottom nav and content spacing.

## Phase 3: SEO Core
- Stories are rendered with crawlable anchor links (not only click handlers).
- Stories tab now emits `CollectionPage` + `ItemList` schema based on feed results.
- Story page canonical URL normalization added (`sid` + `url` format).

## Phase 4: Content SEO Scale
- Story page now updates `Article` schema dynamically.
- Related stories block added under full story content.
- `generate_story_sitemap.ps1` now refreshes sitemap `lastmod` automatically.

## Phase 5: Ads & Revenue UX
- Story feed ad strategy:
  - every 2 stories, 1 ad slot
  - session cap (`10`) via `sessionStorage`
  - idle-time ad serving call to reduce main-thread jank

## Phase 6: Stability & Monitoring
- Worker has `/health` (`/healthz`, `/metrics`) endpoint.
- Worker responses include `X-Worker-Version`.
- Worker now uses timeout-safe upstream fetch and returns `timing_ms`.
- Weekly monitor helper script: `weekly_monitor.ps1`.

## Operational Commands
1. Baseline check:
```powershell
powershell -ExecutionPolicy Bypass -File .\phase0_audit.ps1
```
2. Regenerate stories sitemap:
```powershell
powershell -ExecutionPolicy Bypass -File .\generate_story_sitemap.ps1
```
3. Weekly worker health check:
```powershell
powershell -ExecutionPolicy Bypass -File .\weekly_monitor.ps1
```
