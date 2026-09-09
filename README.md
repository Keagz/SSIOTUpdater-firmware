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
  **Upload & publish**. Candidate is the default channel: the app hashes the file (SHA-256), commits
  an immutable artifact, updates only `candidateVersion`, and regenerates only
  `candidate-manifest.json`. Production upload requires explicit confirmation.
- **Manage & Revert tab:** pick a Device + Battery to see all versions newest-first; tick any version
  to select it as a Candidate, promote an approved version to Production, or revert Production to a
  retained version. Promotion or rollback regenerates `manifest.json` so normal updater installations
  pick it up. The **Delete** control permanently removes an unselected Candidate release and its
  binary after confirmation; Production and currently selected Candidate releases are protected.

## Security note

The login screen is a **cosmetic gate** (this is public JavaScript). Real write protection is your
**GitHub token**, which only you hold. Even if someone opened the app, they could not publish without
a valid token, and the firmware here is public to read anyway. Never commit a token.

See [SPEC.md](SPEC.md) for the full design.
