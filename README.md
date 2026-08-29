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
Copy `.env.example`. Public values: `PUBLIC_TINA_CLIENT_ID`, `PUBLIC_CLOUDINARY_CLOUD_NAME`, optional `PUBLIC_TURNSTILE_SITE_KEY`. Server-only secrets: `TINA_TOKEN`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, `FORM_RECIPIENT_EMAIL`, `FORM_FROM_EMAIL`, optional `TURNSTILE_SECRET_KEY`.

## Deployment
Production target is Cloudflare Workers. `wrangler.jsonc` contains the Worker configuration and rate limiter. The deploy workflow is gated until Cloudflare/Tina/Cloudinary/email credentials are stored as repository/Cloudflare secrets. GitHub Pages is not part of the target architecture.

## Content editing
- Add/edit/archive projects in **Realizace**.
- Upload/select project imagery through the Cloudinary-backed media manager.
- Reorder controlled page sections in **Stránky**.
- Change phone/email/address once in **Nastavení firmy**.
- Edit SEO fields on pages/projects.

See `CLIENT-GUIDE.md`, `ARCHITECTURE.md`, and `OPERATIONS.md`.
