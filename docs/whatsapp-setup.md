# WhatsApp setup (Countr OS bot)

This guide connects the app to the **WhatsApp Business Platform (Cloud API)**,
directly with Meta. No reseller is needed. You do every step below in your own
Meta / Facebook account. The app never asks for your Facebook password. At the
end you paste a few values into the server's `.env` file.

Until you finish, leave `WHATSAPP_ENABLED=false`. The app works exactly as
before, and the Marketing tab shows "Not connected".

**Time needed:** about 1 hour of clicking. Business verification and display
name review can take a few days, but you can test with Meta's free test number
in the meantime.

---

## 1. Meta Business portfolio

1. Open <https://business.facebook.com/> and log in.
2. If you have no business portfolio yet, click **Create a business portfolio**.
   Use the shop's legal name exactly as it appears on your GST certificate.
3. Note the **Business portfolio ID**. It is shown in **Settings → Business info**.

## 2. Start business verification

1. Open <https://business.facebook.com/settings/security> (Security Center).
2. Click **Start verification** and upload one document that shows the business
   name and address: a **GST certificate**, **Udyam certificate**, or a recent
   **utility bill** in the business name.
3. Verification can take from a few hours to several days. **The test number
   (step 4) works without it.** You need it before you can send messages to
   real customers in volume and before the display name is approved.

## 3. Create the Meta developer app

1. Open <https://developers.facebook.com/apps> and click **Create app**.
2. Choose the use case **Connect with customers through WhatsApp**. On older
   screens, choose **Other**, then app type **Business**.
3. Name it, for example `Countr OS`, and pick your business portfolio from step 1.
4. When the app opens, add the **WhatsApp** product if it was not added already.
   Accept the terms and choose your business portfolio.

## 4. Try it with the free test number

1. In the app dashboard, open **WhatsApp → API Setup**.
2. Meta gives you a **test phone number**. It is free and needs no verification.
3. Under **To**, click **Manage phone number list** and add up to **5** mobile
   numbers, including your own. Each number gets a WhatsApp code to confirm.
   The test number can only message these numbers.
4. On this page, note the test number's **Phone number ID** and the
   **WhatsApp Business Account ID**. You can use these in `.env` while testing.

## 5. Choose the real (production) number

You have two options:

| | Option 1: a new number (recommended) | Option 2: "coexistence" (keep your current WhatsApp Business app number) |
|---|---|---|
| What it is | A SIM or landline that is **not** on WhatsApp now | Your existing WhatsApp Business app number also works with the API |
| Your phone app | Not used for this number; the bot runs it | You can keep using the WhatsApp Business app on that number |
| Chat history | Starts empty | Kept |
| Risks | None | Limits on some features. Every chat the bot sends also appears in your phone app. Setup goes through Meta's "Embedded Signup" flow, which is aimed at tech providers. |

**Recommendation:** use a **new, dedicated number** (a cheap prepaid SIM is
fine). It keeps the bot's automatic messages separate from your personal
customer chats and avoids the coexistence limits. The number must be able to
receive one SMS or call for verification.

To add it: open WhatsApp Manager at
<https://business.facebook.com/wa/manage/phone-numbers/>, click **Add phone
number**, and follow the SMS/call verification. During this you set a **6-digit
two-step verification PIN**. Keep it; the setup script needs it (step 11).

## 6. Display name "Countr OS"

When you add the number, you choose a **display name**. Customers see this name
at the top of the chat. Meta reviews every display name and **approves it only if
it clearly relates to the business that owns the portfolio** (same name, your
website, or your signage).

- If your portfolio is registered as **Somani Fabs** (not Countr OS), Meta will
  most likely **reject "Countr OS"**.
- What to do in that case:
  1. **Simplest:** use the shop name (for example "Somani Fabs") as the display
     name. Every message still ends with "Powered by Countr OS", so the Countr OS
     brand is visible. Customers also trust a chat named after the shop they
     just visited.
  2. **To really use "Countr OS":** create a separate business portfolio for
     Countr OS (verified with its own documents and a website that shows the
     Countr OS name). Run the WhatsApp number from that portfolio. This also
     fits the later plan of selling Countr OS to other shops.
- If a name is rejected, edit it in WhatsApp Manager → Phone numbers → (your
  number) → **Profile → Display name** and resubmit. Review usually takes 1–2 days.

## 7. Add a payment method

Template messages (welcome, receipt, and later follow-ups) are **billed per
message** by Meta. Replies inside the 24-hour window are free.

1. Open <https://business.facebook.com/billing_hub/payment_settings>.
2. Add a card for the WhatsApp Business Account. Indian cards with
   international payments turned on usually work.
3. Prices change from time to time. See Meta's current rates at
   <https://developers.facebook.com/docs/whatsapp/pricing>.

## 8. Permanent token (System User)

The token from the API Setup page expires in 24 hours. Make a permanent one:

1. Open <https://business.facebook.com/settings/system-users>.
2. Click **Add**, name it `countr-os-server`, and choose role **Admin**.
3. Click **Assign assets**:
   - **Apps** → your app → **Full control**.
   - **WhatsApp accounts** → your WhatsApp Business Account → **Full control**.
4. Click **Generate new token**, pick your app, set **Token expiration: Never**,
   and tick these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copy the token **now**; Meta shows it only once.
   → `.env`: `WHATSAPP_TOKEN=<token>`

## 9. Copy the IDs and choose a verify token

| `.env` line | Where to find it |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID=` | App dashboard → WhatsApp → API Setup → **Phone number ID** (pick the real number once it is added) |
| `WHATSAPP_WABA_ID=` | Same page → **WhatsApp Business Account ID** |
| `WHATSAPP_APP_SECRET=` | App dashboard → **App settings → Basic → App secret** (click Show) |
| `WHATSAPP_APP_ID=` | Same page → **App ID**. Only needed for templates with an image (Phase 2/3). |
| `WHATSAPP_VERIFY_TOKEN=` | **Make one up**: any long random word, e.g. `countr-7f3k29xq`. You type the same value in step 10. |
| `PUBLIC_BASE_URL=` | Your site address, e.g. `https://somanifabs.com` (no slash at the end) |

Then, on the server:

```bash
cd /opt/somanifabs
nano .env
```

Add the lines above. Keep `WHATSAPP_ENABLED=false` for now.

## 10. Webhook (so we hear when customers reply)

1. **Update nginx first.** This release adds the `/r/` short links. On the server:

   ```bash
   cp /opt/somanifabs/deploy/nginx-site.conf /etc/nginx/sites-available/somanifabs
   nginx -t && systemctl reload nginx
   ```

   (If you added HTTPS with certbot, re-run the `certbot --nginx ...` command from MIGRATION-GUIDE step 7 afterwards so
   it re-adds the HTTPS lines.)
2. Set `WHATSAPP_ENABLED=true` in `.env` and restart: `docker compose up -d`.
   The webhook only answers once the app secret and verify token are loaded.
3. In the app dashboard, open **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL:** `https://<your-domain>/api/whatsapp/webhook`
   - **Verify token:** the same word you put in `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and save**.
4. Under **Webhook fields**, click **Manage** and **Subscribe** to `messages`.
5. **nginx / Cloudflare check:** the existing nginx config already sends every
   `/api/*` request to the backend, so nothing else is needed there. If the site
   is behind Cloudflare, make sure **Bot Fight Mode** or WAF rules do not block
   `POST /api/whatsapp/webhook`. Meta's servers are not browsers.
   - Test it: open `https://<your-domain>/api/whatsapp/webhook` in a browser.
     You should see `Verification failed`. That means the request reached the app.
6. Webhooks only work over **HTTPS** with a valid certificate (certbot or
   Cloudflare both work).

## 11. Run the setup script

On the server:

```bash
cd /opt/somanifabs
docker compose exec backend python scripts/whatsapp_setup.py --pin 123456 --test-to 98XXXXXXXX
```

- `--pin`: the 6-digit two-step PIN from step 5. Only needed once, for the real number.
- `--test-to`: your own mobile (it must be in the test recipient list while
  you use the test number).

The script is safe to run again any time. It:
1. checks the token and IDs and prints the display name, its review status,
   quality rating and messaging limit;
2. subscribes the app to your WhatsApp account (needed for webhooks);
3. registers the number (with `--pin`);
4. **submits every message template** in English, Hindi and Hinglish, skipping
   ones that already exist;
5. prints each template's status (APPROVED / PENDING / REJECTED + reason) and
   **the category Meta gave it**. If Meta moved a "utility" template to
   "marketing", the line says so, because that changes the price;
6. sends Meta's `hello_world` test message to `--test-to`.

The same checks appear in the app under **Settings → Marketing → Connection**.

If the script stops with **ACTION NEEDED**, it names the step of this guide to
fix. Fix it and run the script again.

## 12. Fill the shop profile and switch on

1. In the app, open **Settings → Marketing → Shop profile**. Fill in shop name,
   address, city, phone, Google Maps link, Google review link and a short
   **slug** (e.g. `somani`). These fill every message; nothing is hard-coded.
2. **Automations:** pick the message language. Welcome message, try-on looks
   and purchase receipt are on by default.
3. **Connection:** download the **backup QR code** and print it for the counter
   (see below).

## How it works in the shop

- Staff create a session with the customer's **photo** and tick **"Customer
  agrees to receive WhatsApp messages"**. The **welcome message** (utility
  template, paid) goes out at once with a **"Send my looks"** button.
  Sessions with only a number and no photo get no welcome. If a photo is added
  later, the welcome goes out then.
- When the customer taps the button, WhatsApp's free **24-hour window** opens.
  Every try-on staff send with **Send to WhatsApp** is then free.
- Looks sent before the customer taps wait in a queue ("Waiting for customer…")
  and go out automatically, in order, the moment they tap. No paid message is
  sent per photo.
- **Backup QR:** if a customer doesn't get or doesn't tap the welcome, they can
  scan the counter QR and send the prefilled message. That opens the window
  too, and their looks go to the number they messaged from (it must match the
  number entered in the session).
- On **End Session → Purchased**, the **receipt** template is sent once. Staff
  can resend it from the session.
- Customers can reply **STOP** to unsubscribe (or **START** to come back). The
  Marketing tab lists who opted out.

## 13. Switching from the test number to your real number

Meta keeps the free test number in a separate **test WhatsApp Business
Account**. Your real number lives in your verified business's own account. So
when the real number is approved, only a few `.env` values change. The webhook,
app secret, verify token, shop profile and settings all stay as they are.

1. In WhatsApp Manager, confirm the real number shows **Connected** and the
   display name review is **Approved** (step 6).
2. Make sure your System User (step 8) has **Full control** of the **real**
   WhatsApp Business Account. If you made the token while testing, assign the
   real account under **Assign assets**. The same token keeps working.
3. In `.env`, change only these two lines (App dashboard → WhatsApp → API Setup,
   pick the real number in the **From** list):

   ```
   WHATSAPP_PHONE_NUMBER_ID=<real number's Phone number ID>
   WHATSAPP_WABA_ID=<real WhatsApp Business Account ID>
   ```

4. Restart and run the setup script **with the PIN** this time:

   ```bash
   docker compose up -d
   docker compose exec backend python scripts/whatsapp_setup.py --pin <your 6-digit PIN> --test-to <your mobile>
   ```

   Templates belong to an account, so the ones approved on the test account
   don't carry over. The script submits them again to the real account
   automatically. Run it again after a few hours to see them **APPROVED**.
5. Make sure a **payment method** is added (step 7) before customers get messages.
6. Print a fresh **backup QR** from Settings → Marketing → Connection. The old
   one points to the test number.

Until the templates show APPROVED on the real account, welcome and receipt
messages fail with "This message template is not approved yet". Try-on looks
sent inside the 24-hour window still work.
