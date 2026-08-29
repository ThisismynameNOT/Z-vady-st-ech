# Production activation checklist

This checklist tracks the final activation phase for the Astro + TinaCMS + Cloudflare production site.

## External integrations

- [ ] TinaCloud project connected to `main`
- [ ] `PUBLIC_TINA_CLIENT_ID` and `TINA_TOKEN` configured
- [ ] `/admin/` login verified
- [ ] Cloudinary runtime credentials configured
- [ ] Tina media list/upload/select/delete verified
- [ ] Resend sender/domain verified
- [ ] `RESEND_API_KEY`, `FORM_RECIPIENT_EMAIL`, and `FORM_FROM_EMAIL` configured
- [ ] One real enquiry delivered successfully

## Cloudflare

- [ ] Deployment credentials configured in GitHub Actions
- [ ] Required Worker runtime secrets configured
- [ ] Controlled manual Worker deployment succeeds
- [ ] Public routes and `/admin/` verified on the Worker deployment
- [ ] `zavadystrech.cz` connected with HTTPS
- [ ] Canonical/www redirect verified
- [ ] `CLOUDFLARE_DEPLOY_ENABLED=true` enabled only after successful checks

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

## Client data still pending

- [ ] Replace `pehlo@seznam.cz` only after a branded mailbox is created and tested
- [ ] Add genuine project photography after ownership/project association is confirmed
- [ ] Add warranty/insurance/team/qualification claims only after they are verified
