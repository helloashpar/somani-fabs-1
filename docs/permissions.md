# Admin roles and permissions

How access works in the Countr OS admin app, and what to do when you add a
feature. The code is the source of truth: `backend/permissions.py` (server) and
`frontend/src/admin/perms.js` (app).

## Roles

| Role | Who | Can do |
|---|---|---|
| **Owner** | The account with the mobile number `SUPER_ADMIN_MOBILE` in the server `.env` | Everything. Always a super admin, always active. Cannot be deleted, turned off or downgraded. Its password is set in `.env` (reset on every server start), not in the app. |
| **Super admin** | Created by a super admin | Everything, including every future feature, and **managing the team**: add, edit, turn off, delete admins; make other super admins. |
| **Staff** | Created by a super admin | Exactly the permissions ticked in their access matrix. |

Safety rules (enforced on the server): only super admins see or change the
team; nobody can change their own role, turn themselves off or delete
themselves; the Owner is untouchable. Turning an account off signs it out at
once. All changes are written to the activity log.

## The access matrix (staff)

Recommended values follow common practice for retail POS / CRM tools:
everyday counter work is on; money, data export, changing records after the
fact and shop setup are off.

| Group | Permission (key) | Recommended for new staff |
|---|---|---|
| Counter work | Start and end sessions (`sessions_manage`) | On |
| | Create try-ons (`trials_create`) | On |
| | Remove try-ons (`trials_delete`) | On |
| | Send on WhatsApp (`whatsapp_send`) | On |
| Customers | View customer database (`customers_view`) | On |
| | Edit customer birthday (`customers_edit`) | On |
| | Export customers to Excel (`customers_export`) | Off |
| Past sessions | View session history (`history_view`) | On |
| | Edit amounts of past sessions (`history_edit`) | Off |
| | Delete sessions (`history_delete`) | Off |
| Reports | View statistics and revenue (`stats_view`) | Off |
| | View activity log (`logs_view`) | Off |
| Shop setup | Manage catalog (`catalog_manage`) | Off |
| | Settings: display, watermark, session fields (`settings_manage`) | Off |
| | Marketing and WhatsApp setup (`marketing_manage`) | Off |

Not in the matrix on purpose: managing the team (super admins only). Viewing
the fabric catalog and the display screen link is open to everyone signed in,
because try-ons need them.

The WhatsApp "Allow staff to send try-on looks" switch (Marketing > WhatsApp >
Automations) is a shop-wide off switch on top of `whatsapp_send`.

## Adding a feature: the checklist

1. **Decide if it needs a permission.** Anything that changes data, shows
   money, exports data or changes setup does. Plain viewing that every counter
   worker needs may not.
2. **Add one line** to `PERMISSIONS` in `backend/permissions.py`:
   `Permission("<area>_<action>", "<group>", staff, existing)`.
   - Key: lowercase with underscores, never dots (MongoDB treats dots as paths).
   - `staff`: default for **new** staff (see the rule of thumb above).
   - `existing`: given **once** to staff who already exist. Use **True** when the
     feature is part of work they already do (so nobody loses access they
     effectively had); **False** when it opens something new or sensitive.
     Super admins always get it.
3. **Check it on the server** in every endpoint that needs it:
   `permissions.require(user, "<key>")`.
4. **Hide it in the app** with `can(user, "<key>")` from `admin/perms.js`
   (buttons, tabs, tiles). For a new Settings tab, set `perm` in
   `SETTINGS_TABS` (sidebar and phone tabs follow automatically).
5. **Name it** in `frontend/src/i18n.js` as `perm_<key>` in all three
   languages (a new group also needs `pg_<group>`). `tests/test_permissions.py`
   fails if a label is missing.
6. **Restart the server.** `permissions.migrate()` runs at startup and fills in
   the new permission for existing staff using `existing`. Super admins can
   change it per person at any time in Settings > Admins.
