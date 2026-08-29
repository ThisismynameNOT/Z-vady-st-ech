# Operations

## Deployments
1. Tina saves content to Git-backed files.
2. GitHub **CMS Platform CI** validates production dependencies, tests, content/security audit, types and the Astro/Tina build.
3. After a successful CI run on `main`, **Deploy Cloudflare Production** may run `wrangler deploy`.
4. Cloudflare serves the Worker and static assets globally.

Production deployment is intentionally disabled until the external services are configured. Set the GitHub repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` only after the credentials and Worker runtime bindings below are ready. A manual `workflow_dispatch` can be used for a controlled first deployment.

## GitHub Actions deployment secrets
Configure these in GitHub Actions for the production workflow:

- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account containing the Worker.
- `CLOUDFLARE_API_TOKEN` — narrowly scoped Worker deployment token.
- `PUBLIC_TINA_CLIENT_ID` — TinaCloud client ID used while building `/admin/`.
- `TINA_TOKEN` — TinaCloud build token.
- `PUBLIC_CLOUDINARY_CLOUD_NAME` — Cloudinary cloud name if production content/media needs it during the build.
- `PUBLIC_TURNSTILE_SITE_KEY` — optional if Turnstile is enabled later.

Do not store Cloudflare, Tina, Cloudinary or mail credentials in repository files.

## Cloudflare Worker runtime bindings
Before enabling automatic deploys, configure the Worker runtime values in Cloudflare secret/variable storage:

- `PUBLIC_TINA_CLIENT_ID` — required by the authenticated Cloudinary media API.
- `PUBLIC_CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `RESEND_API_KEY`
- `FORM_RECIPIENT_EMAIL`
- `FORM_FROM_EMAIL`
- `TURNSTILE_SECRET_KEY` only if Turnstile is enabled.

`SITE_URL=https://zavadystrech.cz` and `CLOUDINARY_FOLDER=zavady-strech` are versioned non-secret Worker variables in `wrangler.jsonc`.

## First production deployment
1. Configure TinaCloud and verify the repository/branch connection.
2. Configure Cloudinary and the Worker runtime media values.
3. Configure Resend and verify the sender/domain used by `FORM_FROM_EMAIL`.
4. Configure the Cloudflare account ID/API token in GitHub Actions.
5. Perform one controlled manual deployment and verify the `workers.dev`/staging URL.
6. Test `/admin/`, project editing, image upload/delete and one real form delivery in the controlled environment.
7. Connect the production domain and HTTPS in Cloudflare.
8. Set `CLOUDFLARE_DEPLOY_ENABLED=true` only after the preceding checks pass.

## Rollback
Revert the bad Git commit or redeploy a known-good commit. Structured content is recoverable from Git history. Cloudflare Worker versions can also be rolled back in Cloudflare.

## If TinaCloud is unavailable
The public website keeps serving the last deployed build. Editing is temporarily unavailable; do not bypass Tina by hand-editing production content unless performing a controlled developer recovery.

## If Cloudinary is unavailable
Existing Cloudinary URLs may temporarily fail, but content remains in Git. Do not delete/re-upload assets during the incident. New media uploads wait until Cloudinary recovers.

## Secret rotation
Rotate Tina tokens in TinaCloud, Cloudinary API credentials in Cloudinary, Resend keys in Resend, and Cloudflare tokens in Cloudflare. Update encrypted repository/Worker secrets; never commit them.

## Failed builds
Read GitHub Actions logs, reproduce with `npm run validate`, fix on a branch and rerun. CI also runs `npm audit --omit=dev --audit-level=high`; do not bypass a high/critical production dependency finding without a documented security decision.

## Restore content
Use Git history to restore the last good JSON document. For media, restore/reselect the Cloudinary asset; Git records the URL and metadata but not the binary itself.

## Transfer ownership
Transfer the GitHub repo, TinaCloud project, Cloudinary account/folder, Cloudflare Worker/domain and Resend account. Rotate all tokens after transfer.

## Domain cutover
Choose `https://zavadystrech.cz` as canonical and redirect `www` to it (or reverse if the client requires). Set `SITE_URL`, Tina allowed origins, DNS/custom domain in Cloudflare, Cloudinary configuration if needed, and form origins. GitHub Pages is not the production host and should remain retired to avoid duplicate indexing.
