# Medicycle

A medical-equipment acquisition app with a seller portal, restricted staff workspace, Supabase authentication/database/private storage, and WhatsApp contact.

## Run locally

Requires Node.js 22 or newer and Python 3 for the preview server.

```sh
npm ci
npm run build
npm run preview
```

Open http://localhost:4173. Edit `src/app.js` and `src/backend.js`, then rebuild. `dist/app.js` is generated, not the source of truth.

## Supabase setup — required before accepting enquiries

Project: `pdharysamdzcxxcjvlcm`. Only its browser-safe publishable configuration is in `config/supabase.public.json`. No service-role key or database password is used.

1. Open the project's **SQL Editor → New query**. Run `supabase/migrations/001_medicycle.sql` once. It creates the application tables, authorization rules, validated mutation functions and private `mc-documents` bucket.
2. Run `supabase/migrations/002_preserve_accepted_offers.sql`. If you already ran migration 001, do not run it again; proceed with 002.
3. Under **Authentication → URL Configuration**, set the Site URL to `https://medicycle-rho.vercel.app` and add `https://medicycle-rho.vercel.app/` to allowed redirect URLs. For local testing, add `http://localhost:4173/`.
4. Enable email/password sign-in and new signups in Authentication. Turn **Confirm email OFF** in the Authentication email/signup settings to allow immediate signup without verification. This is a dashboard setting; the public app key cannot change it. You can turn it back on later; the app handles confirmation-required responses. Configure a production SMTP provider for forgotten-password emails and keep the standard reset-password email template. Open reset links in the same browser that requested them (PKCE). Existing magic-link users can use Forgot password to set their first password.
5. Sign in through the app with your intended staff email. In the SQL Editor, replace the placeholder below with that email and run:

```sql
insert into public.mc_staff_members (user_id)
select id from auth.users where lower(email) = lower('YOUR_STAFF_EMAIL')
on conflict (user_id) do nothing;
```

Confirm that one matching user exists, then sign out and in again to see the Staff workspace. Customers cannot grant themselves staff access. To remove access, delete only that user's row from `mc_staff_members` in the SQL Editor.

## Deployment on Vercel

The root `vercel.json` runs `npm ci` and `npm run build`, then serves `dist`. The connected GitHub `main` branch triggers deployment.

The checked-in publishable configuration is sufficient for this project. To override it, set either `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel. For local overrides, copy `.env.example` to `.env`. Rebuild after changing configuration. Never place a Supabase secret/service-role key in public configuration; the build rejects these keys.

## Features

- Floating WhatsApp panel and contextual contact links to **+91 76768 88427**. Links open a draft in WhatsApp; they never send messages automatically.
- Name/email/password signup, password sign-in, forgotten-password recovery, persistent sessions and sign-out. Names are stored in Supabase Auth user metadata; passwords are managed only by Supabase Auth.
- Server-persisted seller requests, multiple equipment types, saved device categories and buying enquiries.
- Private documents and photos using short-lived signed download URLs.
- Seller technical updates, chronological stage history, written offers and explicit acceptance confirmation.
- Staff-only assessments, internal cost estimates, collection arrangements and disposition records.
- Request ownership enforced by Postgres row-level security; staff costs/notes stored separately.
- Version checks prevent stale edits or acceptance of changed offers. Accepted offer terms are immutable, including when put on hold.
- Idempotent intake and buying enquiry creation, validated server-side input and basic per-account enquiry limits.
- Four illustrative exploded device categories; no fictional live stock or automatic certification claims.

## Validation

```sh
npm test
npm run build
```

Database tests run against embedded PostgreSQL (PGlite) with Supabase auth/storage schema fixtures. They cover owner isolation, staff restrictions, anonymous access denial, offer rules, storage ownership, idempotency and validation. They do not substitute for testing the actual Supabase Auth email delivery or Storage service.

Before opening to customers, run an end-to-end check with two customer accounts and a staff account: sign in, submit a request, upload/download an attachment, confirm the other customer cannot see it, issue/accept an offer and sign out. Apply both migrations first.

## Operating boundaries

- No payments, automatic email notifications of enquiries, shipping integrations or live stock management are implemented. Staff check the acquisition queue and contact customers via the provided contact details/WhatsApp.
- The workspace currently loads the newest 200 requests and buying enquiries. Larger operations will need pagination/search across older records.
- Files are private but are not malware-scanned. Supported formats are constrained to images, PDF, CSV and XLSX; never upload patient information.
- Equipment acceptance, inspection, collection coverage, sale terms and refurbishment suitability are handled by the business. Illustrations are not manufacturer service diagrams.
- Medicycle remains the working brand and is not affiliated with the Australian reference business.
