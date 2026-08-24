# Firmware Repo + Admin Webapp — Spec

## Purpose
Host firmware for the SS IOT Firmware Updater and provide a static GitHub Pages webapp to publish new
firmware and revert to older versions, without changing the updater's contract.

## Selection model
Firmware is chosen by **Device Type × Battery Type**:
- Device Type: `4G IOT` (esp32s3 @ `0x10000`), `VoltMeter` (esp32 @ `0x10000`).
- Battery Type: `Daly`, `Bestway`, `Bestway 80v`.

## Data model

### `catalog.json` — source of truth (webapp reads/writes)
```json
{
  "schemaVersion": 1,
  "devices": {
    "<Device Type>": {
      "<Battery Type>": {
        "activeVersion": "6.1.0",
        "versions": [
          { "version": "6.1.0",
            "file": "firmware/4g-iot/daly/4g-iot_daly_6.1.0.bin",
            "sha256": "<upper-hex>", "size": 1234567,
            "uploadedAt": "2026-08-24T10:30:00Z",
            "notes": "Markdown release notes" }
        ]
      }
    }
  }
}
```
Versions are kept forever; newest is shown first (sorted by `uploadedAt`).

### `manifest.json` — generated, read by the C# updater (schema v2, do not hand-edit)
```json
{ "schemaVersion": 2,
  "firmware": {
    "4G IOT": { "Daly": {
      "version": "6.1.0", "file": "firmware/4g-iot/daly/4g-iot_daly_6.1.0.bin",
      "sha256": "<hex>", "size": 1234567, "chip": "esp32s3", "offset": "0x10000" } } } }
```
Built from each variant's `activeVersion`. `chip`/`offset` derive from Device Type. Variants with no
active version are omitted. This exactly matches `FirmwareManifest.Manifest` in the desktop app —
keep the shape stable.

## Webapp (`docs/`, vanilla JS, no build)
- `index.html`, `style.css`, `app.js`, `lib/markdown.js` (tiny, self-contained Markdown renderer —
  no runtime CDN dependency).
- **Login**: hardcoded `ADMIN_USER`/`ADMIN_PASS` in `app.js` (cosmetic gate).
- **Settings**: fine-grained GitHub PAT (Contents: read/write, this repo only) stored in
  `localStorage`; connection test.
- **Upload**: Device + Battery + version + Markdown notes + `.bin` → SHA-256 (Web Crypto) → commit
  `.bin` → update `catalog.json` (active) → regenerate `manifest.json`.
- **Manage/Revert**: list versions newest-first; tick to set active (updates catalog + manifest).

## GitHub API
GitHub **Contents API** (CORS-enabled), token in `Authorization: Bearer`:
- `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` → base64 + blob `sha`.
- `PUT /repos/{owner}/{repo}/contents/{path}` with `{message, content(base64), branch, sha?}`;
  updating an existing file needs its current `sha` (GET before PUT; retry once on `409`).
- Publish order: `.bin` → `catalog.json` → `manifest.json` (three commits). `manifest.json` is always
  regenerated from `catalog.json` so a partial failure is safe to re-run.

## Constraints
- ESP `.bin`s (~1–4 MB) fit the Contents API (base64 inflates the request ~33%; ~50 MB practical cap).
- Token: fine-grained, this repo only, short expiry, `localStorage` only, never committed. No
  third-party runtime scripts (keeps XSS surface minimal).
- Repo must be **public** for the updater's unauthenticated `raw.githubusercontent.com` fetch.

## Out of scope (v1)
Delete/prune versions, atomic multi-file commits, real per-user auth, version diffs, drag-and-drop,
release channels.
