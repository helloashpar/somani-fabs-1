# Somani Fabs — Heritage Shop + AI Try-On Admin Platform

## Original Problem Statement
Unstitched fabric shop "Somani Fabs - Shivnarayan Shivbhagwan Somani" (Kuchaman City, Rajasthan). Needs:
- Public heritage landing page (mobile-first), multi-language (Hinglish default + English + Hindi, persisted).
- /admin password-protected operational tool: super admin (superashwini) + admin users, action logs.
- Session canvas: create customer sessions (name, mobile, optional 2nd mobile, mandatory photo via guided camera), live customer search/autofill, returning-customer recognition with stored photo.
- AI virtual try-on (Gemini gemini-3-pro-image): top/bottom/top+bottom/top+bottom+3rd, fabric photo + garment type → photorealistic try-on preserving face/body/angle and exact fabric color/texture; adaptive studio background (dark bg for light fabric, light bg for dark fabric).
- Trials list (fabric thumb | try-on thumb | description | View), paginated 10/page.
- Live LED display page at /d/{secret}: chrome-less, auto-refreshing grid (1/2/3/4 split) of currently-previewed try-ons + metadata; idle branded screen.
- End session (purchased/not, total/discount/final paid). Customer DB + Excel export, session history (edit/delete), statistics (date range), super-admin config of trial categories/items and session fields.
- Try-on/fabric images auto-deleted after 7 days; customer photo kept forever.

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT auth (Bearer), bcrypt. Gemini via google-genai (user's own key) in gemini_service.py. Pandas+openpyxl for Excel. TTL index on trials.expire_at (7 days).
- Frontend: React 19 + Tailwind + shadcn + framer-motion. Routes: / (Landing), /admin (AdminApp), /d/:secret (Display). i18n via context+localStorage.
- Live display via polling (admin posts preview + 5s heartbeat; display polls every 2s; 12s expiry).

## User Personas
- Super admin (owner): full config, admin management, logs, all operations.
- Admins (shop staff): run sessions, try-ons, view DB/history/stats (cannot manage admins/config).

## Implemented (2026-06-26)
- Public heritage landing page with real shop photo, brands marquee, sections, language toggle.
- Admin auth, super admin seeded, create/delete admins, action logs.
- Session canvas, create session (camera capture w/ framing guide + readiness indicator), live customer search/autofill, today/past sessions popup with date navigation.
- AI try-on wizard + Gemini generation (verified real generation works), trial list w/ pagination, full-screen preview, change photo.
- Live LED display page (grid splits, auto-refresh, idle screen) + auto-generated secret + copy link + idle image upload.
- End session, customer DB + Excel export, customer profile w/ lifetime stats, session history (edit purchase / delete), statistics by date range, super-admin config (categories/items, session fields), 7-day TTL on trial images.
- Backend tested 23/23 (incl. real Gemini try-on).

## Deployment Fixes (2026-06)
- Fixed prod startup crash (ServerSelectionTimeoutError / SSL EOF): added Motor client timeouts (serverSelectionTimeoutMS/connectTimeoutMS/socketTimeoutMS, retryWrites) and moved all DB seeding into a background `_seed_with_retry()` asyncio task with exponential backoff, so FastAPI binds to port 8001 & passes /health probe immediately.
- Fixed N+1 query blocker: `bulk_customer_stats()` computes stats for all customers in ONE aggregation ($group). Used in /api/customers and /api/customers/export.
- deployment_agent: PASS. Verified via curl (login, customers, export=200 xlsx).

## Intermittent 500 Fix (2026-06)
- ROOT CAUSE of production intermittent 500s (login/sessions/generation) + endless buffering + "session sometimes missing": the public `/api/display/{secret}/state` endpoint (polled every 2s by the 24/7 LED display) returned FULL base64 `generated_image` for up to 8 previews on EVERY poll, starving the Mongo connection pool. Amplified by my earlier aggressive timeouts (serverSelectionTimeoutMS=5000/socketTimeoutMS=20000).
- FIXES: (1) production-safe Motor client (serverSelectionTimeoutMS=30000, connectTimeoutMS=20000, socketTimeoutMS=45000, maxPoolSize=50, maxIdleTimeMS=60000, retryWrites/retryReads); (2) display_state now returns a version/ETag — clients pass ?v=<version> and get {unchanged:true} (tiny payload) when nothing changed, images only sent on change; batched trial image fetch via $in (no N+1); (3) get_session trials projection excludes unused garments.fabric_b64 to shrink payload.
- Frontend Display.js sends last version and skips re-render when unchanged.
- Verified: testing_agent iteration_2 — 42/42 backend tests pass, zero 5xx under sequential+parallel hammer load. NOTE: fix must be REDEPLOYED to production to take effect.

## Async Try-On Generation + Auto-preview + Prompt tweak (2026-06)
- FIXED Cloudflare "origin did not respond in time" false alarm during image generation: POST /sessions/{sid}/trials/generate now inserts a trial with status="generating" and returns IMMEDIATELY; generation runs in a background asyncio task (_run_generation) that updates the trial to status="done" (with generated_image) or "failed" (with error). New GET /trials/{tid} lets the client poll. No more long-held request → no origin/Cloudflare timeout.
- Frontend NewTrial.js polls GET /trials/{tid} every 3s (2.5s first) up to 180s; on done calls onDone(completedTrial), on failed shows toast. Uses a cancelled ref to stop polling on unmount.
- SessionView onDone now auto-opens the completed trial's PreviewModal (setPreview(newTrial)) so the image shows immediately; closing it reveals the refreshed trials list.
- Gemini prompt (gemini_service.py) updated: garments must be crisply ironed, completely wrinkle-free, well-fitted, with smooth crease-free sleeves (added garment-finish constraint).
- Verified end-to-end via curl: generate→generating→(real Gemini ~24s)→done with 622KB image. NOTE: REDEPLOY required for production.

## Broken Generated Image Fix — Gemini 503 + fallback (2026-06)
- ROOT CAUSE of "generated photo not loading" (broken thumbnails): the primary image model `gemini-3-pro-image` (Nano Banana Pro) intermittently returns 503 UNAVAILABLE ("high demand"). Failed generation left trials with status=failed + empty generated_image → broken <img>.
- FIX 1 (gemini_service.py): retry-with-backoff (3 attempts, 3s/6s) on transient errors (503/429/500/UNAVAILABLE/RESOURCE_EXHAUSTED/no-image), then AUTOMATIC FALLBACK to `gemini-3.1-flash-image` (Nano Banana 2 — faster, more available, still 4K). Env: GEMINI_IMAGE_MODEL (primary), GEMINI_IMAGE_FALLBACK_MODEL (default gemini-3.1-flash-image). Confirmed current 2026 model IDs; `-preview` variants deprecated.
- FIX 2 (SessionView.js): guards the try-on <img> — empty image now shows a clean placeholder (spinner while generating, red "!" + Remove button when failed) instead of a broken icon. New i18n keys gen_failed/remove (Hinglish/English/Hindi).
- Verified: generation now returns done with valid ~659KB image after the fallback logic. NOTE: REDEPLOY required for production.

## Backlog / Next
- P1: Headless-testable path for camera flows (file-upload fallback) and frontend E2E verification of session→trial→preview→display in a real browser with camera.
- P2: Hide display_secret from non-super admins; wrap raw Dict request bodies in Pydantic; resize fabric_thumb to true thumbnail to shrink docs.
- P2: Per-field "required" enforcement for configurable session fields; capture IP/user-agent in logs.

## Notes
- Gemini model: gemini-3-pro-image (best quality, ~10-25s per generation). Key in backend/.env (user-provided).
- NOT auto-verified: in-browser camera capture UI and full try-on UI flow (requires device camera; backend APIs fully verified).
