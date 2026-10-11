# Accounts and cloud sync

Elera is local-first. Every project is saved in the browser's IndexedDB on the
device, and the app works fully without an account or a network. When the
Supabase settings below are present, students can also **Continue with Google**
to back their projects up and open them on any computer.

## How it works

- `src/persistence/project-library.js` is the project library. It stores
  records in IndexedDB (`src/persistence/local-project-store.js`) and moves
  projects from the old `localStorage` library across on first load.
- Signing in moves the guest projects on that device into the account. After
  that, every save, delete, return to the tab or reconnect triggers a sync. Each
  project syncs on its own and the newest save wins.
- Deletes are synced as small tombstones so other devices remove the project
  too.
- Signing out uploads pending changes, then removes that account's synced
  copies from the device, so shared lab computers stay private.
- `src/persistence/cloud.js` loads the Supabase SDK only when it is configured.
  `src/persistence/account.js` tracks the Google session.
- The toolbar **Save** button updates the project that is open. A circuit that
  has never been named opens **My projects** so the student can name it.

## One-time setup (about 15 minutes)

1. **Create a Supabase project** at <https://supabase.com/dashboard> on the
   free plan. For Malaysia, pick the Singapore region.
2. **Create the table.** Open the SQL editor, paste
   `supabase/migrations/20261011000000_projects.sql` and run it. It creates the
   `projects` table with row level security, so each user only sees their own
   rows.
3. **Create a Google OAuth client** in Google Cloud Console under
   *APIs & Services*:
   - On the *OAuth consent screen*, choose External, app name "Elera", and only
     the default `email`, `profile` and `openid` scopes. These are not
     sensitive, so Google does not need to verify the app.
   - Under *Credentials*, choose *Create credentials*, then *OAuth client ID*,
     with type *Web application*.
   - For the authorized redirect URI, add
     `https://<your-project-ref>.supabase.co/auth/v1/callback`. The exact value
     is shown on Supabase's Google provider page.
4. **Turn on Google in Supabase.** Under *Authentication*, then
   *Sign In / Providers*, then *Google*, paste the client ID and secret and
   enable it.
5. **Allow your app URLs.** Under *Authentication*, then *URL Configuration*,
   set the Site URL to the deployed address and add both the deployed address
   and `http://localhost:5173` to the redirect URLs.
6. **Configure the app.** Copy `.env.example` to `.env.local` and fill in
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are under
   *Project Settings*, then *API Keys*. The publishable (anon) key is meant to
   be public, and row level security is what protects the data. Set the same
   two variables in your hosting provider (Vercel, Netlify, Cloudflare Pages
   and so on) before building.
7. **Keep the free project awake.** Supabase pauses free projects after a week
   without activity. In GitHub, under *Settings*, then
   *Secrets and variables*, then *Actions*, add `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY`. The `Keep Supabase awake` workflow then pings the
   database every three days. Even if the project is paused, Elera keeps
   working on the device and syncs once it is resumed.

## Free-plan headroom

As of October 2026, the Supabase Free plan has a 500 MB database, 50,000
monthly active users, 5 GB of egress and 2 active projects. A typical Elera
project is a few tens of kilobytes of JSON, so the database holds thousands of
student projects. The table also rejects any single project over 5 MB. To
remove tombstones older than 90 days, run
`select public.purge_deleted_projects();` in the SQL editor (or schedule it with
`pg_cron`).
