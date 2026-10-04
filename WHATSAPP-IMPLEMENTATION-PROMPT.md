# Task: Add WhatsApp messaging ("Countr OS" bot) to the Somani Fabs try-on app

You are working in this repo: a FastAPI + MongoDB backend (`backend/server.py`) and a React admin app (`frontend/src/admin/*`) for an in-store AI virtual try-on system. Staff create a **session** for a customer (identified by mobile number), generate **try-on images** (trials, watermarked, auto-deleted after 7 days by a TTL index on `trials.expire_at`), and close the session as purchased / not purchased with `total_value`, `discount`, `final_paid` (`POST /sessions/{sid}/end`). There are two roles: `super` (owner) and `admin` (staff). Read `server.py`, `admin/SessionView.js`, `admin/Canvas.js`, `admin/NewTrial.js`, `admin/Settings.js`, `i18n.js` and `deploy/` before you start.

Your job has two parts:
- **Part A:** get the WhatsApp Business Platform set up. Automate whatever you can and guide the owner through the steps that only they can do.
- **Part B:** build the features below in phases.

---

## 0. Ground rules

- **Use the Meta WhatsApp Cloud API directly** (Graph API, no BSP/reseller). Keep all Graph calls in one module (`backend/whatsapp_service.py`) so a provider swap stays possible.
- **The bot's WhatsApp display name is "Countr OS".** The software will later be sold as SaaS to other stores. So **nothing shop-specific may be hard-coded** in templates or code: shop name, address, phone, maps link, review link and city must all be variables that come from a shop profile. Add a `shop_id` field (default `"default"`) to every new collection now, so going multi-tenant later is a migration, not a rewrite. Do **not** refactor the existing app to multi-tenant now.
- **Message templates are fixed in code.** Nobody can edit template text in the UI. The UI only shows a read-only preview with variables filled in. The single source of truth is `backend/whatsapp_templates.py`.
- **All WhatsApp configuration is super-admin only.** Enforce it on the backend (`user["role"] == "super"`, same pattern as the existing endpoints), not just by hiding UI. The one exception is the staff-facing "Send to WhatsApp" button (section 4.3).
- **Never commit secrets.** Credentials go in `.env` / `deploy/env.example` (placeholders only).
- **Never send real messages from automated tests.** Mock the Graph API. During development, use Meta's free test phone number and the owner's own verified test recipients only.
- **Don't handle the owner's Meta / Facebook password.** You never log into their accounts. They do the account steps and paste tokens into `.env` themselves.
- **Keep it simple.** Match the existing code style. Write short, friendly error messages for shop staff, like `friendly_generation_error` does.
- **Use IST.** All schedules use IST via the existing `IST` helpers.
- **Expect two backend processes.** The backend runs with `uvicorn --workers 2` (`backend/Dockerfile`). Any scheduled/background job must not double-send (see section 6).

---

## Part A: WhatsApp Business Platform setup

### A1. Write `docs/whatsapp-setup.md` for the owner

Write it as a plain-language, numbered checklist, with an exact URL for each step and a note on what the owner pastes back into `.env`. Cover:

1. Create or confirm a **Meta Business portfolio** (business.facebook.com).
2. Start **business verification** (GST certificate / Udyam / utility bill). Note that it can take days, and that the test number works without it.
3. Create a **Meta developer app** (developers.facebook.com → Create App → type "Business") and add the **WhatsApp** product.
4. Use the **test phone number** first: add up to 5 recipient numbers, including the owner's, for development.
5. Choose the production phone number:
   - **Option 1:** a fresh number that is not on WhatsApp.
   - **Option 2:** "coexistence", which keeps the existing WhatsApp Business app number.

   Explain the trade-off and recommend a dedicated number.
6. Set the **display name to "Countr OS"** and explain the display-name review. Meta checks that the name relates to the business. If the Meta business portfolio is registered as Somani Fabs (not Countr OS), the name may be rejected. Tell the owner what to do in that case.
7. Add a **payment method** in WhatsApp Manager (templates are billed per message).
8. Create a **System User** with admin access to the app + WABA. Generate a **permanent token** with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
9. Copy the **WABA ID**, **Phone Number ID** and **App Secret**, and choose a **Verify Token**.
10. Configure the **webhook**:
    - Callback URL: `https://<their-domain>/api/whatsapp/webhook`
    - Subscribe to the `messages` field.
    - Note the existing nginx/Cloudflare setup and confirm `/api/*` reaches the backend.
11. Run the setup script (A3) and read its output.

### A2. Environment variables

Add these to `deploy/env.example` and load them in `server.py`:

```
WHATSAPP_ENABLED=false
WHATSAPP_GRAPH_VERSION=v23.0        # use the current stable version; check Meta docs
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
PUBLIC_BASE_URL=https://<domain>    # used for /r/<slug> redirect links
```

When `WHATSAPP_ENABLED` is false or the variables are missing:
- Everything WhatsApp-related is a no-op.
- The Marketing tab shows a "Not connected — see setup guide" state.
- The app must keep working exactly as today.

### A3. Setup / health script: `backend/scripts/whatsapp_setup.py`

It must be idempotent and safe to re-run. It should:
1. Validate the token and IDs (GET phone number, WABA).
2. Print the display name, its verification status, the quality rating and the messaging limit tier.
3. Subscribe the app to the WABA (`POST /{waba_id}/subscribed_apps`).
4. Register the number if needed (`POST /{phone_number_id}/register`; the owner supplies the 2-step PIN as a CLI arg).
5. **Submit every template from `whatsapp_templates.py`** in every enabled language (`POST /{waba_id}/message_templates`, named parameters), skipping ones that already exist.
6. Print each template's status (APPROVED / PENDING / REJECTED + reason) and its **category as Meta assigned it**. Meta may re-categorise utility templates as marketing, which changes the price, so make that visible.
7. Optionally send a test template to a number given on the command line.

Expose the same status checks in the Marketing tab (section 5, "Connection").

**When you reach a step only the owner can do, stop and tell them exactly what to do** (with the doc section), then continue once they confirm.

---

## Part B: Features

### 1. The core idea: the 24-hour customer service window

- A **template** message is business-initiated and **costs money**: utility is cheap, marketing costs more.
- When the **customer messages us** (including tapping a quick-reply button), a **24-hour customer service window** opens. Inside it:
  - free-form messages (text, images with captions) are **free**;
  - utility templates are also free.
- Marketing templates are charged even inside the window.

So the goal at session start is to **get the customer to message us**. Then every try-on image sent during the visit is free.

Track this per phone in a `wa_contacts` collection: `phone` (E.164, default country code +91), `customer_id`, `opted_in`, `opted_in_at`, `opted_in_by`, `opted_out_at`, `last_inbound_at`, `shop_id`. The window is open if `now - last_inbound_at < 24h`.

### 2. Consent (required by Meta)

- Add a checkbox to the New Trial / new session form: **"Customer agrees to receive WhatsApp messages"**.
  - Its default state is a super-admin setting.
  - Record who ticked it and when.
  - Without consent, send **nothing** to that customer.
- Inbound `STOP` / `UNSUBSCRIBE` (and Hindi equivalents) → set `opted_out_at`, send one confirmation, and never message again unless they send `START`.
- Show opted-out customers in the Marketing tab.

### 3. Optional customer fields

- Add optional **Date of birth** and **Anniversary** to the session creation form (day + month required, year optional).
- Store them on the **customer** (not in `extra`).
- Prefill them for returning customers.

### 4. Session flow (Phase 1)

#### 4.1 Session starts → welcome template

On `create_session` (when WhatsApp is enabled, the customer consented and the "Welcome message" automation is on), send the `session_welcome` template:
- Utility category.
- Has a **quick-reply button** ("Send my looks" / localized).
- When the customer taps it, a webhook arrives → the window opens.
- Reply with a short free-form acknowledgment: "Great! Your looks will appear here."

Send it in the background so session creation never waits on Meta.

**Also build the free entry point:** on the customer Display screen (`pages/Display.js`) and in SessionView, show a **QR code** for `https://wa.me/<number>?text=<prefilled text with a short session code>`. If the customer scans it and sends the message, the window opens without paying for a template. Match the session by the code or by phone. A super-admin setting controls whether the welcome template is sent always, or only when the QR wasn't used within N minutes.

#### 4.2 Webhook: `GET/POST /api/whatsapp/webhook`

- **GET:** verify-token handshake.
- **POST:**
  - Verify `X-Hub-Signature-256` with the app secret and reject if it doesn't match.
  - Return 200 fast and process in the background.
  - De-duplicate by message id.
- **Inbound messages:**
  - update `last_inbound_at`;
  - handle button replies, STOP/START, and the QR session code;
  - store them in a `wa_messages` log.
- **Status callbacks** (sent/delivered/read/failed + error codes): update the outbound log rows.
- Any other inbound text gets one polite auto-reply per 24h, such as "Thanks! For help please call {{shop_phone}}". Do not build a chat inbox.

#### 4.3 Send try-on looks (the main feature)

- On each finished trial in SessionView / Canvas, add a **"Send to WhatsApp"** button.
  - It is visible only when WhatsApp is enabled and the customer consented.
  - A super-admin setting, **"Allow staff to send try-on looks"** (default ON), controls whether normal admins see it. Super admin always does.
- **Clicking it:**
  1. Takes the **watermarked** `generated_image` (the watermark must stay).
  2. **Uploads the bytes directly** to `POST /{phone_number_id}/media`. Never use a public URL; our images are base64 in Mongo and must not be exposed publicly.
  3. Sends an image message by media id, with a caption like: `Look #3 — Kurta + Pajama\n{{fabric/garment description}}\n— {{shop_name}}`.
     - `#N` is a **sequential look number per session**, assigned the first time a look is sent.
     - Use the trial's `description` / garment types for the text.
- **If the window is open:** send immediately (free).
- **If the window is not open** (customer hasn't replied yet): **queue the look** and show "Waiting for customer to tap the WhatsApp message". Offer "Resend invite" (template) and the QR. As soon as an inbound message arrives, **auto-send all queued looks in order**. Do not fall back to a paid template for every image.
- Record `wa_sent_at`, `wa_message_id`, `look_no` and delivery status on the trial. Show a small tick / double-tick / failed icon on the trial card.
- Add a **"Send all"** option to send every unsent finished look.
- Add a **star ("favourite")** toggle on trials. Staff star the customer's best looks; the follow-up in section 7.2 uses them.
- Once delivered, the image lives in the customer's chat. It is fine that our copy is deleted after 7 days by the existing TTL.

#### 4.4 Session ends → receipt or follow-up

- **Purchased** → send the `purchase_receipt` template (utility):
  - customer name, date, total, discount, final paid, shop name/address/phone;
  - **no try-on image**.
  - Send it on `end_session` only, never again automatically.
  - Editing via `PATCH /sessions/{sid}` does not re-send. Add a manual "Resend receipt" button instead.
- **Not purchased** → schedule the follow-up (section 7.2).
- **Deleting a session** cancels its pending scheduled messages.

### 5. Settings → new "Marketing" tab (super admin only)

Add a `marketing` tab to `admin/Settings.js`, shown only when `isSuper`. Back it with super-only endpoints under `/api/whatsapp/*`. It has these sections:

1. **Connection** (read-only):
   - enabled/not, phone number, display name and status, quality rating, messaging tier;
   - last webhook received;
   - each template's approval status and Meta-assigned category;
   - a link to the setup guide;
   - a "Send test message to…" box.
2. **Shop profile** (the variables used in every template):
   - shop name, short name, address, city, phone, Google Maps link, Google review link, slug.
   - Review and maps links are sent as `PUBLIC_BASE_URL/r/<slug>/review` and `/r/<slug>/map` redirect URLs. Template URL buttons need a fixed base URL, and this keeps it the same for every future shop.
   - Add those public redirect routes.
3. **Message language:** one shop-wide setting: English / Hindi / Hinglish.
   - Meta has no "Hinglish" language code. Submit the Hinglish versions under language `en` with a `_hinglish` name suffix.
4. **Automations:** each has an on/off toggle plus its own settings. See section 7 for each one:
   - welcome message + QR behaviour;
   - send looks (+ "allow staff" toggle);
   - consent checkbox default;
   - purchase receipt;
   - not-purchased follow-up;
   - Google review request;
   - "Share your look";
   - win-back;
   - birthday;
   - anniversary;
   - daily owner summary.
5. **Template preview:** read-only rendering of every template in the chosen language with sample/real variables. Not editable.
6. **Message log:**
   - outbound + inbound, filterable by type / status / date;
   - per-category counts this month (so the owner can see what's costing money; don't hard-code prices).
7. **Opt-outs:** list with the date.

Add every new UI string to `i18n.js` in all three languages.

### 6. Scheduler and idempotency

- Add a lightweight scheduler loop started from the app lifespan (e.g. every 60 s).
- **Because there are 2 workers:**
  - take a Mongo lease lock (`findOneAndUpdate` on a `jobs_lock` doc with an expiry) so only one process runs a tick;
  - **and** give every outbound automated message an **idempotency key** with a unique index, e.g. `review:{session_id}`, `birthday:{customer_id}:{yyyy}`, `summary:{yyyy-mm-dd}`, `winback:{customer_id}:{yyyy-mm}`. A duplicate insert means skip.
- Keep scheduled sends in a `wa_scheduled` collection (`due_at`, `kind`, `payload`, `status`).
- **Quiet hours:** marketing messages only go out between configurable hours (default 10:00–20:00 IST); anything due outside them waits until the next allowed time.
- **Before every send**, re-check consent, opt-out, `WHATSAPP_ENABLED` and that the automation is still on.

### 7. Automations (templates in section 8)

1. **Welcome:** see section 4.1.
2. **Not-purchased follow-up:**
   - Delay is configurable; default **3 hours after the session closes**.
   - Send the customer's **1–3 best looks**: starred looks first, otherwise the most recent sent looks. The trial must still exist (7-day TTL).
   - **If the 24h window is still open:** send them free-form (free) with a short text.
   - **Otherwise:** send the `followup_looks` template (marketing, image header). A template can carry only one image, so **combine up to 3 looks into one collage image** server-side with Pillow, watermark intact (see `backend/watermark.py`), and upload it as media.
   - At most once per session.
3. **Google review request:**
   - Purchased sessions only; delay configurable (default **2 days**, at a configurable time).
   - Template with a URL button to the `/r/<slug>/review` redirect.
   - Once per session, and at most once per customer per N days (default 90).
4. **"Share your look":**
   - Default **OFF**.
   - N days after a purchase (default 10), ask the customer to send us a photo wearing the outfit.
   - Inbound images are just stored in the message log, viewable in the Marketing tab.
5. **Win-back (re-engage inactive customers):**
   - Customers with consent whose last session was **≥ N days ago** (configurable, default 60).
   - Template: "new fabrics have arrived, come try them on".
   - Optional header image uploaded by the super admin in the Marketing tab.
   - Cooldown per customer (default 60 days), and a max sends per day (default 50) to protect the number's quality rating.
   - This is **not** a broadcast tool: no manual "send to everyone" button.
6. **Birthday / anniversary:**
   - Sent on the day at a configurable time (default 10:00 IST).
   - Only to customers with that date set and consent.
   - Once per year each.
7. **Daily owner summary:**
   - Sent at a configurable time (default 21:00 IST).
   - Goes to **a list of owner mobile numbers** managed in the Marketing tab.
   - Content (reuse the logic behind `/api/stats` for the day):
     - sessions, try-ons generated;
     - purchases, conversion %;
     - total sales (`final_paid`) and discounts;
     - top garment types tried.
   - Uses the utility template `daily_summary`.
   - Owner numbers count as consented (they are added by the super admin).
   - Never send the summary to customers.

**Not in scope (do not build):** discounts or offers, appointment booking, stitching/tailoring status, pickup reminders, a trial-expiry nudge, a manual broadcast tool, a two-way chat inbox.

### 8. Templates (`backend/whatsapp_templates.py`)

- Use **named parameters**.
- Keep enough fixed text in each template that Meta doesn't reject it for being "mostly variables".
- Footer on every template: `Powered by Countr OS`.
- Write each template in English, Hindi and Hinglish. Write proper copy; the drafts below show the intent.

| Name | Category (requested) | Header | Body (intent) | Buttons |
|---|---|---|---|---|
| `session_welcome` | Utility | — | Hi {{customer_name}}, welcome to {{shop_name}}! Your virtual try-on session has started. Tap below to get your try-on looks here on WhatsApp. | Quick reply: "Send my looks" |
| `purchase_receipt` | Utility | — | Thank you for shopping at {{shop_name}}, {{customer_name}}! Date {{date}} · Total ₹{{total}} · Discount ₹{{discount}} · Paid ₹{{paid}}. {{shop_address}}, {{shop_phone}} | — |
| `followup_looks` | Marketing | Image | Hi {{customer_name}}, here are the looks you tried at {{shop_name}} today. Come back anytime to see them in person. | URL: Directions (`/r/{{slug}}/map`) |
| `review_request` | Marketing (Meta decides) | — | Hi {{customer_name}}, thank you for choosing {{shop_name}}! How was your experience? A quick review helps us a lot. | URL: Leave a review (`/r/{{slug}}/review`) |
| `share_your_look` | Marketing | — | Hi {{customer_name}}, we'd love to see how your outfit from {{shop_name}} turned out! Reply with a photo. | — |
| `winback_new_arrivals` | Marketing | Image (optional) | Hi {{customer_name}}, it's been a while! New fabrics have arrived at {{shop_name}}. Visit us to try them on virtually. | URL: Directions |
| `birthday_wish` | Marketing | — | Happy birthday, {{customer_name}}! Warm wishes from all of us at {{shop_name}}. | — |
| `anniversary_wish` | Marketing | — | Happy anniversary, {{customer_name}}! Warm wishes from all of us at {{shop_name}}. | — |
| `daily_summary` | Utility | — | {{shop_name}} report for {{date}}: Sessions {{sessions}}, Try-ons {{tryons}}, Purchases {{purchases}} ({{conversion}}%), Sales ₹{{sales}}, Discounts ₹{{discounts}}. | — |

Free-form messages (sent only inside the window) use the same variables and live in the same file: the try-on caption, the welcome acknowledgment, STOP/START confirmations and the auto-reply.

### 9. Data model summary (all with `shop_id`)

- `wa_contacts`: consent, window, opt-out.
- `wa_messages`: every inbound/outbound message.
  - Fields: kind, template, category, status, error, Meta message id, `idempotency_key` (unique, sparse), related session/trial/customer, timestamps.
- `wa_scheduled`: future sends.
- `settings` doc: `whatsapp` sub-object (automations, language, owner numbers, quiet hours, staff permission) and `shop_profile`. Keep it in the existing `global` settings or a new `shop_settings` doc keyed by `shop_id`. Prefer the latter.
- `customers`: `dob`, `anniversary`.
- `trials`: `look_no`, `starred`, `wa_status`, `wa_sent_at`, `wa_message_id`, `wa_queued`.
- Indexes: phone, `last_inbound_at`, `due_at` + status, unique `idempotency_key`.

### 10. Testing

- **Backend unit tests (Graph API mocked):**
  - webhook signature check;
  - window calculation;
  - queue-then-flush of looks on inbound;
  - STOP/START handling;
  - consent gating;
  - idempotency (two workers → one send);
  - quiet hours;
  - collage builder;
  - template rendering for all languages;
  - super-only permission on every config endpoint.
- **Manual end-to-end with the Meta test number:** welcome → tap button → send 3 looks → close not-purchased → follow-up fires (shorten delays via settings) → STOP.
- Confirm the app works unchanged with `WHATSAPP_ENABLED=false`.

### 11. Phases (finish and demo each phase before starting the next)

1. **Phase 1, foundation + in-session:**
   - Part A docs + script + env;
   - service module, webhook, consent, `wa_contacts`/`wa_messages`;
   - welcome template + QR;
   - send looks with queue;
   - purchase receipt;
   - Marketing tab (Connection, Shop profile, Language, the Phase 1 automations, Template preview, Message log, Opt-outs).
2. **Phase 2, after the visit:**
   - scheduler + locking + idempotency;
   - not-purchased follow-up with collage;
   - review request;
   - daily owner summary.
3. **Phase 3, relationship:**
   - DOB/anniversary fields + wishes;
   - win-back;
   - "Share your look".

At the end of each phase, report:
- what was built;
- what the owner must do in Meta (templates pending approval, etc.);
- how to test it.

Also update `MIGRATION-GUIDE.md` / deploy docs with the new env vars.
