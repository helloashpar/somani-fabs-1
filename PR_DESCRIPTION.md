## Summary

A large update to the admin web app: WhatsApp messaging (Phase 1), customer history, a fabric catalog, a full redesign with a design system, and a role and permission system for admins.

### WhatsApp ("Countr OS" bot), Phase 1
- Meta WhatsApp Cloud API, with every Graph call in `backend/whatsapp_service.py` and all message text fixed in `backend/whatsapp_templates.py` (English, Hindi, Hinglish; nothing shop-specific is hard-coded).
- **Welcome:** a utility template goes out when a session is created with a photo and consent. A "Send my looks" tap opens the free 24-hour window.
- **Try-on looks:** sent free inside the window. Before the customer taps, they are queued and sent in order on their first message, so we never pay per image.
- **Purchase receipt** once on close.
- STOP/START handling, a signed webhook, delivery ticks, and a backup counter QR.
- Marketing hub (super admin): connection status, shop profile, automations, template preview, message log, opt-outs.
- Setup guide `docs/whatsapp-setup.md` and an idempotent setup script `backend/scripts/whatsapp_setup.py`.
- **Off by default:** with `WHATSAPP_ENABLED=false` the app behaves as before.

### Customers
- Optional date of birth on sessions. Customer history (visits, bought, revenue, last visit, birthday reminder) shows on Live Shop tiles and the session page.
- Full customer profile and an Excel export that includes every custom field.
- One open session per customer.
- Session fields can be required or optional.

### Catalog (fabric collection, try-on categories and styles)
Search-first New Try-On flow, with categories, groups and styles managed under Catalog.

### Redesign and design system
- New look: Geist type, Countr OS green theme, shared components in `frontend/src/admin/ui.js`.
- Navigation: desktop sidebar with a prominent **Live Shop**, try-on gallery, skeleton loading states, sheets for every form, and a consistent three-level layout (area, hub tile with back button and breadcrumb, underlined section tabs).
- Shop-wide app language in More Settings. The public home page is English only.
- Third-party platform branding, script and analytics removed from the site.
- Rules for future changes: `docs/design-system.md`.

### Roles and permissions
- **Roles:** Owner (from `.env`, untouchable), super admins (everything, including future features, plus team management) and staff.
- **Staff access matrix** with market-standard defaults. Staff can no longer edit or delete past sessions by default.
- Super admins can create and edit admins, reset passwords, and turn accounts off. A turned-off account is signed out immediately.
- Every check is enforced on the server.
- One registry (`backend/permissions.py`) handles future features: on startup, existing staff get each new permission's `existing` default. Process documented in `docs/permissions.md`.

## Reviewer notes
- **Existing staff lose some access:** on first start, the startup migration moves current staff accounts onto the recommended defaults. They lose history edit/delete, Excel export and statistics. A super admin can turn these back on per person in Settings > Admins.
- **New environment variables:** WhatsApp settings in `deploy/env.example` (documented in MIGRATION-GUIDE). `deploy/nginx-site.conf` gains a `/r/` block for review and map short links. Re-copy it on the droplet.
- **Default views:** Statistics now opens on "Today" and Session History on the last 7 days.
- **Phone test IDs:** the phone-only action buttons use new test IDs (`new-session-btn-mobile`, `new-trial-btn-mobile`).
- **Local-only files** (fine to drop if unwanted): `.claude/launch.json` (local preview config) and `WHATSAPP-IMPLEMENTATION-PROMPT.md`.

## Testing
- Backend unit tests, with the Graph API mocked and an in-memory database: `python -m pytest tests/test_permissions.py tests/test_whatsapp.py tests/test_customer_history.py tests/test_catalog.py -n 0`. 67 pass. The WhatsApp tests also pass against a real MongoDB (`WA_TEST_MONGO_URL`).
- Production frontend build compiles cleanly.
- Checked by hand in the browser on desktop and phone sizes:
  - Live Shop, sessions and try-ons.
  - Staff view with limited permissions.
  - Admin creation with the access matrix.
  - Required session fields.
  - Hub navigation and the language setting.
  - The WhatsApp flow with a simulated signed webhook (no real messages sent).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
