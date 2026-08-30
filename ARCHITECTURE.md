# Architecture

## Frontend
Astro 7 renders the approved Heritage/contractor UI. `src/styles/site.css` preserves the existing visual system; components only reorganize markup into reusable boundaries. Public pages ship minimal JavaScript (`public/scripts/site.js`) for navigation, reveal effects and the three-step form.

## Content
`content/pages`, `content/projects`, `content/services`, `content/references`, and `content/settings` are Git-backed structured JSON. `src/lib/content.ts` is the read layer. Global contact/company data is never duplicated intentionally.

## TinaCMS
`tina/config.ts` defines Czech-labelled collections and controlled page-block templates. The page builder controls content and approved layout combinations only. TinaCloud authentication is required in production. `tina/tina-lock.json` is committed for TinaCloud schema indexing, and branch resolution includes Cloudflare Workers' `WORKERS_CI_BRANCH`.

## Cloudinary
`tina/media/cloudinary-store.ts` implements Tina's MediaStore interface. It uses the Tina auth provider so requests to `/api/cloudinary/media` carry the editor token. The Worker endpoint verifies the Tina user, scopes all mutations to `CLOUDINARY_FOLDER`, signs Cloudinary upload/delete requests server-side and accepts images only. Cloudinary secrets never enter browser bundles.

## Forms
`/api/enquiry` validates the three-step enquiry payload, checks a honeypot and minimum interaction time, applies the Cloudflare `FORM_RATE_LIMITER`, enforces same-origin requests and sends mail through Resend. When no permanent `SITE_URL` is configured, the endpoint validates against the active Worker request origin. No SMTP credentials exist in frontend JavaScript.

## URLs and SEO
No custom domain is assumed. Canonical URLs, sitemap and robots output use `SITE_URL` when a verified permanent origin is configured and otherwise derive the active request origin. This allows the first real `workers.dev` deployment to be tested without publishing a fabricated domain.

## Cloudflare Workers
`@astrojs/cloudflare` targets Workers. `wrangler.jsonc` enables static assets, observability and a native rate-limit binding. Astro sessions are explicitly disabled because the application does not use them, avoiding an unnecessary KV session binding. Runtime secrets are stored in Cloudflare rather than source control.

## Git flow and deployment
GitHub is the source of truth and content history. Feature/preview work happens on branches; production content/builds target `main` after CI. The preferred activation path is Cloudflare Workers Git Builds using `npm run build` followed by `npx wrangler deploy`. Cloudflare Pages is not a supported production path. The GitHub Actions Worker deploy workflow is an intentionally disabled fallback to avoid double deployments.
