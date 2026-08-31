# Production activation checklist

This checklist tracks the final activation phase for the Astro + TinaCMS + Cloudflare Workers site. The current production QA origin is `https://zavady-strech-praha.iadamt-93.workers.dev`. No client-owned custom domain is available yet.

## TinaCloud

- [x] TinaCloud project connected to `ThisismynameNOT/Z-vady-st-ech` / `main`
- [x] `tina/tina-lock.json` generated and committed for schema indexing
- [x] Tina config supports Cloudflare Workers `WORKERS_CI_BRANCH`
- [x] `PUBLIC_TINA_CLIENT_ID` configured in the Workers build environment
- [x] `TINA_TOKEN` configured as a secret in the Workers build environment
- [x] First real `workers.dev` origin added to TinaCloud Site URLs
- [x] `/admin/` login verified on the Worker deployment
- [ ] One safe homepage edit/save/restore verified through TinaCloud

## Cloudflare Workers

- [x] Workers Git Build connected to `main` (not Pages)
- [x] Build command is `npm run build`
- [x] Deploy command is `npm run deploy`
- [x] Controlled first Worker deployment succeeds
- [x] Exact `workers.dev` URL recorded
- [x] Public routes and `/admin/` verified on that URL
- [x] Runtime variables/secrets configured as needed
- [x] Optional GitHub Actions deploy remains disabled unless intentionally selected

## Cloudinary

- [x] `PUBLIC_CLOUDINARY_CLOUD_NAME` configured
- [x] `CLOUDINARY_API_KEY` configured as a Worker secret
- [x] `CLOUDINARY_API_SECRET` configured as a Worker secret
- [x] Tina media list/upload/select/delete verified

## Enquiry delivery

- [ ] Branded/domain sender verification — blocked until a client production domain exists
- [x] `RESEND_API_KEY` configured
- [x] `FORM_RECIPIENT_EMAIL` configured
- [x] `FORM_FROM_EMAIL` configured
- [x] One real enquiry delivered successfully
- [x] Reply-To verified against the visitor e-mail entered in the form

## Acceptance QA

- [ ] Mobile 320 / 375 / 390 / 430 px final acceptance
- [ ] Tablet, laptop and desktop final acceptance
- [ ] Inter and Cormorant fonts render from `/assets/fonts/`
- [ ] Navigation, drawer and mobile CTA final acceptance
- [ ] Legacy `.html` redirects verified on the deployed Worker
- [x] CMS create/delete test project
- [ ] Homepage edit/restore
- [ ] Add/reorder/remove a page section
- [ ] Global contact edit/restore
- [ ] Lighthouse/performance/accessibility pass recorded

## Optional future custom domain

- [ ] Domain is actually purchased/owned — client confirmed none exists yet
- [ ] Domain connected to Worker with HTTPS
- [ ] Verified domain added to TinaCloud Site URLs
- [ ] `SITE_URL` set to the verified canonical origin
- [ ] Redirect/canonical behavior verified

## Client data still pending

- [ ] Replace `pehlo@seznam.cz` after a branded mailbox is created and tested — none exists yet
- [ ] Add genuine project photography after ownership/project association is confirmed — none supplied yet
- [ ] Add warranty/insurance/team/qualification claims only after they are verified
