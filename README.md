# SSIOTUpdater-firmware

Central firmware repository for the **SS IOT Firmware Updater** desktop tool, plus a small static
**admin webapp** (GitHub Pages) for publishing and reverting firmware.

## What's here

| Path | Purpose |
|------|---------|
| `manifest.json` | Slim, **active-only** index the C# updater reads (schema v2). **Generated** — don't hand-edit. |
| `catalog.json` | Full version history + which version is active per Device/Battery. Source of truth for the webapp. |
| `firmware/<device>/<battery>/*.bin` | Every uploaded firmware, kept forever. |
| `docs/` | The admin webapp served by GitHub Pages. |
| `SPEC.md` | Design spec. |

Firmware is selected by **Device Type** (`4G IOT`, `VoltMeter`) × **Battery Type**
(`Daly`, `Bestway`, `Bestway 80v`).

## One-time setup

1. Create this repo as **public** on GitHub (the updater fetches over `raw.githubusercontent.com`
   with no token, so it must be public).
2. **Settings → Pages →** Deploy from branch → branch `main`, folder `/docs`.
3. Open the Pages URL, sign in (see `docs/app.js` — change `ADMIN_USER`/`ADMIN_PASS`).
4. **Settings tab →** paste a **fine-grained GitHub PAT** with *Contents: Read and write* on this
   repo only. It is stored in your browser and never committed. Click **Test connection**.

## Publishing firmware

- **Upload tab:** choose Device + Battery, pick the `.bin`, set a version, add Markdown notes, click
  **Upload & publish**. The app hashes the file (SHA-256), commits it, records it in `catalog.json`
  as active, and regenerates `manifest.json`.
- **Manage & Revert tab:** pick a Device + Battery to see all versions newest-first; tick any version
  to make it active (revert). `manifest.json` is regenerated so the updater picks it up.

## Security note

The login screen is a **cosmetic gate** (this is public JavaScript). Real write protection is your
**GitHub token**, which only you hold. Even if someone opened the app, they could not publish without
a valid token, and the firmware here is public to read anyway. Never commit a token.

See [SPEC.md](SPEC.md) for the full design.
