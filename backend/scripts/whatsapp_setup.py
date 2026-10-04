"""WhatsApp setup and health check. Safe to run again at any time.

Run from the backend folder (it reads backend/.env):

    python scripts/whatsapp_setup.py                       # check + submit templates
    python scripts/whatsapp_setup.py --pin 123456          # also register the number
    python scripts/whatsapp_setup.py --test-to 9876543210  # also send a test message
    python scripts/whatsapp_setup.py --dry-run             # show template payloads only

On the server:  docker compose exec backend python scripts/whatsapp_setup.py

See docs/whatsapp-setup.md for the steps before this one.
"""
import argparse
import asyncio
import io
import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")
# Hindi template text must print on a Windows console too.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import whatsapp_service as wa  # noqa: E402
import whatsapp_templates as tpl  # noqa: E402


def say(msg=""):
    print(msg, flush=True)


def stop(msg, doc_step=""):
    say()
    say("ACTION NEEDED: " + msg)
    if doc_step:
        say(f"See docs/whatsapp-setup.md, step {doc_step}.")
    sys.exit(1)


def example_image() -> bytes:
    """A plain sample picture for image-header templates (Meta needs an example)."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (800, 1000), (226, 220, 210))
    d = ImageDraw.Draw(img)
    d.rectangle([250, 200, 550, 850], fill=(30, 58, 138))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def main(args):
    langs = [l.strip() for l in args.langs.split(",") if l.strip()]
    bad = [l for l in langs if l not in tpl.LANGUAGES]
    if bad:
        stop(f"Unknown language(s): {', '.join(bad)}. Use: {', '.join(tpl.LANGUAGES)}")
    base = wa.public_base_url()

    if args.dry_run:
        for name in tpl.TEMPLATES:
            for lang in langs:
                say(json.dumps(tpl.submission(name, lang, base or "https://your-domain.com", "<handle>"),
                               ensure_ascii=False, indent=2))
        return

    say("== 1. Configuration ==")
    missing = wa.missing_env()
    if missing:
        stop("These are empty in backend/.env: " + ", ".join(missing), "8-9")
    if not base:
        stop("PUBLIC_BASE_URL is empty in backend/.env (needed for review/map buttons).", "A2")
    say(f"Graph API version: {wa.graph_version()}")
    say(f"WHATSAPP_ENABLED: {os.environ.get('WHATSAPP_ENABLED', 'false')}")

    say("\n== 2. Phone number and account ==")
    try:
        phone = await wa.get_phone_number()
    except wa.WhatsAppError as e:
        if e.code == 190:
            stop("The token is wrong or expired. Make a new System User token.", "8")
        stop(f"Could not read the phone number ({e}). Check WHATSAPP_PHONE_NUMBER_ID.", "9")
    say(f"Number:          {phone.get('display_phone_number')}")
    say(f"Display name:    {phone.get('verified_name')}  (review: {phone.get('name_status', '?')})")
    say(f"Quality rating:  {phone.get('quality_rating', '?')}")
    say(f"Messaging tier:  {phone.get('messaging_limit_tier', '?')}")
    say(f"Number status:   {phone.get('status', '?')} / verification {phone.get('code_verification_status', '?')}")
    try:
        waba = await wa.get_waba()
        say(f"WhatsApp account: {waba.get('name')}  review: {waba.get('account_review_status', '?')}"
            f"  business verification: {waba.get('business_verification_status', '?')}")
    except wa.WhatsAppError as e:
        stop(f"Could not read the WhatsApp Business Account ({e}). Check WHATSAPP_WABA_ID.", "9")

    say("\n== 3. Webhook subscription ==")
    apps = await wa.subscribed_apps()
    if apps:
        say("App is already subscribed to the account.")
    else:
        await wa.subscribe_app()
        say("Subscribed the app to the account.")

    say("\n== 4. Number registration ==")
    if args.pin:
        try:
            await wa.register_number(args.pin)
            say("Number registered.")
        except wa.WhatsAppError as e:
            say(f"Register said: {e} (fine if the number is already registered)")
    else:
        say("Skipped (pass --pin <6 digits> to register a production number).")

    say("\n== 5. Templates ==")
    existing = {(t["name"], t["language"]): t for t in await wa.list_templates()}
    handle = None
    for name, spec in tpl.TEMPLATES.items():
        for lang in langs:
            key = (tpl.meta_name(name, lang), tpl.meta_language(lang))
            if key in existing:
                continue
            if spec["header"] == "image" and handle is None:
                if not os.environ.get("WHATSAPP_APP_ID"):
                    say(f"  skip {key[0]} ({key[1]}): set WHATSAPP_APP_ID to submit image templates")
                    continue
                handle = await wa.upload_example_image(example_image())
            try:
                r = await wa.create_template(tpl.submission(name, lang, base, handle))
                say(f"  submitted {key[0]} ({key[1]}): {r.get('status', '?')}")
            except wa.WhatsAppError as e:
                say(f"  FAILED {key[0]} ({key[1]}): {e} {e.details}")

    say("\n== 6. Template status ==")
    existing = {(t["name"], t["language"]): t for t in await wa.list_templates()}
    say(f"{'template':34} {'lang':5} {'status':10} {'asked':10} {'Meta set':10} note")
    for name, spec in tpl.TEMPLATES.items():
        for lang in langs:
            key = (tpl.meta_name(name, lang), tpl.meta_language(lang))
            t = existing.get(key, {})
            note = t.get("rejected_reason") if t.get("rejected_reason") not in (None, "NONE") else ""
            if t.get("category") and t["category"] != spec["category"]:
                note = (note + " ").lstrip() + "<- Meta changed the category (affects price)"
            say(f"{key[0]:34} {key[1]:5} {t.get('status', 'MISSING'):10} {spec['category']:10} "
                f"{t.get('category', ''):10} {note}")

    if args.test_to:
        say("\n== 7. Test message ==")
        digits = "".join(ch for ch in args.test_to if ch.isdigit())
        if len(digits) == 10:
            digits = "91" + digits
        try:
            mid = await wa.send_template(digits, "hello_world", "en_US", [])
            say(f"Sent hello_world to +{digits} (message id {mid}). Check that phone.")
        except wa.WhatsAppError as e:
            say(f"Test failed: {wa.friendly_error(e)} ({e})")
            if e.code == 131030:
                say("On the test number, add this phone as a recipient first (setup guide step 4).")

    say("\nDone. Templates usually get approved within minutes to a day.")
    say("Run this script again to see the latest status.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pin", help="6-digit two-step verification PIN to register the number")
    ap.add_argument("--test-to", help="mobile number to send Meta's hello_world test template to")
    ap.add_argument("--langs", default=",".join(tpl.LANGUAGES),
                    help="languages to submit (default: english,hindi,hinglish)")
    ap.add_argument("--dry-run", action="store_true", help="print template payloads, call nothing")
    asyncio.run(main(ap.parse_args()))
