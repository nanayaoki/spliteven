# SplitSmart — starter

The starter app for the **deepEntra Academy · Build & Ship It** course. It's a basic
expense-splitter (one group, a list of expenses, a running total). Over the course you'll
give it an **AI brain** (Hour 3) and a **real database with logins** (Hour 5), then polish
and ship it to your own domain (Hours 7–8).

This is the **"My Group"** app you see on the course slide — the basic version you deploy in
Hour 2, before you add the magic.

<p align="center"><b>SplitSmart · My Group</b><br/>🍽️ Dinner — paid by Aisha — ₹1,800<br/>🚕 Cab — paid by Raj — ₹400<br/><b>Total ₹2,200</b></p>

---

## Hour 2 — get it on your laptop & ship it

### 1. Fork this repo
Click **Fork** (top-right) → you get your own copy under your GitHub account.

### 2. Clone your fork and open it
Ask your AI assistant: *"Clone my fork and open it in VS Code."* Or, in a terminal:

```bash
git clone https://github.com/<your-username>/splitsmart-starter.git
cd splitsmart-starter
```

### 3. Install the app's parts
```bash
npm install
```

### 4. Run it
```bash
npm run dev
```
Open **http://localhost:3000** — SplitSmart is alive on your laptop. 🎉

### 5. Make one tiny change
Ask your AI: *"Change the title to 'Raj's SplitSmart' and keep the button deepEntra blue."*
Save → the browser updates instantly. Then snapshot it:

```bash
git add -A
git commit -m "My first change"
git push
```

### 6. Put it on the internet — Vercel 🚀

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/maheshbaxi/splitsmart-starter)

- Import your fork into **[Vercel](https://vercel.com/new)** (it finds your GitHub repo).
- Click **Deploy** → ~1 minute → you get a live `…vercel.app` link. Open it on your phone and
  text it to a friend.
- From now on, **every `git push` redeploys your live site automatically.**

> 🔒 **Keep your API keys private** — never paste them into a screenshot, a commit, or a shared
> doc. Secrets go in Vercel's **Environment Variables** (and in `.env.local` locally, which is
> git-ignored). See `.env.example`.

---

## Hour 3 — give SplitSmart an AI brain

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` to a key from
[Google AI Studio](https://aistudio.google.com/app/apikey). The key is read only by the
serverless `POST /api/parse-expense` function; it is never sent to the browser. Set the same
environment variable in Vercel before deploying.

Type a plain-English expense such as:

- `me, raj and priya had dinner for 1200`
- `900 cab, split with 2 friends`
- `coffee 300, just me`

The function asks Gemini for JSON containing `amount`, `people`, `each`, and `description`,
validates the response, and recalculates `each` before the expense is added. Invalid or
unparseable requests are shown as an error instead of being added with guessed values. If the
configured model is temporarily overloaded or times out, the function retries with
`gemini-3.5-flash`.

## What's inside

| | |
| --- | --- |
| **Framework** | [Next.js](https://nextjs.org) (App Router) + React |
| **The app** | `app/page.js` — the SplitSmart UI |
| **AI function** | `app/api/parse-expense/route.js` — server-side Gemini JSON parsing |
| **Styles** | `app/globals.css` + inline styles (deepEntra blue) |
| **Data** | Saved in your browser (`localStorage`) for now — you'll move it to a real database in Hour 5 |

## Accounts and groups

SplitSmart uses a username/password-only Supabase Auth account. Users never enter an email:
the server maps each username to an internal identity. In the Supabase dashboard, disable
**Confirm email** under Authentication → Providers → Email so signup logs in immediately and
does not require an SMTP/confirmation-email service. If signup reports an email-sending error,
this setting is still enabled.

Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor before using the
app. It creates the shared `groups`, `group_members`, `profiles`, and group-scoped `expenses`
tables, plus the membership helper functions and Row-Level Security policies. The dashboard
lets a user create groups, switch between groups, invite others with a join code, and join a
group by code. All expense reads and writes include the active group and are enforced again
by database RLS.

If the account was created before the schema finished, run
[`supabase/profiles.sql`](./supabase/profiles.sql) separately. Then log in again; the app
repairs the profile for the existing account. This migration also installs a database trigger
so every future Supabase Auth user receives a profile automatically.

## Scripts
```bash
npm run dev     # local dev → http://localhost:3000
npm run build   # production build
npm run start   # run the production build
```

---

Made for **deepEntra Academy** · [academy.deepentra.ai](https://academy.deepentra.ai)
