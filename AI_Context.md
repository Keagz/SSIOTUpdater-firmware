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
| `catalog.json` | **Source of truth.** Full version history plus Production `activeVersion` and optional Candidate `candidateVersion` per Device/Battery. Written by the webapp. |
| `manifest.json` | **Generated** from `catalog.json` (Production versions only). Schema v2. This is the normal C# tool contract — **do not hand-edit or change its shape.** |
| `candidate-manifest.json` | **Generated** Candidate-only schema-v2 manifest. It is empty until a test release is selected and must never be the normal updater default. |
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
`devices[<Device Type>][<Battery Type>] = { activeVersion, candidateVersion, versions: [ {version,
channel, file, sha256, size, uploadedAt (ISO), notes (Markdown)} ] }`. Versions are shown newest-first
by `uploadedAt`. `activeVersion` is Production; `candidateVersion` is explicit test-only Candidate.

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
  - `generateManifest(catalog, channel)` — regenerates the chosen Production or Candidate manifest.
  - Upload flow: immutable `.bin` → SHA-256 → update `catalog.json` → regenerate only that channel's
    manifest. Candidate is the default; Production needs an explicit confirmation.
  - Manage: select/clear Candidate, promote to Production, or roll back Production.

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
(`https://raw.githubusercontent.com/Keagz/SSIOTUpdater-firmware/main/`) by default,
caches binaries under `%LocalAppData%\SS_IOT_FWUpdater\`, and verifies SHA-256 before
flashing. After the existing admin unlock, the released Candidate flow can explicitly
select `candidate-manifest.json`; it stores Candidate data below
`%LocalAppData%\SS_IOT_FWUpdater\candidate` and returns to Production on the next
application launch. **If you change either manifest's schema here, you must update
that C# code too** — otherwise the tool breaks. Both manifests intentionally use the
same schema so channel selection does not require a data-model change.

## Common tasks

| Task | Where |
|------|-------|
| Add a device/battery type | `docs/app.js` `CONFIG` (+ the C# app's dropdowns & flash logic) |
| Change how manifest is built | `generateManifest(catalog, channel)` in `docs/app.js` (keep the schema the C# tool expects) |
| Change the login | `ADMIN_USER`/`ADMIN_PASS` in `docs/app.js` (cosmetic only) |
| Adjust styling | `docs/style.css` |

## Out of scope / not yet built

Deleting/pruning old versions, atomic multi-file commits, real per-user auth, version diffs, and
drag-and-drop upload.

## Cross-system release-channel handover — 7 September 2026

Read `C:\Software Development\SSIOTFW\ARCHITECTURE_AI_CONTEXT.md` before changing
firmware publication behaviour. It is the cross-repository source for the portal,
firmware, desktop updater, signed OTA, and Silver Solutions compatibility boundaries.

### Implemented channel split

The repository now has two updater manifests with the same existing schema-v2 shape:

- `manifest.json`: production only, selected by `activeVersion`; it remains the
  normal updater default.
- `candidate-manifest.json`: explicit test-only selection, selected by a new optional
  `candidateVersion` catalog pointer.

The schema-v2 catalog retains `activeVersion` for backward compatibility, adds an
optional `candidateVersion`, and labels version records with `channel`. Candidate
uploads update only the candidate pointer/manifest. An explicit promotion operation
is the only action allowed to change `activeVersion` and `manifest.json`; rollback
repoints Production to a retained verified artifact.

The admin UI defaults new uploads to Candidate, requires confirmation for a
Production upload or promotion, and rejects a changed binary at an existing artifact
path. Candidate and Production manifests are independently regenerated. The desktop
updater now consumes `candidate-manifest.json` only through its explicit Candidate
selection and isolated cache. This support is committed in `e92fae3` and released
through the normal ClickOnce update channel as `1.0.0.57`.

Current state: the Candidate manifest selects Daly A011. Production `manifest.json`
still selects V010 (Daly), V516 (Bestway), and V709 (Bestway 80 V). A Candidate
selection is test-only availability, not fleet approval or a Production promotion.

The public repository is appropriate for integrity-verified distribution, not as a
confidentiality or authorisation boundary.
