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

Checked against the Supabase and Google Cloud consoles in November 2026.

1. **Create a Supabase project** at <https://supabase.com/dashboard> on the
   free plan. For Malaysia, pick the Singapore region.
2. **Create the table.** Either way works:
   - **GitHub integration (recommended):** in Supabase, open
     *Project Settings*, then *Integrations*, then *GitHub*. Connect
     `Ainmimdal/circuitsense`, set the working directory to `.`, the
     production branch to `main`, and turn on *Deploy to production*. Every
     migration in `supabase/migrations/` is then applied when it reaches
     `main`. Leave automatic branching off on the free plan, because branches
     are billed.
   - **By hand:** open the SQL editor, paste
     `supabase/migrations/20261011000000_projects.sql` and run it.

   Either way, the migration creates the `projects` table with row level
   security, so each user only sees their own rows. It is safe to run twice.
   `supabase/config.toml` holds settings for local development. Without a
   `[remotes]` block, it never changes production auth settings.
3. **Create a Google OAuth client** in Google Cloud Console, under
   **Google Auth Platform**:
   - *Branding*: set the app name to "Elera" and add a support email.
   - *Audience*: choose External, then **Publish app** so that anyone can sign
     in, not only listed test users.
   - *Data Access*: add the `openid` scope. Email and profile are included by
     default, and none of these scopes need Google verification.
   - *Clients*: click **Create** and choose *Web application*. Under
     authorized JavaScript origins, add the production URL and
     `http://localhost:5173`. Under authorized redirect URIs, add the
     **Callback URL** shown on Supabase's Google provider page
     (`https://<project-ref>.supabase.co/auth/v1/callback`). Save the client
     ID and secret.
4. **Turn on Google in Supabase.** Under *Authentication*, then
   *Sign In / Providers*, then *Google*, paste the client ID and secret, enable
   the provider and save.
5. **Allow your app URLs.** Under *Authentication*, then *URL Configuration*,
   set the Site URL to the production address. Add these redirect URLs:
   `http://localhost:5173/**` and, for Vercel preview deployments,
   `https://*-<vercel-team-slug>.vercel.app/**`.
6. **Configure the app.** Copy `.env.example` to `.env.local` and fill in
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both appear in the
   project's **Connect** dialog and under *Settings*, then *API Keys*. Use the
   publishable key (`sb_publishable_...`). The legacy `anon` JWT key still
   works, but Supabase is retiring it at the end of 2026. The publishable key is
   meant to be public, and row level security is what protects the data. Set the same
   two variables in your hosting provider (Vercel, Netlify, Cloudflare Pages
   and so on) before building.
7. **Keep the free project awake.** Supabase pauses free projects after a week
   without activity. In GitHub, under *Settings*, then
   *Secrets and variables*, then *Actions*, add `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY`. The `Keep Supabase awake` workflow then pings the
   database every three days. Even if the project is paused, Elera keeps
   working on the device and syncs once it is resumed.

## Hosting on Cloudflare

`wrangler.jsonc` serves the built `dist/` folder as static assets. In the
Cloudflare dashboard, open *Workers & Pages*, click *Create*, import the
GitHub repository, and set:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The public Supabase URL and publishable key are committed in
`.env.production`, which Vite reads for every production build, so no host
needs extra variables. Build variables with the same names override them.

Then add the `*.workers.dev` address (or a custom domain) to Supabase's
redirect URLs and to the Google client's authorized JavaScript origins.

## Free-plan headroom

As of October 2026, the Supabase Free plan has a 500 MB database, 50,000
monthly active users, 5 GB of egress and 2 active projects. A typical Elera
project is a few tens of kilobytes of JSON, so the database holds thousands of
student projects. The table also rejects any single project over 5 MB. To
remove tombstones older than 90 days, run
`select public.purge_deleted_projects();` in the SQL editor (or schedule it with
`pg_cron`).
