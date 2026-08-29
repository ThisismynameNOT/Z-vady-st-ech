# Operations

## Deployments
1. Tina saves content to Git-backed files.
2. GitHub CI validates tests, types and the Astro/Tina build.
3. The gated Cloudflare workflow runs `wrangler deploy` from `main`.
4. Cloudflare serves the Worker and static assets globally.

## Rollback
Revert the bad Git commit or redeploy a known-good commit. Structured content is recoverable from Git history. Cloudflare Worker versions can also be rolled back in Cloudflare.

## If TinaCloud is unavailable
The public website keeps serving the last deployed build. Editing is temporarily unavailable; do not bypass Tina by hand-editing production content unless performing a controlled developer recovery.

## If Cloudinary is unavailable
Existing Cloudinary URLs may temporarily fail, but content remains in Git. Do not delete/re-upload assets during the incident. New media uploads wait until Cloudinary recovers.

## Secret rotation
Rotate Tina tokens in TinaCloud, Cloudinary API credentials in Cloudinary, Resend keys in Resend, and Cloudflare tokens in Cloudflare. Update encrypted repository/Worker secrets; never commit them.

## Failed builds
Read GitHub Actions logs, reproduce with `npm run validate`, fix on a branch and rerun. Do not bypass build/type/content checks for production.

## Restore content
Use Git history to restore the last good JSON document. For media, restore/reselect the Cloudinary asset; Git records the URL and metadata but not the binary itself.

## Transfer ownership
Transfer the GitHub repo, TinaCloud project, Cloudinary account/folder, Cloudflare Worker/domain and Resend account. Rotate all tokens after transfer.

## Domain cutover
Choose `https://zavadystrech.cz` as canonical and redirect `www` to it (or reverse if the client requires). Set `SITE_URL`, Tina allowed origins, DNS/custom domain in Cloudflare, Cloudinary configuration if needed, and form origins. Retire the GitHub Pages copy or keep it `noindex`/redirected to avoid duplicate indexing.
