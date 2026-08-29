# Roofing CMS + Cloudflare Migration Design

## Status

Approved architectural direction derived from `MASTER_BUILD_PROMPT_ROOFING_CMS_CLOUDFLARE.txt` supplied by the project owner on 2026-08-29.

## Goal

Convert the approved static Czech roofing website into a production-grade, client-editable platform without redesigning it. The public frontend must retain the current typography, spacing, color system, imagery treatment, navigation behavior, responsive composition, hover states, reveal motion, credibility-first copy, project presentation, and multi-step enquiry UX as closely as technically possible.

## Baseline

The preserved static source lives under `.conversion-src/` and currently contains:

- `index.html`
- `firma.html`
- `sluzby.html`
- `realizace.html`
- `reference.html`
- `kontakt.html`
- `ochrana-osobnich-udaju.html`
- `styles.css`, `styles-base.css`, `styles-components.css`, `styles-responsive.css`
- `site.js`

The existing code already contains the approved visual tokens, desktop/mobile navigation, responsive breakpoints, reveal effects, project/reference presentation, and three-step enquiry form. It is the visual regression reference throughout the migration.

## Chosen Architecture

### Public frontend

- Astro
- TypeScript where it improves safety
- Astro components rendered statically by default
- Minimal client JavaScript only for navigation, reveal/progress behavior, enquiry steps, galleries/before-after controls, and Tina visual editing where required
- Existing CSS values extracted into stable design tokens rather than replaced by a new design system

### Content management

- TinaCMS with Git-backed structured content
- Czech editor labels/help text
- Controlled block/page-section architecture
- No arbitrary HTML, CSS, JavaScript, colors, font-size controls, or unrestricted layout editing
- Git remains invisible to the normal client editing workflow

### Content storage

Use repository-managed structured content for:

- pages
- projects
- services
- references
- company settings
- site/navigation settings
- SEO settings

Editable public copy must not remain duplicated in Astro templates unless it is genuinely structural UI text.

### Media

- Cloudinary is the production media origin for project photography, galleries, before/after media, homepage imagery, and future client uploads
- Media fields carry URL/public-id plus alt text and optional caption/credit metadata
- Rendering generates responsive Cloudinary transformations with modern formats where supported
- Existing contextual imagery remains clearly distinguished from company-owned project photography

### Hosting and deployment

- Cloudflare Workers is the production target
- GitHub Pages is retained only as historical/baseline infrastructure during migration and is not the final host
- Cloudflare handles production routing, HTTPS, CDN/caching, headers, redirects, Worker endpoints, rate limiting, and secret storage where appropriate
- Target production host is `zavadystrech.cz` with one canonical hostname and a redirect from the alternate host
- A preview/staging path or hostname is required before production cutover

### Forms

The existing three-step enquiry UX is preserved visually and behaviorally, but the Wix browser-side submission dependency is removed from the final architecture.

Final flow:

`browser -> Cloudflare Worker/API endpoint -> server-side validation/spam controls -> transactional email/provider`

The Worker owns validation, honeypot/rate limiting, input sanitization, configurable recipient, and delivery errors. No SMTP/provider secret appears in public JavaScript.

## Route Mapping

Preserve Czech route semantics while moving from `.html` files to clean Astro routes:

- `/` -> Home
- `/firma` -> Firma
- `/sluzby` -> Služby
- `/realizace` -> Realizace index
- `/realizace/[slug]` -> generated project detail
- `/reference` -> Reference
- `/kontakt` -> Kontakt
- `/ochrana-osobnich-udaju` -> privacy information

During cutover, redirect the legacy `.html` paths to the corresponding canonical route to avoid broken links and duplicate indexing.

## Component Boundaries

### Layout

- `src/layouts/BaseLayout.astro`
- `src/components/layout/Header.astro`
- `src/components/layout/Navigation.astro`
- `src/components/layout/MobileMenu.astro`
- `src/components/layout/Footer.astro`
- `src/components/layout/MobileCta.astro`

### Shared UI

- `Button.astro`
- `SectionHeading.astro`
- `ProjectCard.astro`
- `ServiceCard.astro`
- `RegistryLink.astro`
- `ResponsiveImage.astro`

### CMS-controlled sections

Implement a controlled renderer whose discriminated section types map to approved visual components. Initial section set:

- hero
- intro
- text
- textImage
- fullWidthImage
- trustBar
- services
- featuredProjects
- projectGrid
- gallery
- beforeAfter
- stats
- processSteps
- references
- testimonials
- faq
- registryLinks
- contactCta
- contactForm
- spacer

Not every page must expose every block. Page schemas may restrict available blocks so the editor cannot create visually invalid combinations.

## Core Content Models

### Project

Required minimum: title, slug, status, short description, full description, hero image, featured flag, homepage priority, verification status, SEO fields.

Optional structured fields include client/building/location/year/dates, contract value/currency, service relations, project/building types, gallery, before/after media, registry links, external links, timestamps.

Project status is constrained to `draft | published | archived`. Archived projects remain recoverable and are excluded from normal public listings.

### Service

Name, slug, short description, body, optional icon/hero image, related projects, featured flag, SEO fields.

### Reference

Separate lightweight reference entries are supported so a public-contract record does not have to become a full project.

### Company settings

Single source for company name/legal name, IČO/DIČ, phone(s), email, address, service area, opening hours, social/registry links, description and footer copy.

### Site settings

Site name/URL, default SEO, logo/favicon, navigation, footer navigation, primary CTA, analytics configuration, cookie configuration.

### Page

Title, slug, SEO fields and ordered `sections[]` using the controlled block union.

## Factual Integrity

The migration preserves the current distinction between projects, references, contracts and Registry of Contracts records. It must not turn the current public-record count into a completed-project claim. It must not invent testimonials, awards, certifications, warranties, insurance, team size, response times, years of experience, satisfaction metrics, or project facts.

Public copy that describes website/design strategy rather than customer value is rewritten during migration without changing factual substance.

## SEO

Every public page supports:

- title
- description
- canonical URL
- OG image
- no-index flag

The build generates clean canonical URLs, OpenGraph/social metadata, sitemap and robots output. Structured data is limited to facts actually supported by content/settings, such as Organization/LocalBusiness/Service/BreadcrumbList where valid.

## Accessibility

Preserve and test skip navigation, semantic landmarks, heading order, form labels, focus states, keyboard/mobile-menu behavior, alt text, contrast, and `prefers-reduced-motion` behavior. The existing drawer must be upgraded to reliable keyboard focus management rather than losing the current UX.

## Performance

- Static rendering by default
- No unnecessary React hydration on public pages
- Explicit image dimensions/aspect ratios to avoid CLS
- Cloudinary responsive formats and lazy loading below the fold
- Self-hosted or carefully managed typography
- Minimal third-party scripts
- Existing visual motion retained without expensive continuous animation work

## Security

- `.env.example` documents configuration
- `.gitignore` excludes local secrets/build state
- Tina, Cloudinary, Cloudflare and mail-provider secrets remain server-side
- Production headers include CSP only after required origins are known, plus content-type, referrer, permissions and frame protections as compatible
- HSTS enabled after production HTTPS/domain cutover is confirmed
- Form endpoint gets validation, rate limiting and bot controls with Turnstile only if needed

## Testing Strategy

### Baseline/regression

The current `.conversion-src` output is the visual reference. Compare migrated pages at desktop, tablet, and the specified mobile widths: 320, 375, 390 and 430 px.

### Automated

- Astro build
- TypeScript checking
- linting
- unit tests for content helpers/rendering decisions
- schema/content validation
- link/route checks
- form Worker tests
- production bundle secret scan

### CMS acceptance

Exercise the required temporary workflows: create/remove project, edit/restore homepage copy, add/reorder/remove a section, select/upload media, change/restore global contact data, and submit a test enquiry.

## Documentation Deliverables

- `README.md`
- `CLIENT-GUIDE.md` in plain Czech for the client
- `ARCHITECTURE.md`
- `OPERATIONS.md`
- `.env.example`

Documentation must cover development, CMS usage, content editing, deployment, rollback, staging, secrets, domain/DNS cutover, recovery and troubleshooting.

## Migration Sequence

1. Finish static audit and migration map.
2. Add Astro foundation and test harness.
3. Port the approved shell/CSS/behavior without CMS dependencies.
4. Componentize shared layout and sections.
5. Introduce content schemas and migrate all legitimate current content.
6. Generate CMS-managed projects and project detail routes.
7. Add controlled page-block rendering.
8. Integrate Cloudinary media fields/rendering.
9. Replace Wix form submission with Cloudflare Worker/API delivery.
10. Add SEO, structured data, accessibility and security hardening.
11. Configure Tina authentication/editing.
12. Configure Cloudflare Workers preview/production deployment.
13. Run CMS, responsive, visual-regression, security and performance QA.
14. Write operational/client/developer documentation.
15. Cut over the production domain only after acceptance checks pass.

## Non-Goals

- No aesthetic redesign
- No WordPress/Webflow/Elementor/Firebase replacement
- No generic construction template
- No unrestricted WYSIWYG layout editor
- No VPS
- No GitHub Pages production dependency
- No fake business claims
- No long-term repository storage of full-resolution client photo libraries
