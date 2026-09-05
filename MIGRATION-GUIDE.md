# Somani Fabs — Full Migration to Your Own DigitalOcean Droplet

**Goal:** run this app 100% on your own server, with your own GitHub repo, so that
every `git push` automatically updates the live site. No Emergent needed afterwards.

**How it will work when finished:**

```
You (Claude Code on your laptop)
        │  git push
        ▼
   GitHub repo  ──(GitHub Actions logs into your droplet)──▶  DigitalOcean Droplet
                                                              ├─ nginx  (port 80/443, HTTPS)
                                                              ├─ frontend container (React build)
                                                              └─ backend container (FastAPI)
                                                                     │
                                                                     ▼
                                                              MongoDB Atlas (cloud database)
```

Everything the server needs is already in this repo:

| File | What it does |
|---|---|
| `backend/Dockerfile` | Builds the FastAPI backend image |
| `backend/requirements.prod.txt` | Backend packages (no Emergent-only packages) |
| `frontend/Dockerfile` | Builds the React app and serves it with nginx |
| `docker-compose.yml` | Runs both containers together |
| `deploy/setup-droplet.sh` | One-time server setup (Docker, nginx, firewall, HTTPS tool) |
| `deploy/nginx-site.conf` | Server nginx config (routes `/api` → backend, `/` → frontend) |
| `deploy/deploy.sh` | Pull latest code + rebuild + restart |
| `deploy/env.example` | Template for your secrets file |
| `.github/workflows/deploy.yml` | Auto-deploy on every push to `main` |

---

## STEP 1 — Put the code on GitHub (5 min)

1. In the Emergent chat input, use the **“Save to GitHub”** button.
2. Create a **private** repo, e.g. `somanifabs`. Branch: `main`.
3. Confirm on github.com that you can see `backend/`, `frontend/`, `deploy/`,
   `docker-compose.yml`.

⚠️ `.env` files are **not** pushed (that is correct and intentional — secrets never
go into GitHub). You will create the `.env` directly on the droplet in Step 4.

---

## STEP 2 — Create the database on MongoDB Atlas (10 min)

1. Go to <https://www.mongodb.com/cloud/atlas/register> and sign up.
2. **Create a cluster** → choose **M0 (Free)** → region **Mumbai (ap-south-1)**.
3. **Database Access** → *Add New Database User* → username + a strong password
   (write both down; avoid `@ : / ?` characters in the password).
4. **Network Access** → *Add IP Address* → enter **your droplet’s IP address**.
   (If you get stuck here, `0.0.0.0/0` also works but is less secure.)
5. **Database → Connect → Drivers → Python** → copy the connection string. It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`
   Replace `USER` and `PASSWORD` with the ones you created.

**About your existing data:** the current production database lives inside Emergent, so
Atlas starts empty. Your admin account is re-created automatically on first start from
`SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`. Customer records would need to be
re-added (or ask Emergent support for a database dump if you want them moved).
Categories/settings are re-created automatically.

---

## STEP 3 — Prepare the droplet (10 min)

On your laptop terminal (Mac/Linux) or PowerShell (Windows):

```bash
ssh root@YOUR_DROPLET_IP
```

Then, on the droplet, run these one by one:

```bash
# 1. get the code
git clone https://github.com/YOUR_USERNAME/somanifabs.git /opt/somanifabs
cd /opt/somanifabs

# 2. one-time server setup (Docker + nginx + firewall + HTTPS tool + swap)
bash deploy/setup-droplet.sh

# 3. install the nginx site config
cp deploy/nginx-site.conf /etc/nginx/sites-available/somanifabs
ln -sf /etc/nginx/sites-available/somanifabs /etc/nginx/sites-enabled/somanifabs
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

For a **private** repo, GitHub will ask for a password during `git clone`.
Use a *Personal Access Token* instead: GitHub → Settings → Developer settings →
Personal access tokens → Tokens (classic) → Generate, scope `repo`. Paste the token
as the password.

---

## STEP 4 — Create the secrets file on the droplet (5 min)

```bash
cd /opt/somanifabs
cp deploy/env.example .env
nano .env
```

Fill in:

| Key | Value |
|---|---|
| `MONGO_URL` | your Atlas connection string from Step 2 |
| `DB_NAME` | `somanifabs` (keep it the same forever) |
| `CORS_ORIGINS` | `*` for now |
| `JWT_SECRET` | any long random text (run `openssl rand -hex 32` to make one) |
| `SUPER_ADMIN_USERNAME` | your admin login |
| `SUPER_ADMIN_PASSWORD` | your admin password |
| `GEMINI_API_KEY` | your Google AI Studio key — <https://aistudio.google.com/apikey> |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-image` |
| `GEMINI_IMAGE_FALLBACK_MODEL` | `gemini-2.5-flash-image` |

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

```bash
chmod 600 .env      # only root can read the secrets
```

> The Gemini key currently used in Emergent belongs to Emergent’s universal key, so
> you need **your own** Google AI Studio key for the droplet. It is free to create;
> image generation is billed by Google to your own Google account.

---

## STEP 5 — First launch (5 min)

```bash
cd /opt/somanifabs
docker compose build      # takes 3–6 minutes the first time
docker compose up -d
docker compose ps         # both services should say "running"
curl http://127.0.0.1:8001/health
```

Expected health output: `{"status":"ok", ...}`.

Now open in your browser: **`http://YOUR_DROPLET_IP`**

- Login with your `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`.
- Add a customer with a photo, start a session, generate a try-on image.
- Check the live display URL too.

If something fails: `docker compose logs --tail=80 backend`

---

## STEP 6 — Turn on automatic deploys from GitHub (10 min)

**6a. Create an SSH key for GitHub** (on the droplet):

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy          # <-- copy this WHOLE private key, including BEGIN/END lines
```

**6b. Add secrets in GitHub:** repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `DROPLET_HOST` | your droplet IP |
| `DROPLET_USER` | `root` |
| `DROPLET_SSH_KEY` | the whole private key you copied |

**6c. Test it:** GitHub → **Actions** tab → “Deploy to DigitalOcean droplet” → **Run workflow**.
Green tick = your pipeline works. From now on, every push to `main` deploys automatically
in about 3–5 minutes.

---

## STEP 7 — Point somanifabs.com at the droplet + free HTTPS (15 min)

Do this only after Step 5 works on the IP.

**7a. Change DNS** — log in wherever you bought the domain (GoDaddy / Namecheap /
BigRock / Hostinger…), open **DNS management** for `somanifabs.com`, and set:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `YOUR_DROPLET_IP` | 300 |
| A | `www` | `YOUR_DROPLET_IP` | 300 |

Delete any old A / CNAME records that pointed to Emergent. If the domain uses
Cloudflare, set the record to **DNS only (grey cloud)** until HTTPS is issued.

Wait 10–30 minutes, then check on the droplet:

```bash
dig +short somanifabs.com     # should print your droplet IP
```

**7b. Issue the HTTPS certificate** (on the droplet):

```bash
certbot --nginx -d somanifabs.com -d www.somanifabs.com --agree-tos -m you@email.com --redirect
```

Certbot edits nginx for you and auto-renews every 60 days (nothing more to do).
Verify: <https://somanifabs.com>

**7c. Tighten CORS** (optional but good):

```bash
nano /opt/somanifabs/.env       # CORS_ORIGINS=https://somanifabs.com,https://www.somanifabs.com
cd /opt/somanifabs && docker compose up -d
```

**7d. Turn off the Emergent deployment** once the droplet is live, so you stop paying for it.

---

## STEP 8 — Your day-to-day workflow from now on

On your laptop, once:

```bash
git clone https://github.com/YOUR_USERNAME/somanifabs.git
cd somanifabs
```

Then forever after:

```bash
# make changes (Claude Code, or by hand)
git add -A
git commit -m "what I changed"
git push
```

→ GitHub Actions rebuilds and restarts the droplet automatically. Watch progress in the
**Actions** tab. Done.

**Running the app on your laptop before pushing (optional but recommended):**

```bash
# backend
cd backend && pip install -r requirements.prod.txt
cp ../deploy/env.example .env   # fill it in with the same values
uvicorn server:app --reload --port 8001

# frontend (new terminal)
cd frontend && yarn install
echo 'REACT_APP_BACKEND_URL=http://localhost:8001' > .env
yarn start
```

---

## STEP 9 — Useful commands (keep this list)

```bash
cd /opt/somanifabs

docker compose ps                     # what is running
docker compose logs -f backend        # live backend logs
docker compose logs --tail=100 frontend
docker compose restart backend        # restart backend only
bash deploy/deploy.sh                 # manual deploy (same as GitHub does)
docker compose down                   # stop everything
df -h ; free -m                       # disk & memory
docker system prune -af               # free disk space if the droplet fills up
systemctl reload nginx                # after editing nginx config
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site shows nginx default page | `rm -f /etc/nginx/sites-enabled/default && systemctl reload nginx` |
| 502 Bad Gateway | Containers are down → `docker compose up -d`, then check `docker compose logs backend` |
| Login fails / backend unhealthy | Wrong `MONGO_URL`, or droplet IP not whitelisted in Atlas → Network Access |
| Try-on generation fails | Bad/exhausted `GEMINI_API_KEY`, or Google billing not enabled |
| Build killed / out of memory | The setup script adds 2 GB swap; if it still fails, resize the droplet to 2 GB RAM |
| GitHub Action fails at SSH | Re-copy the **private** key (all lines) into `DROPLET_SSH_KEY` |

## Backups (do this monthly)

- **Database:** MongoDB Atlas → Cluster → **Backup** (M0 free tier: use
  *Database → Collections → Export* or run `mongodump` with your connection string).
- **Server:** DigitalOcean → Droplet → **Snapshots → Take Snapshot** (or enable weekly
  automated backups for ~20% of the droplet price).
- Your code is already safe in GitHub. Only `.env` exists nowhere else — keep a copy of
  it in a password manager.
