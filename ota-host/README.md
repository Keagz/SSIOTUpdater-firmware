# OTA artifact host

This isolated Cloudflare Worker is modem-facing OTA delivery only. GitHub remains the immutable release history.

`prepare-assets.mjs` copies only each family's selected Production (`activeVersion`) and Candidate (`candidateVersion`) artifacts from `catalog.json`. The GitHub Actions workflow needs repository secrets `CLOUDFLARE_API_TOKEN` (restricted to this Worker) and `CLOUDFLARE_ACCOUNT_ID`; never enter these in Firmware Admin.

The direct URL is the worker origin plus the catalog artifact path. Do not first run the automated mirror while an active signed command still references the older manually hosted A519 path.
