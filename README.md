# The Big Keter Event – Monsey · Raffle App

A one-time event raffle app. Mobile entry form, two prize wheels for the LED screen, and a private admin dashboard with CSV/XLSX export.

> **One-event scope.** This app is intentionally simple: no user accounts, no payments, no SMS, no email sending. Build it, run it, archive it.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** with a custom event palette (blush · mauve · ivory · champagne · gold · deep purple)
- **Supabase** (Postgres, accessed via the service-role key from server routes only)
- **Framer Motion** for wheel + popup animations
- **canvas-confetti** for the win moments
- **ExcelJS** for XLSX export
- PWA-installable (manifest.json + apple-web-app meta)

---

## Pages

| Route | Purpose |
|---|---|
| `/enter` | Public raffle entry form (responsive: mobile, tablet, laptop) |
| `/raffle-screen/<slug>` | Big screen draw page. `<slug>` must match `RAFFLE_SCREEN_SLUG`. |
| `/admin` | Stats, controls, exports. Password-protected. |
| `/login` | Admin sign-in. |
| `/` | Redirects to `/enter`. |

---

## 1. First-time setup

### Create the Supabase project

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** and paste the contents of `supabase/schema.sql`. Run.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, keep secret)

### Install + run locally

```bash
npm install
cp .env.example .env.local
# Fill in the values in .env.local
npm run dev
```

App is now at <http://localhost:3000>.

### Generate the secrets

```bash
# Admin cookie HMAC secret
openssl rand -base64 32

# Hidden raffle-screen URL slug
openssl rand -hex 8
```

Paste them into `.env.local` as `ADMIN_SESSION_SECRET` and `RAFFLE_SCREEN_SLUG`. Pick a strong `ADMIN_PASSWORD`.

---

## 2. Day-of-event playbook

1. **Before guests arrive**
   - Sign into `/admin` from your laptop.
   - If you tested with demo data, click **Clear Demo Entries**. Confirm the entries table is empty (or matches whatever real pre-entries you accepted).
   - Open the big screen browser fullscreen on `/raffle-screen/<your-slug>` (will say "Waiting for raffle to start").

2. **Take entries**
   - Have guests scan a QR code → `/enter` on their phones.
   - Or set up a tablet kiosk at the door on `/enter`.

3. **When you're ready to draw**
   - In `/admin`, click **Start New Raffle**. This freezes all current entries into a pool.
   - The big screen automatically picks up the new round (it polls every 5 seconds).
   - Click the **$100 Gift Card** wheel on the big screen → spin → winner.
   - Click the **Any Book** wheel → spin → winner (the gift card winner is excluded from this round).
   - The "WINNER" popup stays on screen until you click the **X** to close it.

4. **Need a second round?**
   - Take more entries between rounds, then **Start New Raffle** again.
   - Only new entries since the last round are in the new pool.

5. **End of event**
   - Click **Export XLSX** to download all entries with winner flags.
   - Optional: also **Export CSV** for backup.

---

## 3. Deploying to Vercel

```bash
# 1. Push this to a private GitHub repo.

# 2. In Vercel:
#    - Import the repo.
#    - Add the env vars from .env.example (with real values).
#    - Deploy.
```

### Production environment variables (Vercel → Project → Settings → Environment Variables)

```
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
RAFFLE_SCREEN_SLUG=...
```

> Keep `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` server-side only (NOT prefixed with `NEXT_PUBLIC_`). They are already configured that way in `.env.example`.

### Custom domain

If you want `raffle.your-domain.com`, add it in Vercel under **Domains** and update DNS. The PWA manifest works on any domain.

---

## 4. Security notes (read these)

- **Admin password lives in env var.** Set it strong. Sessions expire after 12 hours.
- **The big-screen raffle page is gated only by URL slug.** Anyone with the URL can spin a wheel. Don't share screenshots of the address bar. If a slug is ever exposed, rotate `RAFFLE_SCREEN_SLUG` in Vercel and redeploy.
- **No rate limiting on `/enter`.** Phone uniqueness blocks duplicates from the same number, but a hostile actor with many fake numbers could spam. Acceptable for a private event; not safe for public marketing.
- **No RLS configured** in Supabase. All DB access goes through Next.js server routes using the service-role key. Don't expose the service-role key in client code (you'd have to do that on purpose — the client never imports it).

---

## 5. Important behavior decisions

- **The wheel is decorative.** Names flash through the slices during the spin for visual effect. The actual winner is picked **server-side** with `crypto.randomInt`. The wheel cannot show 100+ names legibly, so it doesn't try.
- **One person cannot win both prizes in the same round.** Enforced by a unique constraint on `(round_id, entry_id)` in the `winners` table.
- **Same prize twice in one round is blocked.** The API returns 409 if you try to spin the gift-card wheel after a gift-card winner already exists.
- **Starting a new round with zero new entries is blocked.** Returns 400 with a clear error.

---

## 6. Project layout

```
keter-raffle/
├── app/
│   ├── enter/                       # Public entry form
│   ├── login/                       # Admin login
│   ├── admin/                       # Admin dashboard (gated)
│   ├── raffle-screen/[slug]/        # Big screen (slug from env)
│   ├── api/
│   │   ├── entries/                 # POST: create entry
│   │   ├── raffle/
│   │   │   ├── start/               # POST: start new round (admin)
│   │   │   ├── pool/                # GET: current frozen pool
│   │   │   └── draw/                # POST: draw winner
│   │   └── admin/
│   │       ├── stats/               # GET: dashboard stats
│   │       ├── export-csv/          # GET: CSV download
│   │       ├── export-xlsx/         # GET: XLSX download
│   │       ├── demo/                # POST: add 100 demo entries
│   │       ├── demo/clear/          # POST: clear demo entries
│   │       ├── login/               # POST: admin sign-in
│   │       └── logout/              # POST: admin sign-out
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── EntryForm.tsx
│   ├── Wheel.tsx                    # The two wheels on the big screen
│   ├── Background.tsx
│   └── Confetti.tsx
├── lib/
│   ├── supabaseServer.ts
│   ├── phone.ts
│   └── auth.ts
├── public/
│   ├── keter-logo.png
│   ├── mountain-bg.jpg
│   ├── fonts/
│   │   ├── PFDinTextCompPro-Regular.ttf
│   │   └── PFDinTextCompPro-Medium.ttf
│   └── manifest.json
├── supabase/
│   └── schema.sql
├── middleware.ts                    # /admin auth gate
├── .env.example
└── README.md
```

---

## 7. Troubleshooting

**"Supabase env vars missing" on start**
Check `.env.local` (locally) or Vercel env vars (production). Restart the dev server after editing `.env.local`.

**Admin keeps redirecting to /login**
Either the password is wrong or `ADMIN_SESSION_SECRET` changed. Sign in again.

**Big screen says "Waiting for raffle to start"**
Click **Start New Raffle** in `/admin` first. The pool needs to be frozen before the wheels work.

**"This phone number has already entered"**
The phone_normalized column has a UNIQUE constraint. If a guest typed it slightly differently, the normalized form still collides.

**Wheel feels laggy**
Disable browser extensions on the LED-screen browser. Use Chrome fullscreen (F11) for best perf.
