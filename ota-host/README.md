# OTA artifact host

This isolated Cloudflare Worker is modem-facing OTA delivery only. GitHub remains the immutable release history.

`prepare-assets.mjs` requires the Production and Candidate manifests to match their catalog pointers, validates the size and SHA-256 of every catalogued 4G-IOT binary, and copies every historical and selected release. It also writes `release-index.json` with exact metadata and pointer state.

The modem URL is always the canonical plain-HTTP worker origin plus the catalog artifact path:

```text
http://ssiot-ota-pilot.battery-monitor.workers.dev/<artifact-path>
```

The IoT must never receive an HTTPS, GitHub raw, redirecting, or version-specific exception URL. Portal services may fetch `https://ssiot-ota-pilot.battery-monitor.workers.dev/release-index.json`; the IoT never uses that control-plane URL.

After deployment, `verify-deployment.mjs` downloads every exact HTTP URL without following redirects and requires HTTP 200, `application/octet-stream`, exact `Content-Length`, and matching SHA-256. Any mismatch fails the GitHub Action. The workflow needs repository secrets `CLOUDFLARE_API_TOKEN` (restricted to this Worker) and `CLOUDFLARE_ACCOUNT_ID`; never enter these in Firmware Admin.
