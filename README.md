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
Tina is available at `/admin/`. The editor exposes Czech-labelled collections for Stránky, Realizace, Služby, Reference, Firma and web settings. Customers never need to edit code or GitHub files manually.

## Environment variables
Copy `.env.example` for local development. Public/build values include `PUBLIC_TINA_CLIENT_ID`, `PUBLIC_CLOUDINARY_CLOUD_NAME` and optional `PUBLIC_TURNSTILE_SITE_KEY`. Application/runtime secrets include `TINA_TOKEN`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, `FORM_RECIPIENT_EMAIL`, `FORM_FROM_EMAIL` and optional `TURNSTILE_SECRET_KEY`. `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are deployment credentials only; never expose them to the Worker or browser.

## Validation
The permanent CI gate runs dependency installation, a high-severity production dependency audit, behavioral/security tests, the content audit, Cloudflare/Astro type generation, and a full local Tina + Astro Worker build.

## Deployment
Production target is Cloudflare Workers. `wrangler.jsonc` contains the Worker configuration and rate limiter. `Deploy Cloudflare Production` runs only after a successful `main` CI run and is additionally gated by the repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`. Keep that variable unset/false until TinaCloud, Cloudinary, Resend, Cloudflare runtime bindings and the first controlled deployment are verified. GitHub Pages is not part of the production architecture.

## Content editing
- Add/edit/archive projects in **Realizace**.
- Upload/select project imagery through the Cloudinary-backed media manager.
- Reorder controlled page sections in **Stránky**.
- Change phone/email/address once in **Nastavení firmy**.
- Edit SEO fields on pages/projects.

See `CLIENT-GUIDE.md`, `ARCHITECTURE.md`, and `OPERATIONS.md` for the deployment checklist, runtime secret split, rollback and client handoff.
