# OTA artifact host

This isolated Cloudflare Worker is modem-facing OTA delivery only. GitHub remains the immutable release history.

`prepare-assets.mjs` requires the Production and Candidate manifests to match their catalog pointers, validates the size and SHA-256 of every catalogued 4G-IOT binary, and copies every historical and selected release. It also writes `release-index.json` with exact metadata and pointer state.

The modem URL is always the canonical plain-HTTP worker origin plus the catalog artifact path:

```text
http://ssiot-ota-pilot.battery-monitor.workers.dev/<artifact-path>
```

The IoT must never receive an HTTPS, GitHub raw, redirecting, or version-specific exception URL. Portal services may fetch `https://ssiot-ota-pilot.battery-monitor.workers.dev/release-index.json`; the IoT never uses that control-plane URL.

After deployment, `verify-deployment.mjs` downloads every exact HTTP URL without following redirects and requires HTTP 200, `application/octet-stream`, exact `Content-Length`, and matching SHA-256. Any mismatch fails the GitHub Action. The workflow needs repository secrets `CLOUDFLARE_API_TOKEN` (restricted to this Worker) and `CLOUDFLARE_ACCOUNT_ID`; never enter these in Firmware Admin.

## Verified deployment snapshot — 2026-10-05

Commit `74ee3d0` selected Daly A021 as Candidate while retaining A017 as
Production. The workflow prepared and verified 21 historical/selected 4G-IOT
artifacts. A021 is available at:

```text
http://ssiot-ota-pilot.battery-monitor.workers.dev/firmware/4g-iot/daly/4g-iot_daly_A021.bin
```

Verified metadata: 451088 bytes; SHA-256
`E8B487F38C07C86D167EEDA9682997716D04887E552D61AC721048AC0770EEB8`.
This records artifact availability only, not device installation or Production
approval.
