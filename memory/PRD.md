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

## Smoothness + Speed + Cost (2026-06)
- SMOOTHNESS (fake endless loading): the frontend was polling GET /trials/{tid} which returns the FULL ~650KB image every 2.5s — on staging this large response intermittently failed, so the poll never saw status=done → endless spinner even though the image was generated. FIX: new lightweight GET /trials/{tid}/status (~28 bytes, status+error only). NewTrial.js polls the status endpoint; on done it fetches the full trial ONCE then onDone(). Reliable detection, no fake loading.
- SPEED + COST: switched PRIMARY model to gemini-3.1-flash-image (Nano Banana 2 — "second best", much faster & cheaper) with gemini-2.5-flash-image fallback. Pro model (gemini-3-pro-image) no longer used by default. Generation time dropped from ~24s+ to ~7s in testing. Retry backoff shortened to [2,4].
- Config: backend/.env GEMINI_IMAGE_MODEL=gemini-3.1-flash-image, GEMINI_IMAGE_FALLBACK_MODEL=gemini-2.5-flash-image.
- Verified: generate→7s→done with valid 634KB image, status poll = 28 bytes. NOTE: REDEPLOY required for production.

## Endless-loading final fix (2026-06)
- Real cause of the persistent endless spinner: after the tiny status poll detected done, NewTrial then fetched the FULL ~650KB trial INSIDE the same try/catch. On mobile that large fetch was slow/flaky → swallowed by catch → poll looped forever even though the image existed.
- FIX: NewTrial poll now calls onDone(tid) IMMEDIATELY when status=done (no large fetch in the loop). SessionView.onDone(tid) closes the popup, reloads the session (single 650KB fetch it does anyway) and opens the preview for that tid. Popup closes the instant generation completes; preview opens right after.
- Frontend compiles clean; backend status endpoint verified. Camera-based UI flow needs user verification in preview (device camera can't be automated).

## THE actual endless-loading root cause — StrictMode ref bug (2026-06)
- Root cause: NewTrial used `const cancelled = useRef(false)` with `useEffect(() => () => { cancelled.current = true }, [])`. React 18 StrictMode (enabled in index.js) runs mount→setup→cleanup→setup in dev/preview; the cleanup set cancelled.current=true and the re-run setup never reset it, so cancelled.current stayed TRUE. The poll's first line `if (cancelled.current) return` then killed all polling immediately. Image still generated in the background task (so it appeared in the list) but the popup never detected done → endless spinner. This affected preview (StrictMode dev); production build may differ but the fix is correct regardless.
- FIX: reset cancelled.current=false in the effect setup (`useEffect(() => { cancelled.current=false; return () => { cancelled.current=true }; }, [])`) AND at the start of generate(). Polling now runs and detects done reliably.
- Compiles clean. Needs user verification in preview (camera flow can't be automated).

## Deployment failure fix (build + become-ready) (2026-07)
- Production redeploy was failing two ways: (1) Cloud Build failed, (2) deployment failed to become ready (readiness timeout).
- CAUSE 1 (build): Cloud Build runs with CI=true which treats CRA/craco ESLint warnings as ERRORS. Two react-hooks/exhaustive-deps warnings (SessionView.js useEffect load, Settings.js useEffect load) failed the build. FIX: added `// eslint-disable-next-line react-hooks/exhaustive-deps` above both. Verified `CI=true yarn build` now exits 0 clean.
- CAUSE 2 (become-ready): the /health endpoint (added earlier per user request) does `await client.admin.command("ping")`; with serverSelectionTimeoutMS=30000 it could hang up to 30s per readiness probe if Mongo slow at startup → K8s readiness timeout. FIX: wrapped ping in asyncio.wait_for(..., timeout=2.0) so /health responds fast (200 if reachable, 503 if not) and the probe retries cleanly. Verified /health returns 200 in ~4ms.
- Speed note: production (yesterday's build) was slow today likely due to upstream Gemini high-demand or old model config; a successful redeploy of current code (flash primary) makes prod match preview. REDEPLOY required.

## Backlog / Next
- P1: Headless-testable path for camera flows (file-upload fallback) and frontend E2E verification of session→trial→preview→display in a real browser with camera.
- P2: Hide display_secret from non-super admins; wrap raw Dict request bodies in Pydantic; resize fabric_thumb to true thumbnail to shrink docs.
- P2: Per-field "required" enforcement for configurable session fields; capture IP/user-agent in logs.

## Notes
- Gemini model: gemini-3-pro-image (best quality, ~10-25s per generation). Key in backend/.env (user-provided).
- NOT auto-verified: in-browser camera capture UI and full try-on UI flow (requires device camera; backend APIs fully verified).

## Self-hosting migration to DigitalOcean droplet (2026-06)
- User wants full independence from Emergent: own GitHub repo -> auto-deploy to own droplet. Choices: MongoDB Atlas, existing droplet, test on plain IP first then move somanifabs.com, GitHub Actions auto-deploy on push to main, Let's Encrypt HTTPS.
- Added (no app logic changed): backend/Dockerfile + backend/requirements.prod.txt (Emergent-only pkgs emergentintegrations/litellm and dev/test tools excluded; adds google-genai, pillow, openpyxl which were missing from requirements.txt), backend/.dockerignore, frontend/Dockerfile (node build -> nginx static, strips @emergentbase/visual-edits, CI=false, ARG REACT_APP_BACKEND_URL=""), frontend/nginx.conf (SPA fallback), frontend/.dockerignore (excludes .env so preview URL never leaks into prod build), docker-compose.yml (backend 127.0.0.1:8001, frontend 127.0.0.1:3000, env_file ./.env, healthcheck), deploy/setup-droplet.sh (docker+nginx+certbot+ufw+2GB swap), deploy/nginx-site.conf (host nginx: /api + /health -> 8001, / -> 3000, client_max_body_size 60M, 300s proxy timeouts), deploy/deploy.sh (git reset --hard origin/main + build + up -d + health wait), deploy/env.example, .github/workflows/deploy.yml (appleboy/ssh-action, secrets DROPLET_HOST/DROPLET_USER/DROPLET_SSH_KEY).
- MIGRATION-GUIDE.md at repo root: 9 beginner steps (GitHub -> Atlas -> droplet setup -> .env -> first launch on IP -> GitHub Actions -> DNS + certbot HTTPS -> daily push workflow -> commands/troubleshooting/backups).
- Verified in preview: `REACT_APP_BACKEND_URL="" craco build` exits 0 and compiles API base to "/api" (same-origin, works on IP and domain). Docker not available in preview pod, so image builds are unverified until the user runs them on the droplet.
- User must supply their OWN Gemini API key (aistudio.google.com/apikey) on the droplet; the Emergent universal key won't work off-platform.
- Old prod data lives in Emergent's DB; Atlas starts empty (admin + categories auto-seed).
