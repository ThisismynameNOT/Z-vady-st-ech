# Roofing CMS + Cloudflare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the approved static roofing website into a client-editable Astro + TinaCMS platform with Cloudinary media and Cloudflare Workers hosting while preserving the approved frontend.

**Architecture:** Keep the visual system and routes recognizable, move public content into Git-backed JSON collections, expose only controlled Tina block templates, store production media in Cloudinary through an authenticated Worker API, and deliver enquiries through a rate-limited Worker endpoint. GitHub remains source/history; Cloudflare becomes production.

**Tech Stack:** Astro 7, TypeScript, TinaCMS 3, @tinacms/astro, Cloudflare Workers/Wrangler, Cloudinary HTTP APIs, Resend.

**Spec:** `docs/superpowers/specs/2026-08-29-roofing-cms-cloudflare-design.md` and `MASTER_BUILD_PROMPT_ROOFING_CMS_CLOUDFLARE.txt`.

## Global Constraints
- Preserve the approved frontend; no generic CMS/theme redesign.
- No unsupported business claims.
- Client edits content, not arbitrary HTML/CSS/JS.
- Production host is Cloudflare Workers, not GitHub Pages.
- Secrets never enter Git or browser code.

### Task 1: Astro foundation and route preservation
- [ ] Add Astro/Cloudflare/Tina dependencies and strict TypeScript.
- [ ] Add clean Czech routes plus redirects from legacy `.html` URLs.
- [ ] Preserve assets, typography, visual tokens, navigation and responsive behavior.
- [ ] Verify `astro check` and build.

### Task 2: Structured content and block architecture
- [ ] Create Git-backed pages, projects, services, references and global settings.
- [ ] Render pages through controlled predefined block types.
- [ ] Ensure phone/email/company data come from one global settings document.
- [ ] Verify public-contract counts are not presented as unique project counts.

### Task 3: TinaCMS client editing
- [ ] Define Czech-labelled Tina schemas.
- [ ] Enable project creation, status, galleries, before/after, featured ordering and SEO.
- [ ] Enable page section add/remove/reorder without arbitrary styling.
- [ ] Build `/admin` and verify local schema generation.

### Task 4: Cloudinary media
- [ ] Add custom Tina MediaStore using the authenticated Tina client.
- [ ] Add Cloudflare-compatible list/upload/delete API limited to one Cloudinary folder.
- [ ] Validate file type/size and never expose Cloudinary secrets.

### Task 5: Enquiry Worker API
- [ ] Preserve three-step form UX.
- [ ] Add honeypot, timing checks, server validation and Cloudflare rate-limiter binding.
- [ ] Deliver through Resend with configurable recipient and safe reply-to.
- [ ] Add success/error/retry states and same-origin protection.

### Task 6: SEO, accessibility and operations
- [ ] Add canonical/OG/schema metadata, sitemap, robots and 404.
- [ ] Preserve skip link, focus states, reduced motion and keyboard menu behavior.
- [ ] Add security headers/deployment config and document staging/domain/rollback.

### Task 7: CI and handoff
- [ ] Add tests for content integrity, CMS safety, routes, secrets and factual discipline.
- [ ] Add GitHub Actions validation and gated Cloudflare deployment.
- [ ] Write README, CLIENT-GUIDE.md, ARCHITECTURE.md, OPERATIONS.md.
- [ ] Run final verification before merge.
