# Závady střech Praha — production CMS platform

Astro + TinaCMS + GitHub + Cloudinary + Cloudflare Workers implementation of the approved roofing website. The public visual identity is intentionally preserved; editability lives behind the design.

## Development
```bash
npm install
npm run dev
```
Open `http://localhost:4321/` and Tina at `http://localhost:4321/admin/`.

## Production build
With TinaCloud credentials configured:
```bash
npm run build
```
For CI/offline schema validation:
```bash
npm run build:local
```

## CMS
Tina is available at `/admin/`. The editor exposes Czech-labelled collections for Stránky, Realizace, Služby, Reference, Firma and web settings. Customers never need to edit code or GitHub files manually. `tina/tina-lock.json` is committed so TinaCloud can index the schema, and `tina/config.ts` recognizes Cloudflare Workers' `WORKERS_CI_BRANCH`.

## Environment variables
Copy `.env.example` for local development. Public/build values include `PUBLIC_TINA_CLIENT_ID`, `PUBLIC_CLOUDINARY_CLOUD_NAME` and optional `PUBLIC_TURNSTILE_SITE_KEY`. Application/runtime secrets include `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, `FORM_RECIPIENT_EMAIL`, `FORM_FROM_EMAIL` and optional `TURNSTILE_SECRET_KEY`. `TINA_TOKEN` is a build secret. `SITE_URL` is optional until a real Worker/custom-domain URL exists; the runtime falls back to the active request origin.

## Validation
The permanent CI gate runs dependency installation, a high-severity production dependency audit, behavioral/security tests, the content audit, Cloudflare/Astro type generation, and a full local Tina + Astro Worker build.

## Deployment
The production target is **Cloudflare Workers**, not Cloudflare Pages. `wrangler.jsonc` contains the Worker entrypoint, static assets, observability and the form rate-limit binding.

The active production path is Cloudflare Workers Git Builds connected to this repository on `main`:

- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Root directory: repository root
- No Pages build-output directory is used

`npm run deploy` executes `scripts/deploy-cloudflare.mjs`, which passes the configured Cloudinary and Resend build secrets to Wrangler's Worker runtime without printing them or committing them to the repository.

The current `workers.dev` deployment remains the production QA origin until a client-owned custom domain is available. `SITE_URL` stays optional until that permanent origin exists.

`.github/workflows/deploy-cloudflare.yml` remains an optional GitHub Actions deployment path. It is disabled unless `CLOUDFLARE_DEPLOY_ENABLED=true` is explicitly set, to prevent competing/double deployments while Cloudflare Git Builds are used.

## Content editing
- Add/edit/archive projects in **Realizace**.
- Upload/select project imagery through the Cloudinary-backed media manager.
- Reorder controlled page sections in **Stránky**.
- Change phone/email/address once in **Nastavení firmy**.
- Edit SEO fields on pages/projects.

See `CLIENT-GUIDE.md`, `ARCHITECTURE.md`, `OPERATIONS.md`, and `docs/production-activation-checklist.md` for activation, rollback and client handoff.
