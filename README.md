# JobTrack Web Platform v1.5.3 — Full source (current schema fix)

This release is based on your **actual Supabase SQL schema**, not on assumptions about earlier migrations.

## Required database change for your existing project

1. **Back up the database** in Supabase before changes.
2. Open **Supabase Dashboard > SQL Editor > New query**.
3. Run ONLY `supabase/migrations/008_current_schema_full_fix.sql` on the database from your latest screenshot / SQL export. **Do not run any of the old 001–007 migrations** for this upgrade, and do not run the generated CREATE TABLE schema.
4. Verify that `applications.profile_id` and `profiles.profile_name` exist, and that `users.profiles` contains JSON arrays of profile UUID strings. Existing `profiles.user_id` is neither used nor recreated.
5. If the `resumes_profile_name_unique` index fails because you already have two resumes of the same name for the same profile, remove/reconcile duplicates **after backing up** and rerun the migration. If it fails, the whole SQL transaction rolls back.
6. Confirm existing users have correct `users.profiles` arrays. The migration deliberately does not guess the ownership of orphan profiles.
7. Keep Supabase Auth configured (email/password provider enabled). If email confirmation is enabled, confirm your email after sign-up.

## Local setup

Requires Node.js 20+ and npm. From project root:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
npm install
npm run dev
```

On Windows PowerShell, copy with `Copy-Item` instead of `cp` if needed. Set the variables in both `.env` files using your Supabase Project URL and **publishable/anon key** (never a service-role key in the browser). Set `CLIENT_ORIGIN=http://localhost:5173` on backend.

- React: http://localhost:5173
- Node API: http://localhost:4000
- Authentication: Supabase Auth; never write a password to `public.users`.

## Profiles and applications

- `public.users.profiles` (JSON) contains ordered profile UUIDs. First ID is the default profile.
- `public.profiles` stores names, contact information and addresses; it has **no `user_id`**.
- `public.resumes.profile_id` connects each uploaded resume to its applicant profile.
- `public.applications.profile_id` connects each job application to a selected applicant profile; `resume_id` is optional and must match its profile.
- **My Profiles** lets authenticated users create, edit, set default and delete eligible profiles. Creating and deleting uses atomic database functions. No profile IDs are accepted from the client as proof of ownership.
- Access is restricted with Supabase Row Level Security and backend checks; `users.profiles` cannot be written directly by normal users.
- The profile selector in the application modal supports multiple identities. Resume selection is restricted to that profile.

## Important limitation

The schema migration and full frontend have not been executed against your private Supabase project here. Existing RLS policies and triggers may differ; inspect migration errors carefully rather than rerunning legacy migrations. This package is source code for local deployment and live testing, not a completed cloud deployment.

---

## Additional project details from prior README

# JobTrack Web Platform — JSON Profile Membership (v1.5.2)

This variant supports your CURRENT Supabase schema: `public.profiles` has **no `user_id`**, and `public.users.profiles` is a JSON array of profile UUIDs. It does not require `users.profiles_id`; **the first UUID in the JSON array is the default profile**.

**Do not rerun migrations 001–006 against your existing database.** They are historical migration files and may refer to `profiles.user_id`. Back up the database, then run **only** `supabase/migrations/007_profiles_json_membership.sql` in Supabase SQL Editor. This SQL is intended for a schema already containing users, profiles, applications, resumes, and the other columns shown in prior screenshots. Review it against your actual schema before applying.

For an existing user, `users.profiles` must contain the IDs of that user's applicant profiles, for example:

```json
["550e8400-e29b-41d4-a716-446655440000", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"]
```

The migration **does not infer membership automatically** after `profiles.user_id` has been removed. Preserve or manually restore each user's correct profile IDs from trusted records before using the application. Never add profile IDs belonging to other users.

The backend reads `users.profiles` for My Profiles, creates new profiles through an atomic database RPC, edits only membership-authorized profiles, deletes unreferenced non-default profiles via RPC, and sets the default profile by moving its ID to the front of the JSON array. This intentionally does not use `profiles.user_id` or `users.profiles_id`.

# Version 1.5.1 — JSON-linked applicant profiles

Profiles no longer have a `user_id` column. Membership is stored as UUID strings in `public.users.profiles` (JSON array). All profile CRUD is authenticated, and create/delete operations use atomic Supabase RPCs. The default profile remains `public.users.profiles_id`.

For an existing v1.5.0 database, **back up the database**, then run `supabase/migrations/007_profiles_json_membership.sql` in Supabase SQL Editor. Do not re-run prior migrations. For new installations run 001–007 in order. The migration requires v1.5.0 schema with `profiles.user_id` still present, and replaces it.

**Security:** Never directly write `users.profiles` from the client. Profiles are fetched by UUID membership and protected by RLS; signed-in users can update only member profiles. Create/delete use PostgreSQL security-definer functions, which atomically maintain the JSON array. Users cannot change `users.level`. Passwords stay in Supabase Auth.

# JobTrack Web Platform v1.5.0 — My Profiles (multiple applicant identities)

This version replaces the single-profile workflow with **My Profiles**. Every signed-in user can create, edit, view, and (when unlinked) delete multiple job-application profiles. An account has a default profile; applications and resumes are explicitly associated with a selected profile. The login email is separate from profile contact emails.

## How the schema works

- `auth.users` holds login identities and password hashes, never application passwords in your public tables.
- `public.users.id` matches `auth.users.id`; `public.users.profiles` is a **JSON array of profile UUID strings**, e.g. `["uuid1", "uuid2"]`. The account also retains `profiles_id` as the default profile UUID for compatibility with earlier releases.
- `public.profiles`: one row per applicant identity (`id`, `user_id`, `profile_name`, `full_name`, `email`, `phone_number`, location, DOB, address fields, bio). `user_id` is the owning account.
- `public.resumes.profile_id` and `public.applications.profile_id` identify the applicant identity. Uploaded resumes and applications are scoped to that profile.
- A **database trigger** automatically refreshes `public.users.profiles` on profile create/delete; clients cannot change account JSON directly. The backend GET /api/profiles reads the IDs from the JSON array and resolves actual owned profile rows.

## Upgrade existing project (IMPORTANT)

1. **Back up your Supabase database.** Open Supabase SQL Editor.
2. If your database already includes everything from v1.3 (migrations 001–004), apply `005_multiple_applicant_profiles.sql` then `006_sync_user_profile_ids.sql` **in order**. If you previously installed v1.4 including migration 005, run **only migration 006**. Do NOT rerun 001–004.
3. If your database was created manually (e.g. the screenshot with `users.profiles` but *without* `users.profiles_id`), do **not** blindly run these migrations: reconcile your table structure first. These upgrade migrations expect v1.3 columns and may otherwise fail. The required extra columns are `users.profiles_id`, `profiles.user_id`, `profiles.profile_name`, and `applications.profile_id`.
4. Check `SELECT id, profiles, profiles_id FROM public.users;`. The `profiles` JSON should be an array of profile ID strings. Inspect `SELECT id,user_id,profile_name,full_name FROM public.profiles;`.
5. For a new project, execute 001 → 002 → 003 → 004 → 005 → 006 in order.

## Start the web app

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`, enter your Supabase URL / publishable key, then run:

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`. Sign in → **My Profiles** → **Add profile**; enter the profile label, name, email, phone, location, DOB, full address and other details. Use **Edit**, **Make default**, or **Delete**. Deleting is blocked for the default profile or while it has applications/resumes. On the Applications form and Resumes page, select the applicant profile.

## API

- `GET /api/profiles`: list the account's profiles using `users.profiles` UUID array.
- `POST /api/profiles`: create an applicant profile; SQL trigger adds its UUID to the account JSON.
- `PATCH /api/profiles/:id`: edit contact details.
- `POST /api/profiles/:id/default`: set the default profile.
- `DELETE /api/profiles/:id`: delete an unlinked, non-default profile; SQL trigger removes its UUID from JSON.
- `GET /api/me`: return account including `profiles` array and `profiles_id` default.

All endpoints require the signed-in Supabase JWT, apart from authentication endpoints. Row-level security restricts profile access to its account. The Chrome extension is **not yet synchronized** to the web app.

## Verification and limitations

Static JavaScript syntax and existing Node unit tests can be run with `npm test`; the SQL requires a real Supabase migration test. No live Supabase migrations or browser E2E tests have been performed in this package. For an account that uses a custom preexisting JSON structure, database migration review is required.

---

## Prior release notes

# JobTrack Web Platform v1.3.0 — Supabase schema-aligned

React + Vite frontend, Node.js/Express backend, Supabase PostgreSQL/Auth/Storage.

## Existing Supabase database (important)

If you already ran migrations 001, 002 and 003, open **Supabase > SQL Editor** and run **only** `supabase/migrations/004_match_visualized_schema.sql`. **Do not rerun 001 to rebuild your data** and do not drop tables. This migration adds `resumes.profile_id` and `applications.resume_id`, and backfills links from existing `resume_name` values when present. Old columns are left in place to avoid data loss. Check for mismatches before running in production and take a database backup first.

If deploying to a new Supabase project, run migrations 001, 002, 003, 004 in numerical order.

### Schema mapping

- `auth.users`: Supabase login identity and password hashes. Never copy passwords into `public.users`.
- `public.users`: `id`, `email`, `level`, `profiles_id`, timestamps. Each authenticated user has one profile.
- `public.profiles`: name, email, location, DOB, full address, address line 2, city, state/region, postal code, country, phone, bio and timestamps.
- `public.resumes`: `id`, `user_id`, `profile_id`, `name`, `file_path`, `file_name`, `uploaded_at`. Files are stored in the private `resumes` bucket.
- `public.applications`: job information, user ownership, statuses, dates, `resume_id` referencing the uploaded resume. A missing reference is `null`.

The screenshot shows the `resume_id` / `profile_id` relationships. Existing v1.2 storage may also contain legacy columns; leaving them in place is safe.

## Setup

1. Create/open your Supabase project. Run the applicable migration(s) above. Confirm **Authentication > Providers > Email** is configured; set redirect URLs in Supabase Auth URL Configuration.
2. Install Node.js 20+, unzip this project.
3. Copy `server/.env.example` to `server/.env`; set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT`, `CLIENT_ORIGIN`.
4. Copy `client/.env.example` to `client/.env`; set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
5. From the project root run `npm install` then `npm run dev`. Frontend: http://localhost:5173; API: http://localhost:4000.
6. Register/sign in, edit your profile, upload a resume under one of eight approved names, and create an application. The application Resume dropdown shows your actual uploaded resume records.

**Do not place the Supabase service-role key in frontend code or the browser extension.** All authenticated backend calls use the user's JWT and Supabase RLS.

## API endpoints

- `POST /api/auth/signup`, `/api/auth/signin`, `/api/auth/forgot-password`; authenticated `/api/auth/signout`
- `GET /api/me`, `PATCH /api/me`
- `GET /api/applications`, `POST /api/applications`, `PATCH /api/applications/:id`, `DELETE /api/applications/:id`
- `GET /api/resumes`, `POST /api/resumes`, `GET /api/resumes/:id/url`, `DELETE /api/resumes/:id`
- `POST /api/recommend-resume`

### Application resume mapping

Application create/update requests accept `resume_id` (UUID of an uploaded resume), or `null`. When omitted during creation, the backend recommends a resume name based on job skills and links an uploaded resume of that name if one exists; otherwise `resume_id` is null. The backend verifies the selected resume belongs to the signed-in user. The API reads `resumes:resume_id(id,name,file_name)` so the UI shows the stored name.

### Security and notes

Profile/account access is limited by RLS to the logged-in user. `level` is never editable by the client. Authentication is handled by Supabase Auth. File uploads are limited to 10 MB, PDF/DOCX, with owner-scoped storage. The project has not been connected to your live Supabase environment; run migration and browser integration tests before production.

## Previous project information

# JobTrack Web Platform v1.2.0 — Accounts and Editable Profiles

## Account and profile additions

- **Account table:** `public.users` holds `id`, `email`, `level` (`user` or `admin`), and `profiles_id` (foreign key to `public.profiles`). Each user's login password is securely managed **only** by Supabase Auth; never create a plaintext password column.
- **Profile table:** `public.profiles` holds full name, location, date of birth, full address, address line 2, city, state/region, postal code, country, phone number, bio, and read-only login email.
- **Backend:** `POST /api/auth/signup`, `POST /api/auth/signin`, `POST /api/auth/forgot-password`, `POST /api/auth/signout`, `GET /api/me`, `PATCH /api/me`. Authentication uses Supabase JWT and row-level security; profile edits cannot set user levels or change authentication email.
- **Frontend:** Sign up and sign in screens, and a new **Profile** navigation page with editable personal fields and save feedback. Account level, profile ID, and email are read-only.

### Database installation or upgrade

For a fresh project execute **in order**:
1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_user_profiles.sql`
3. `supabase/migrations/003_accounts_extended_profiles.sql`

For an existing v1.1.0 database, execute **only migration 003**. It backfills account rows for existing Supabase Auth users. Do not run the migrations out of order.

Set the API and frontend `.env` files as described below, then run `npm install` and `npm run dev`. Sign up at http://localhost:5173, confirm email if required, and visit **Profile** to edit information.

**Security:** DOB, address, and phone are personal information. RLS restricts rows to the logged-in owner. Consider a retention/deletion policy and additional access audits before production. Never let untrusted clients set `level: 'admin'`. The login email must be changed through a verified Supabase Auth flow, not by editing the profile.

---

# JobTrack Web Platform v1.2.0 — Accounts & Authentication

## New in this version

- Supabase Auth-backed signup, signin, password-reset endpoints handled by the Node.js backend.
- React signup/signin/forgot-password screens connected to the backend; optional full name.
- `public.profiles` user database table and a secure database trigger to create a profile upon signup.
- `GET /api/me`, `PATCH /api/me`, and authenticated `POST /api/auth/signout` endpoints.
- Existing application/resume tables retain per-user RLS policies and use the signed-in user's token.
- No service-role key or password hashes stored in application tables. Credentials are handled by Supabase Auth.

## Database steps

1. Create a Supabase project at https://supabase.com/dashboard.
2. Open **SQL Editor** and run `supabase/migrations/001_initial.sql`, then `supabase/migrations/002_user_profiles.sql` in that order.
3. In **Authentication → Providers → Email**, enable email/password authentication. Configure email confirmation according to your needs.
4. In **Authentication → URL Configuration**, set site URL `http://localhost:5173` and allow `http://localhost:5173/**` for redirects.
5. For production, configure an approved SMTP provider and set HTTPS site URL and allowlisted redirect URLs. Do not disable email verification in production without evaluating account safety.

## Local installation

1. Install a current supported Node.js LTS release.
2. From the root folder, run `npm install`.
3. Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`.
4. Set the actual Supabase project URL and publishable/anon key in **both** env files.
5. Set `CLIENT_ORIGIN=http://localhost:5173` and `AUTH_REDIRECT_URL=http://localhost:5173` on the backend.
6. Run `npm run dev`; open http://localhost:5173.
7. Choose **Create an account**, enter full name (optional), email, and password (8+ characters).
8. Confirm your email if confirmation is enabled, then sign in.
9. Signed-in users can manage their own applications and resumes in the dashboard.

## Backend authentication API

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | Public, rate-limited | Create Supabase Auth account + profile trigger |
| POST | `/api/auth/signin` | Public, rate-limited | Authenticate and obtain session tokens |
| POST | `/api/auth/forgot-password` | Public, rate-limited | Email reset link |
| POST | `/api/auth/signout` | Bearer token | Revoke current session |
| GET | `/api/me` | Bearer token | Return auth user + profile |
| PATCH | `/api/me` | Bearer token | Update full name |
| GET/POST | `/api/applications` | Bearer token | List/create owned applications |

Examples:

```bash
curl -X POST http://localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"full_name":"Demo User","email":"demo@example.com","password":"ExampleLongPassword123!"}'

curl -X POST http://localhost:4000/api/auth/signin -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"ExampleLongPassword123!"}'
```

The frontend uses `supabase.auth.setSession()` with credentials returned from the backend so the existing authenticated application/resume APIs continue working; session refresh is managed by Supabase JS in the browser. Do not send refresh tokens to external sites. Supabase Auth owns account passwords and reset emails; the `profiles` table holds display information only.

**Note:** A password reset link opens the configured frontend URL. The app currently supports sending reset emails, but does not yet include a dedicated new-password form for recovery sessions; use Supabase Auth's `updateUser({ password })` in a dedicated recovery screen to complete reset flows if needed.

---

# JobTrack — Job Application Management Web Platform

A standalone full-stack web application to manage job applications, resumes, application stages, follow-ups, and analytics. It complements the existing Chrome extension but **does not automatically sync with it yet**.

## Technology

- **Frontend:** React 18 + Vite, Recharts, Lucide icons, responsive CSS
- **Backend:** Node.js 20+ / Express, Zod, Multer
- **Authentication:** Supabase Auth email/password
- **Database:** Supabase Postgres with Row Level Security (RLS)
- **Resume storage:** private Supabase Storage bucket; signed temporary download links

## Prerequisites

1. Node.js 20+ and npm
2. A Supabase project, created at <https://supabase.com/dashboard>
3. Supabase project URL and publishable key (or legacy `anon` key). **Never use the secret/service-role key in the browser or your extension.**

## Install and run (step by step)

1. Unzip `job-tracker-web-platform.zip` and open the `job-tracker-web-platform` directory.
2. Open the Supabase dashboard, create a project, and wait for provisioning.
3. Open **SQL Editor → New query** and paste/run `supabase/migrations/001_initial.sql` completely. This creates application and resume tables, RLS policies, indexes, and a private storage bucket. Running again resets the policies to the included version.
4. In **Authentication → Providers → Email**, enable email/password. Choose whether email confirmation is required. For production set the correct **Authentication URL Configuration** / redirect settings.
5. Copy `server/.env.example` to `server/.env`; fill in your Supabase URL and publishable key / anon key.
6. Copy `client/.env.example` to `client/.env`; use the **same** Supabase URL and publishable key / anon key.
7. From the root of the project, run:

   ```bash
   npm install
   npm run dev
   ```

8. Open **http://localhost:5173**. Create an account and sign in. If email verification is enabled, confirm the email first.
9. Go to **Resumes** to upload files, or **Applications** to save a job posting manually.

The API runs at **http://localhost:4000**. `GET /api/health` is public and can be used to verify it is running.

## Structure

```text
job-tracker-web-platform/
├── client/
│   ├── public/icon.png
│   ├── src/main.jsx       # React SPA: auth, dashboard, applications, resumes, analytics
│   ├── src/style.css      # Responsive blue theme
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── server/
│   ├── src/index.js       # Express API / protected routes
│   ├── src/resume-selector.js
│   ├── tests/resume.test.js
│   ├── .env.example
│   └── package.json
├── supabase/migrations/001_initial.sql
├── docs/extension-integration.txt
├── .gitignore
├── README.md
└── package.json           # Root npm workspaces
```

## Main features

- Account signup/signin; every user's data isolated by RLS
- Application CRUD: company, exact title, platform, salary, URL, description, work arrangement, status, dates, notes and technologies
- Search, status filtering, platform filtering
- Dashboard counters, pipeline progress, upcoming follow-up dates, recent applications
- Analytics charts by status and platform
- Resume library with restricted names: `Frontend_Resume`, `Node_Resume`, `Node_Python_Resume`, `Python_Resume`, `Java_Resume`, `.NET_Resume`, `GO_Resume`, `AI_ML_Resume`
- Private PDF/DOCX upload up to 10 MB; replacing an existing named resume removes the previous stored file
- Automatic resume recommendation when adding a job without manually selecting a resume. Can be overridden manually.

## Automatic resume mapping

- Node.js + Python → `Node_Python_Resume`
- Python / Django / FastAPI → `Python_Resume`
- Node.js / NestJS / Express → `Node_Resume`
- Java / Spring → `Java_Resume`
- C# / .NET / Blazor → `.NET_Resume`
- Go / Gin / GORM → `GO_Resume`
- PyTorch / TensorFlow / MLflow → `AI_ML_Resume`
- None of the above → `Frontend_Resume`

This is a simple deterministic heuristic, not an LLM. For multiple other backend types, the current priority is Python, Node, Java, .NET, Go, AI/ML; adjust `server/src/resume-selector.js` to customize it. Manual selection always wins. Matching text comes from job title, technology tags, and description, not the user's own personal skills.

## API

Authenticated endpoints expect `Authorization: Bearer <supabase_access_token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Public health check |
| GET | `/api/me` | Current authenticated user |
| GET | `/api/applications` | List latest 500, optional query `q`, `status`, `platform` |
| POST | `/api/applications` | Create application |
| PATCH | `/api/applications/:id` | Update fields |
| DELETE | `/api/applications/:id` | Remove application |
| POST | `/api/recommend-resume` | Suggest resume |
| GET | `/api/resumes` | List resume metadata |
| POST | `/api/resumes` | multipart form: `name`, `file` |
| GET | `/api/resumes/:id/url` | One-minute private signed download link |
| DELETE | `/api/resumes/:id` | Remove resume metadata and file |

Example request after logging in and obtaining a valid access token:

```bash
curl -X POST http://localhost:4000/api/applications \
  -H "Authorization: Bearer YOUR_USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"company":"Compyl","job_title":"Software Engineer","platform":"Ashby","remote_type":"Remote","technologies":["C#","Blazor"]}'
```

## Connecting the existing Chrome extension

The existing v2.5.4 extension still uses its previous storage/backend. This ZIP is a separate web app; **integration requires modifying the extension**. Read `docs/extension-integration.txt` for the data contract and security design. Browser CORS currently allows the configured web client origin. Extension origin should only be added deliberately after designing extension authentication. Do not paste a long-lived token or service-role key in the extension source.

## Testing

```bash
npm test
npm run build
```

These check resume selection and production frontend compilation. Tests **do not** cover a live Supabase project, account signup, or real extension synchronization; test those manually after configuring the database.

## Production deployment

- Deploy the frontend to a static HTTPS host; set its `VITE_API_URL` to your HTTPS API endpoint.
- Deploy the Node server to a Node-compatible HTTPS host. Set `CLIENT_ORIGIN` to the exact frontend origin and configure `SUPABASE_URL`/`SUPABASE_ANON_KEY`.
- Set the Supabase Authentication site URL / redirect URLs to your production frontend domain.
- Use separate dev and production Supabase projects. Enable appropriate email verification, backups, abuse limits, and monitoring before public launch.
- `GET /api/applications` currently limits responses to 500 rows; implement pagination when the dataset grows.

## Troubleshooting

- **Blank screen:** Check `client/.env` and frontend browser console; restart Vite after editing environment variables.
- **401:** Sign in again. Make sure browser and API use the same Supabase project.
- **RLS / missing table:** Execute the full SQL migration in the correct project.
- **CORS error:** Match `CLIENT_ORIGIN` on the API with the exact browser origin.
- **Resume upload error:** Ensure SQL created the private `resumes` bucket/policies; upload PDF/DOCX under 10 MB.
- **No confirmation email:** Check Supabase Auth settings, mail provider limits, and spam folder.

The dashboard screenshots previously shared were design mockups; this project implements a functioning, independently runnable React interface with server/database integration once you supply Supabase configuration.


## v1.4.0 — Multiple applicant profiles

**Important:** Run `supabase/migrations/005_multiple_applicant_profiles.sql` after migration 004, having first backed up your database. The original account profile remains the default and retains its UUID. No existing profiles, applications, or resumes are deliberately deleted.

### How to use

1. Sign in and open **My Profiles** in the sidebar.
2. Click **Add profile**; enter a profile label (for example, `Contract Applications`), full name, application email, phone, date of birth, address, location and other fields; save.
3. Click **Edit** to update any saved profile. **Make default** chooses the profile used by new applications when the caller does not explicitly specify one.
4. When adding or editing an application, choose the **Applicant profile** from its dropdown. Linked resumes must belong to that same profile.
5. In **Resumes**, choose an applicant profile before uploading a PDF or DOCX. The eight approved resume names are available separately to each profile.
6. Profiles with linked applications/resumes cannot be deleted. Reassign or delete those records first. The current default profile cannot be deleted until a different default is chosen.

### New authenticated Node routes

- `GET /api/profiles` — list your applicant profiles
- `POST /api/profiles` — create a new applicant profile
- `PATCH /api/profiles/:id` — edit a profile owned by you
- `POST /api/profiles/:id/default` — choose your default profile
- `DELETE /api/profiles/:id` — delete unreferenced, non-default profiles

`applications.profile_id` and `resumes.profile_id` reference a profile in the same account. `users.profiles_id` stores your default profile. `auth.users` and `public.users` remain the sign-in identity (not separate accounts per applicant profile). All profile rows are protected by ownership-based RLS. Never store passwords in `public.profiles`.

**Upgrade notes:** For a fresh installation, run migrations 001–005 in order. For existing v1.3, run only 005. Older clients using `GET /api/me` still receive their original account profile. Live Supabase verification requires your own environment.
