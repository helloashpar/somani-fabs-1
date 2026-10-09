"""Who may do what: the one list of permissions for staff accounts.

Roles
- super: a super admin. Has every permission, now and in future, and is the
  only role that can manage the team (create, edit, turn off, delete admins).
  The account with mobile SUPER_ADMIN_MOBILE in .env is the Owner: it is always
  a super admin, always active, and cannot be deleted or changed in the app.
- admin: staff. Can do exactly what their permissions allow.

Adding a feature (keep this list in sync with the frontend labels):
1. Add a Permission below with a key "<area>_<action>" (no dots: MongoDB treats a
   dot in a field name as a nested path).
2. `staff`: given to NEW staff accounts. Market-standard rule of thumb: everyday
   counter work = True; money/revenue, exporting data, deleting or editing
   records after the fact, and shop setup = False.
3. `existing`: given ONCE to staff accounts that already exist when the
   permission first appears. Use True when the feature is part of work they
   already do (so nobody loses access), False when it opens something new or
   sensitive. Applied at startup by `migrate()`; the super admin can change it.
4. Check it on the server with `require(user, "<key>")` and in the app with
   `can(user, "<key>")` (frontend/src/admin/perms.js), and add the label in
   frontend/src/i18n.js as perm_<key> in all three languages.
"""
from dataclasses import dataclass
from typing import Dict, List

from fastapi import HTTPException


@dataclass(frozen=True)
class Permission:
    key: str
    group: str      # sessions | customers | history | reports | setup
    staff: bool     # default for new staff
    existing: bool  # granted once to staff that already exist when this is added


PERMISSIONS: List[Permission] = [
    # Counter work
    Permission("sessions_manage", "sessions", True, True),      # start / end sessions, change photo, consent
    Permission("trials_create", "sessions", True, True),        # make try-ons, star them
    Permission("trials_delete", "sessions", True, True),        # remove a try-on
    Permission("whatsapp_send", "sessions", True, True),        # send looks, invites, receipts
    # Customers
    Permission("customers_view", "customers", True, True),      # customer database and profiles
    Permission("customers_edit", "customers", True, True),      # date of birth
    Permission("customers_export", "customers", False, False),  # Excel export of all customers
    # Past sessions
    Permission("history_view", "history", True, True),
    Permission("history_edit", "history", False, False),        # change purchase / amounts afterwards
    Permission("history_delete", "history", False, False),
    # Reports
    Permission("stats_view", "reports", False, False),          # statistics and revenue
    Permission("logs_view", "reports", False, False),           # activity log
    # Shop setup
    Permission("catalog_manage", "setup", False, False),        # fabrics, try-on categories, styles
    Permission("settings_manage", "setup", False, False),       # display screen, watermark, session fields
    Permission("marketing_manage", "setup", False, False),      # WhatsApp and marketing setup
]

KEYS = [p.key for p in PERMISSIONS]
_BY_KEY = {p.key: p for p in PERMISSIONS}

_MESSAGES = {
    "sessions_manage": "start or end sessions", "trials_create": "create try-ons",
    "trials_delete": "remove try-ons", "whatsapp_send": "send WhatsApp messages",
    "customers_view": "see customers", "customers_edit": "edit customer details",
    "customers_export": "export customers", "history_view": "see session history",
    "history_edit": "edit past sessions", "history_delete": "delete sessions",
    "stats_view": "see statistics", "logs_view": "see the activity log",
    "catalog_manage": "change the catalog", "settings_manage": "change these settings",
    "marketing_manage": "change marketing settings",
}


def is_super(user) -> bool:
    return (user or {}).get("role") == "super"


def staff_defaults() -> Dict[str, bool]:
    return {p.key: p.staff for p in PERMISSIONS}


def clean(perms) -> Dict[str, bool]:
    """Known keys only, as booleans; anything missing gets the staff default."""
    perms = perms if isinstance(perms, dict) else {}
    return {k: bool(perms.get(k, _BY_KEY[k].staff)) for k in KEYS}


def effective(user) -> Dict[str, bool]:
    if is_super(user):
        return {k: True for k in KEYS}
    stored = (user or {}).get("permissions") or {}
    return {k: bool(stored.get(k, False)) for k in KEYS}


def can(user, key: str) -> bool:
    return effective(user).get(key, False)


def require(user, key: str):
    if not can(user, key):
        raise HTTPException(403, f"You don't have permission to {_MESSAGES.get(key, 'do this')}. Ask a super admin.")


def require_super(user):
    if not is_super(user):
        raise HTTPException(403, "Only a super admin can do this")


def catalog() -> List[Dict]:
    """For the app's permission matrix."""
    return [{"key": p.key, "group": p.group, "staff": p.staff} for p in PERMISSIONS]


async def migrate(db):
    """Give staff accounts every permission they have no answer for yet, using
    each permission's `existing` value. Runs at startup; a no-op once done."""
    async for a in db.admins.find({"role": {"$ne": "super"}}, {"_id": 0, "id": 1, "permissions": 1}):
        stored = a.get("permissions") or {}
        missing = {k: _BY_KEY[k].existing for k in KEYS if k not in stored}
        if missing:
            await db.admins.update_one({"id": a["id"]}, {"$set": {f"permissions.{k}": v for k, v in missing.items()}})
