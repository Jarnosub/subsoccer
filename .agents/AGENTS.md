# Subsoccer Project Rules

## Deployment
- **NEVER deploy directly to production** (`--prod` flag). Always deploy to staging first (without `--prod`).
- Share the staging/draft URL with the user for review.
- Only deploy to production when the user explicitly approves the staging version.
- Preview URL: `https://preview--subsoccer-pro-live.netlify.app/`
- Command for preview/staging: `npx netlify deploy --alias preview --dir=. --skip-functions-cache`
- Command for production (only after approval): `npx netlify deploy --prod --dir=. --skip-functions-cache`
- **NOTE:** Do NOT use `--alias staging` — it conflicts with the `staging` git branch and Netlify serves old branch deploy content instead.
