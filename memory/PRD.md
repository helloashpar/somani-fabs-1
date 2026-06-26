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

## Backlog / Next
- P1: Headless-testable path for camera flows (file-upload fallback) and frontend E2E verification of session→trial→preview→display in a real browser with camera.
- P2: Hide display_secret from non-super admins; wrap raw Dict request bodies in Pydantic; resize fabric_thumb to true thumbnail to shrink docs.
- P2: Per-field "required" enforcement for configurable session fields; capture IP/user-agent in logs.

## Notes
- Gemini model: gemini-3-pro-image (best quality, ~10-25s per generation). Key in backend/.env (user-provided).
- NOT auto-verified: in-browser camera capture UI and full try-on UI flow (requires device camera; backend APIs fully verified).
