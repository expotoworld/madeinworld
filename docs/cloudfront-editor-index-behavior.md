# CloudFront /index.html CachingDisabled Behavior (Editor)

This document describes the long-term solution to ensure the ebook editor updates are visible immediately:

- Keep static assets immutable and long-cached (assets/* hashed files)
- Ensure `/index.html` is always effectively non-cached at the CDN by attaching a behavior using a CachingDisabled cache policy

## Two-part approach

1) Operational workflow (immediate, low-risk):
- `.github/workflows/ops-cloudfront-ensure-index-behavior.yml` fetches the current distribution config, ensures a behavior for `/index.html` exists (or updates it) with the AWS managed cache policy `Managed-CachingDisabled`, and updates the distribution in place.
- This preserves all existing distribution settings.

2) IaC migration (future):
- We can import the existing distribution into CloudFormation, but this requires mirroring current properties exactly and performing a resource import operation. This repo currently does not manage the distribution.
- When ready, add a `infra/cloudfront-editor-distribution.yaml` template and prepare an Import plan (mapping existing DistributionId) to fully codify the distribution.

## How to run the operational workflow

- In GitHub Actions, run the workflow: "Ensure CloudFront /index.html behavior (CachingDisabled)".
- Input: Distribution ID (optional). If omitted, workflow uses the secret `CLOUDFRONT_DISTRIBUTION_ID`.
- It will:
  - Pull current config
  - Discover the managed CachingDisabled cache policy ID dynamically
  - Insert/update a behavior for `/index.html` targeting the same origin as the default behavior
  - Update the distribution

## Notes
- The Deploy Ebook Editor workflow already uploads `index.html` with `Cache-Control: no-cache, no-store, must-revalidate` and invalidates `"/index.html"` and `"/"`.
- This new behavior makes the caching stance explicit at CloudFront, further reducing reliance on invalidations.
- No other services or programs are altered.

