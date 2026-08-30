# Production activation checklist

This checklist tracks the final activation phase for the Astro + TinaCMS + Cloudflare Workers site. No custom domain is currently assumed or required.

## TinaCloud

- [x] TinaCloud project connected to `ThisismynameNOT/Z-vady-st-ech` / `main`
- [x] `tina/tina-lock.json` generated and committed for schema indexing
- [x] Tina config supports Cloudflare Workers `WORKERS_CI_BRANCH`
- [ ] `PUBLIC_TINA_CLIENT_ID` configured in the Workers build environment
- [ ] `TINA_TOKEN` configured as a secret in the Workers build environment
- [ ] First real `workers.dev` origin added to TinaCloud Site URLs
- [ ] `/admin/` login verified on the Worker deployment
- [ ] One safe edit/save/restore verified through TinaCloud

## Cloudflare Workers

- [ ] Workers Git Build connected to `main` (not Pages)
- [ ] Build command is `npm run build`
- [ ] Deploy command is `npx wrangler deploy`
- [ ] Controlled first Worker deployment succeeds
- [ ] Exact `workers.dev` URL recorded
- [ ] Public routes and `/admin/` verified on that URL
- [ ] Runtime variables/secrets configured as needed
- [ ] Optional GitHub Actions deploy remains disabled unless intentionally selected

## Cloudinary

- [ ] `PUBLIC_CLOUDINARY_CLOUD_NAME` configured
- [ ] `CLOUDINARY_API_KEY` configured as a Worker secret
- [ ] `CLOUDINARY_API_SECRET` configured as a Worker secret
- [ ] Tina media list/upload/select/delete verified

## Enquiry delivery

- [ ] Resend sender verified
- [ ] `RESEND_API_KEY` configured
- [ ] `FORM_RECIPIENT_EMAIL` configured
- [ ] `FORM_FROM_EMAIL` configured
- [ ] One real enquiry delivered successfully

## Acceptance QA

- [ ] Mobile 320 / 375 / 390 / 430 px
- [ ] Tablet, laptop and desktop
- [ ] Inter and Cormorant fonts render from `/assets/fonts/`
- [ ] Navigation, drawer and mobile CTA verified
- [ ] Legacy `.html` redirects verified
- [ ] CMS create/delete test project
- [ ] Homepage edit/restore
- [ ] Add/reorder/remove a page section
- [ ] Global contact edit/restore
- [ ] Lighthouse/performance/accessibility pass recorded

## Optional future custom domain

- [ ] Domain is actually purchased/owned
- [ ] Domain connected to Worker with HTTPS
- [ ] Verified domain added to TinaCloud Site URLs
- [ ] `SITE_URL` set to the verified canonical origin
- [ ] Redirect/canonical behavior verified

## Client data still pending

- [ ] Replace `pehlo@seznam.cz` only after a branded mailbox is created and tested
- [ ] Add genuine project photography after ownership/project association is confirmed
- [ ] Add warranty/insurance/team/qualification claims only after they are verified
