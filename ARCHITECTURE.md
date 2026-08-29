# Architecture

## Frontend
Astro 7 renders the approved Heritage/contractor UI. `src/styles/site.css` preserves the existing visual system; components only reorganize markup into reusable boundaries. Public pages ship minimal JavaScript (`public/scripts/site.js`) for navigation, reveal effects and the three-step form.

## Content
`content/pages`, `content/projects`, `content/services`, `content/references`, and `content/settings` are Git-backed structured JSON. `src/lib/content.ts` is the read layer. Global contact/company data is never duplicated intentionally.

## TinaCMS
`tina/config.ts` defines Czech-labelled collections and controlled page-block templates. The page builder controls content and approved layout combinations only. TinaCloud authentication is required in production.

## Cloudinary
`tina/media/cloudinary-store.ts` implements Tina's MediaStore interface. It uses the Tina auth provider so requests to `/api/cloudinary/media` carry the editor token. The Worker endpoint verifies the Tina user, scopes all mutations to `CLOUDINARY_FOLDER`, signs Cloudinary upload/delete requests server-side and accepts images only. Cloudinary secrets never enter browser bundles.

## Forms
`/api/enquiry` validates the three-step enquiry payload, checks a honeypot and minimum interaction time, applies the Cloudflare `FORM_RATE_LIMITER`, enforces same-origin requests and sends mail through Resend. No SMTP credentials exist in frontend JavaScript.

## Cloudflare Workers
`@astrojs/cloudflare` targets Workers. `wrangler.jsonc` enables static assets, observability and a native rate-limit binding. Runtime secrets are added with Wrangler/Cloudflare secret storage.

## Git flow
GitHub is the source of truth and content history. Feature/preview work happens on branches; production deploys are gated and should run from `main` only after CI. GitHub Pages is legacy staging only and should be retired when the custom domain is cut over.
