# Operations

## Deployment model
GitHub is the source of truth for code and structured content. TinaCloud provides authenticated editing. Cloudflare Workers is the runtime target. Cloudflare Pages is not part of the production architecture.

For the current activation, use **Cloudflare Workers Git Builds** connected to `ThisismynameNOT/Z-vady-st-ech` on `main`:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: repository root
- Build output directory: not applicable (that is a Pages setting)

The repository also contains `.github/workflows/deploy-cloudflare.yml` as an optional fallback deployment path. It stays disabled unless `CLOUDFLARE_DEPLOY_ENABLED=true` is deliberately set, so Cloudflare Git Builds and GitHub Actions cannot accidentally compete.

## TinaCloud build configuration
The production Tina build requires:

- `PUBLIC_TINA_CLIENT_ID` — TinaCloud project client ID.
- `TINA_TOKEN` — TinaCloud content/build token; keep secret.

`tina/tina-lock.json` is committed for TinaCloud schema indexing. `tina/config.ts` reads `WORKERS_CI_BRANCH` so Cloudflare Workers builds target the correct Git branch.

Until a real deployed URL exists, TinaCloud only needs the local origin `http://localhost:4321`. After the first Worker deployment succeeds, add the exact `https://<worker>.<account>.workers.dev` origin to TinaCloud Site URLs.

## Cloudflare Worker runtime values
Before media/form acceptance testing, configure these in Cloudflare Worker Variables and Secrets:

- `PUBLIC_TINA_CLIENT_ID` — needed by the authenticated Cloudinary media API.
- `PUBLIC_CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER` is versioned as `zavady-strech` in `wrangler.jsonc`.
- `RESEND_API_KEY`
- `FORM_RECIPIENT_EMAIL`
- `FORM_FROM_EMAIL`
- `TURNSTILE_SECRET_KEY` only if Turnstile is enabled.

`SITE_URL` is optional. Before a stable domain is known, canonical URLs, sitemap/robots output, and form-origin validation fall back to the active Worker request origin. Once a permanent custom domain is actually owned and connected, `SITE_URL` may be set to that verified origin.

## GitHub Actions fallback deployment secrets
Only needed if the optional GitHub deployment workflow is intentionally enabled:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `PUBLIC_TINA_CLIENT_ID`
- `TINA_TOKEN`
- optional public build values such as `PUBLIC_CLOUDINARY_CLOUD_NAME`

Do not store Cloudflare, Tina, Cloudinary or mail credentials in repository files.

## First controlled deployment
1. Confirm TinaCloud is connected to this repository and `main`.
2. Configure `PUBLIC_TINA_CLIENT_ID` and secret `TINA_TOKEN` in the Cloudflare Workers build environment.
3. Create/import the app through **Workers Git Builds**, not Pages.
4. Deploy and record the real `workers.dev` URL.
5. Add that exact origin to TinaCloud Site URLs.
6. Verify the public routes and `/admin/` login.
7. Configure Cloudinary runtime credentials and test media list/upload/select/delete.
8. Configure Resend and perform one real enquiry delivery test.
9. Run responsive/visual/accessibility acceptance QA.
10. Only if a custom domain is actually purchased/owned later, connect it in Cloudflare, set the canonical `SITE_URL`, add it to TinaCloud, and verify HTTPS/redirect behavior.

## Rollback
Revert the bad Git commit or redeploy a known-good Worker version. Structured content is recoverable from Git history. Cloudflare Worker versions can also be rolled back in Cloudflare.

## If TinaCloud is unavailable
The public website keeps serving the last deployed build. Editing is temporarily unavailable; do not bypass Tina by hand-editing production content unless performing a controlled developer recovery.

## If Cloudinary is unavailable
Existing Cloudinary URLs may temporarily fail, but content remains in Git. Do not delete/re-upload assets during the incident. New media uploads wait until Cloudinary recovers.

## Secret rotation
Rotate Tina tokens in TinaCloud, Cloudinary API credentials in Cloudinary, Resend keys in Resend, and Cloudflare tokens in Cloudflare. Update encrypted build/runtime secrets; never commit them.

## Failed builds
Read the Cloudflare/GitHub build logs, reproduce with `npm run validate`, fix on a branch and rerun. GitHub CI also runs `npm audit --omit=dev --audit-level=high`; do not bypass a high/critical production dependency finding without a documented security decision.

## Restore content
Use Git history to restore the last good JSON document. For media, restore/reselect the Cloudinary asset; Git records the URL and metadata but not the binary itself.

## Transfer ownership
Transfer the GitHub repo, TinaCloud project, Cloudinary account/folder, Cloudflare Worker and Resend account. Transfer any future custom domain separately if one is acquired. Rotate all tokens after transfer.
