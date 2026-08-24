# AI_Context.md — SSIOTUpdater-firmware

> Context for AI assistants working on this repo. Read this first.
> Last updated: 2026-08-24.

## What this repo is

The **central firmware repository** for the **SS IOT Firmware Updater** Windows desktop tool
(separate repo: `Keagz/SSIOTUpdater`, C# WinForms/.NET 8). It stores firmware `.bin` files and a
manifest the desktop tool downloads, **plus a static admin webapp** (in `docs/`, hosted on GitHub
Pages) for publishing new firmware and reverting to older versions.

This repo must stay **public**: the desktop tool fetches `manifest.json` and the `.bin`s over
`raw.githubusercontent.com` with **no authentication**.

## How firmware is selected

By **Device Type × Battery Type**:
- Device Type: `4G IOT` (chip `esp32s3`, flash offset `0x10000`), `VoltMeter` (chip `esp32`, `0x10000`).
- Battery Type: `Daly`, `Bestway`, `Bestway 80v`.

Each Device+Battery combination maps to one active firmware binary.

## Files & data model

| Path | Role |
|------|------|
| `catalog.json` | **Source of truth.** Full version history + `activeVersion` per Device/Battery. Written by the webapp. |
| `manifest.json` | **Generated** from `catalog.json` (active versions only). Schema v2. This is the contract the C# tool reads — **do not hand-edit or change its shape.** |
| `firmware/<device-slug>/<battery-slug>/*.bin` | Every uploaded binary, kept forever. Slugs: `4g-iot`, `voltmeter` / `daly`, `bestway`, `bestway-80v`. |
| `docs/` | The GitHub Pages admin webapp. |
| `SPEC.md` | Full design spec. |
| `README.md` | Operator quickstart. |

### `manifest.json` shape (must match the C# `FirmwareManifest.Manifest`)
```json
{ "schemaVersion": 2,
  "firmware": {
    "4G IOT": { "Daly": { "version": "...", "file": "firmware/4g-iot/daly/...bin",
                          "sha256": "<hex>", "size": 123, "chip": "esp32s3", "offset": "0x10000" } } } }
```
`chip`/`offset` are derived from Device Type. Variants with no active version are omitted.

### `catalog.json` shape
`devices[<Device Type>][<Battery Type>] = { activeVersion, versions: [ {version, file, sha256, size,
uploadedAt (ISO), notes (Markdown)} ] }`. Versions are shown newest-first by `uploadedAt`.

## The admin webapp (`docs/`)

Vanilla HTML/CSS/JS, **no build step**, so it deploys straight to GitHub Pages.
- `index.html` — markup for login + Upload / Manage / Settings tabs.
- `style.css` — dark theme.
- `lib/markdown.js` — tiny, self-contained, HTML-escaping Markdown renderer (`window.renderMarkdown`).
  Deliberately no third-party runtime scripts (a token lives in the browser; keep XSS surface small).
- `app.js` — all logic:
  - `CONFIG` (owner/repo/branch, device/battery lists, slugs, chip/offset).
  - `ADMIN_USER`/`ADMIN_PASS` — **cosmetic** login gate (public JS; NOT real security).
  - `Token` — GitHub PAT stored in `localStorage` (key `ssiot_gh_token`).
  - GitHub **Contents API** client (`ghGet`, `ghPut`, `ghGetJson`, `ghPutJson` with 409 retry).
  - `sha256Hex` via Web Crypto (upper-case hex, matches the C# tool's comparison).
  - `generateManifest(catalog)` — regenerates `manifest.json` from active versions.
  - Upload flow: `.bin` → SHA-256 → PUT bin → update `catalog.json` → regenerate `manifest.json`
    (three separate commits; manifest is always regenerated so a partial failure is safe to re-run).
  - Manage/revert: `setActive(device, battery, version)`.

## Security model (important)

- The login is **cosmetic** — anyone can read the credentials in the page source. Real write
  protection is the **GitHub token**, which only the operator has and which is stored solely in their
  browser's `localStorage`. Even if the login were bypassed, no one can publish without a valid token,
  and the firmware is public to read anyway.
- Token = **fine-grained PAT, Contents: Read and write on THIS repo only**, short expiry.
- **Never commit a token** or embed one in the page (GitHub secret-scanning auto-revokes leaked
  tokens, and this repo is public).

## Relationship to the desktop tool

The C# side (`Keagz/SSIOTUpdater`, `SS_IOT_FWUpdater/Firmware/FirmwareService.cs` +
`FirmwareManifest.cs`) reads `manifest.json` from `FirmwareService.BaseUrl`
(`https://raw.githubusercontent.com/Keagz/SSIOTUpdater-firmware/main/`), caches binaries under
`%LocalAppData%\SS_IOT_FWUpdater\`, and verifies SHA-256 before flashing. **If you change
`manifest.json`'s schema here, you must update that C# code too** — otherwise the tool breaks.

## Common tasks

| Task | Where |
|------|-------|
| Add a device/battery type | `docs/app.js` `CONFIG` (+ the C# app's dropdowns & flash logic) |
| Change how manifest is built | `generateManifest()` in `docs/app.js` (keep the schema the C# tool expects) |
| Change the login | `ADMIN_USER`/`ADMIN_PASS` in `docs/app.js` (cosmetic only) |
| Adjust styling | `docs/style.css` |

## Out of scope / not yet built

Deleting/pruning old versions, atomic multi-file commits, real per-user auth, version diffs,
drag-and-drop upload, release channels (stable/beta).
