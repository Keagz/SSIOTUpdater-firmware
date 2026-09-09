/* =====================================================================
 * SS IOT Firmware Admin — static GitHub Pages app.
 *
 * Publishes firmware to the firmware repo via the GitHub Contents API.
 * The cosmetic login below is NOT security (this is public JS). Real write
 * protection is the GitHub token, which the operator supplies at runtime and
 * which is stored ONLY in this browser's localStorage — never committed.
 * ===================================================================== */

/* ---------------- Config ---------------- */
const CONFIG = {
  owner: "Keagz",
  repo: "SSIOTUpdater-firmware",
  branch: "main",
  devices: ["4G IOT", "VoltMeter"],
  batteries: ["Daly", "Bestway", "Bestway 80v"],
  // chip + flash offset per Device Type (used when generating manifest.json).
  deviceMeta: {
    "4G IOT": { chip: "esp32s3", offset: "0x10000", slug: "4g-iot" },
    "VoltMeter": { chip: "esp32", offset: "0x10000", slug: "voltmeter" }
  },
  batterySlug: { "Daly": "daly", "Bestway": "bestway", "Bestway 80v": "bestway-80v" }
};

// Cosmetic gate — change these. Anyone can read them in the page source.
const ADMIN_USER = "admin";
const ADMIN_PASS = "101291Kg!";

const TOKEN_KEY = "ssiot_gh_token";
const API = "https://api.github.com";
const RELEASE_CHANNELS = {
  production: { pointer: "activeVersion", manifest: "manifest.json", label: "Production" },
  candidate: { pointer: "candidateVersion", manifest: "candidate-manifest.json", label: "Candidate" }
};

/* ---------------- Small DOM helpers ---------------- */
const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

function toast(msg, kind) {
  const t = el("toast");
  t.textContent = msg;
  t.className = "toast " + (kind || "info");
  setTimeout(() => t.classList.add("hidden"), 4200);
}

/* ---------------- Token store ---------------- */
const Token = {
  get: () => localStorage.getItem(TOKEN_KEY) || "",
  set: (v) => localStorage.setItem(TOKEN_KEY, v),
  clear: () => localStorage.removeItem(TOKEN_KEY),
  has: () => !!localStorage.getItem(TOKEN_KEY)
};

/* ---------------- Encoding helpers ---------------- */
function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const utf8Encode = (str) => new TextEncoder().encode(str);
const utf8Decode = (bytes) => new TextDecoder().decode(bytes);

async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/* ---------------- GitHub Contents API ---------------- */
function ghHeaders(withToken) {
  const h = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (withToken && Token.has()) h["Authorization"] = "Bearer " + Token.get();
  return h;
}

function contentsUrl(path) {
  return `${API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;
}

// Returns {sha, bytes} or null (404). Uses token if available (higher rate limit).
// cache:"no-store" + a cache-buster keep the browser from serving a stale copy
// (GitHub marks Contents responses cacheable for ~60s, which otherwise hid fresh uploads).
async function ghGet(path) {
  const url = contentsUrl(path)
    + "?ref=" + encodeURIComponent(CONFIG.branch)
    + "&_=" + Date.now();
  const res = await fetch(url, { headers: ghHeaders(true), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { sha: json.sha, bytes: base64ToBytes(json.content || "") };
}

async function ghPut(path, base64Content, message, sha) {
  if (!Token.has()) throw new Error("No GitHub token set. Add one under Settings.");
  const body = { message, content: base64Content, branch: CONFIG.branch };
  if (sha) body.sha = sha;
  const res = await fetch(contentsUrl(path), {
    method: "PUT",
    headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(true)),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`PUT ${path} failed: ${res.status} ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Read a JSON file; returns {obj, sha} or {obj:null, sha:null} if missing.
async function ghGetJson(path) {
  const got = await ghGet(path);
  if (!got) return { obj: null, sha: null };
  return { obj: JSON.parse(utf8Decode(got.bytes)), sha: got.sha };
}

// Write a JSON file, fetching the current sha first; retries once on 409 conflict.
async function ghPutJson(path, obj, message) {
  const pretty = JSON.stringify(obj, null, 2) + "\n";
  const b64 = bytesToBase64(utf8Encode(pretty));
  const current = await ghGetJson(path);
  try {
    return await ghPut(path, b64, message, current.sha || undefined);
  } catch (e) {
    if (e.status === 409) {
      const fresh = await ghGetJson(path);
      return await ghPut(path, b64, message, fresh.sha || undefined);
    }
    throw e;
  }
}

/* ---------------- Catalog <-> Manifest ---------------- */
function emptyCatalog() {
  const devices = {};
  for (const d of CONFIG.devices) {
    devices[d] = {};
    for (const b of CONFIG.batteries) {
      devices[d][b] = { activeVersion: "", candidateVersion: "", versions: [] };
    }
  }
  return { schemaVersion: 2, devices };
}

// Normalise v1 catalogs in memory. Existing releases were production releases;
// this keeps the old production manifest contract intact when the catalog is saved.
function normaliseCatalog(catalog) {
  const result = catalog || emptyCatalog();
  result.devices = result.devices || {};
  for (const device of CONFIG.devices) {
    result.devices[device] = result.devices[device] || {};
    for (const battery of CONFIG.batteries) {
      const variant = result.devices[device][battery] || {};
      variant.activeVersion = variant.activeVersion || "";
      variant.candidateVersion = variant.candidateVersion || "";
      variant.versions = Array.isArray(variant.versions) ? variant.versions : [];
      for (const release of variant.versions) {
        if (release.channel !== "production" && release.channel !== "candidate") {
          release.channel = "production";
        }
      }
      result.devices[device][battery] = variant;
    }
  }
  result.schemaVersion = 2;
  return result;
}

async function loadCatalog() {
  const { obj } = await ghGetJson("catalog.json");
  return normaliseCatalog(obj);
}

// Build the existing schema-v2 updater manifest for one explicit release channel.
function generateManifest(catalog, channel) {
  const config = RELEASE_CHANNELS[channel];
  if (!config) throw new Error(`Unknown release channel: ${channel}`);
  const firmware = {};
  for (const device of CONFIG.devices) {
    const meta = CONFIG.deviceMeta[device];
    const byBattery = (catalog.devices[device]) || {};
    for (const battery of CONFIG.batteries) {
      const variant = byBattery[battery];
      const selectedVersion = variant && variant[config.pointer];
      if (!selectedVersion) continue;
      const v = (variant.versions || []).find((x) => x.version === selectedVersion);
      if (!v || v.channel !== channel) continue;
      firmware[device] = firmware[device] || {};
      firmware[device][battery] = {
        version: v.version,
        file: v.file,
        sha256: v.sha256,
        size: v.size,
        chip: meta.chip,
        offset: meta.offset
      };
    }
  }
  return { schemaVersion: 2, firmware };
}

async function publishManifest(catalog, message) {
  await ghPutJson("manifest.json", generateManifest(catalog, "production"), message);
}

async function publishCandidateManifest(catalog, message) {
  await ghPutJson(
    "candidate-manifest.json",
    generateManifest(catalog, "candidate"),
    message
  );
}

/* ---------------- Path helpers ---------------- */
function slugVersion(v) { return v.trim().replace(/[^A-Za-z0-9._-]/g, "-"); }

function binPath(device, battery, version) {
  const dv = CONFIG.deviceMeta[device].slug;
  const bt = CONFIG.batterySlug[battery];
  return `firmware/${dv}/${bt}/${dv}_${bt}_${slugVersion(version)}.bin`;
}

/* ---------------- Login ---------------- */
function showApp() { el("login").classList.add("hidden"); el("app").classList.remove("hidden"); }

el("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const ok = el("loginUser").value === ADMIN_USER && el("loginPass").value === ADMIN_PASS;
  if (ok) { sessionStorage.setItem("ssiot_authed", "1"); showApp(); afterLogin(); }
  else el("loginError").classList.remove("hidden");
});
el("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("ssiot_authed");
  location.reload();
});

/* ---------------- Tabs ---------------- */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tabpane").forEach((p) => p.classList.add("hidden"));
    el("tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "manage") refreshManage();
  });
});

/* ---------------- Populate dropdowns ---------------- */
function fillSelect(node, items) {
  node.innerHTML = "";
  for (const it of items) {
    const o = document.createElement("option");
    o.value = it; o.textContent = it; node.appendChild(o);
  }
}

/* ---------------- Settings ---------------- */
el("saveTokenBtn").addEventListener("click", () => {
  const v = el("tokenInput").value.trim();
  if (!v) { toast("Enter a token first.", "err"); return; }
  Token.set(v);
  el("tokenInput").value = "";
  el("tokenStatus").textContent = "Token saved to this browser.";
  updateBanner();
  toast("Token saved.", "ok");
});
el("clearTokenBtn").addEventListener("click", () => {
  Token.clear();
  el("tokenStatus").textContent = "Token cleared.";
  updateBanner();
  toast("Token cleared.", "info");
});
el("testTokenBtn").addEventListener("click", async () => {
  el("tokenStatus").textContent = "Testing...";
  try {
    const res = await fetch(`${API}/repos/${CONFIG.owner}/${CONFIG.repo}`, { headers: ghHeaders(true) });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    const j = await res.json();
    const perm = j.permissions && j.permissions.push ? "write OK" : "read-only (need Contents: write)";
    el("tokenStatus").textContent = `Connected to ${j.full_name} — ${perm}.`;
    toast("Connection OK.", "ok");
  } catch (e) {
    el("tokenStatus").textContent = "Failed: " + e.message;
    toast("Connection failed.", "err");
  }
});

function updateBanner() {
  el("repoBanner").textContent =
    `Target: ${CONFIG.owner}/${CONFIG.repo}@${CONFIG.branch}` +
    (Token.has() ? "  •  token set" : "  •  no token — add one in Settings to publish");
  el("repoInfo").textContent = `${CONFIG.owner}/${CONFIG.repo}  (branch: ${CONFIG.branch})`;
}

/* ---------------- Upload ---------------- */
function updateUploadChannelUi() {
  const channel = el("upChannel").value;
  const isCandidate = channel === "candidate";
  el("uploadBtn").textContent = isCandidate ? "Upload candidate" : "Upload production release";
  el("upChannelHelp").textContent = isCandidate
    ? "Candidate uploads update candidate-manifest.json only. Normal updater installations will not see this release. After GitHub publishes it, the selected Candidate is mirrored to the isolated Cloudflare OTA host."
    : "Production uploads update manifest.json and become the normal updater release. Use this only after explicit approval.";
}

el("upNotes").addEventListener("input", () => {
  el("notesPreview").innerHTML = window.renderMarkdown(el("upNotes").value);
});
el("upFile").addEventListener("change", async () => {
  const f = el("upFile").files[0];
  if (!f) { el("upSha").textContent = ""; return; }
  const buf = await f.arrayBuffer();
  el("upSha").textContent = `SHA-256: ${await sha256Hex(buf)}  (${f.size} bytes)`;
});
el("upChannel").addEventListener("change", updateUploadChannelUi);

el("uploadBtn").addEventListener("click", async () => {
  const device = el("upDevice").value;
  const battery = el("upBattery").value;
  const version = el("upVersion").value.trim();
  const channel = el("upChannel").value;
  const notes = el("upNotes").value;
  const file = el("upFile").files[0];

  if (!version) return toast("Enter a version.", "err");
  if (!file) return toast("Choose a .bin file.", "err");
  if (!Token.has()) return toast("Add a GitHub token in Settings first.", "err");
  if (!RELEASE_CHANNELS[channel]) return toast("Choose a valid release channel.", "err");
  if (channel === "production" && !confirm(
    `Publish ${device} / ${battery} ${version} to Production? Normal updater installations will receive it.`
  )) return;

  const btn = el("uploadBtn");
  btn.disabled = true;
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const sha = await sha256Hex(buf);
    const path = binPath(device, battery, version);

    // Reload catalog fresh so we never clobber a concurrent change.
    const catalog = await loadCatalog();
    const variant = catalog.devices[device][battery];
    const existingRelease = (variant.versions || []).find((v) => v.version === version);
    if (existingRelease && existingRelease.channel !== channel) {
      throw new Error(`Version ${version} already belongs to the ${existingRelease.channel} channel. Use the explicit promotion workflow instead of re-uploading it.`);
    }

    const existingBinary = await ghGet(path);
    if (existingBinary) {
      const existingSha = await sha256Hex(existingBinary.bytes);
      if (existingSha !== sha) {
        throw new Error(`Artifact ${path} already exists with a different SHA-256. Release artifacts are immutable.`);
      }
    } else {
      toast("Uploading firmware...", "info");
      await ghPut(path, bytesToBase64(bytes), `Add firmware ${channel} ${device}/${battery} v${version}`);
    }

    if (!existingRelease) {
      variant.versions.unshift({
        version, channel, file: path, sha256: sha, size: bytes.length,
        uploadedAt: new Date().toISOString(), notes
      });
    }
    variant[RELEASE_CHANNELS[channel].pointer] = version;
    if (channel === "production" && variant.candidateVersion === version) {
      variant.candidateVersion = "";
    }

    await ghPutJson("catalog.json", catalog, `Catalog: publish ${channel} ${device}/${battery} v${version}`);
    if (channel === "production") {
      await publishManifest(catalog, `Manifest: set ${device}/${battery} production = v${version}`);
    } else {
      await publishCandidateManifest(catalog, `Candidate manifest: set ${device}/${battery} candidate = v${version}`);
    }

    toast(`Published ${channel} ${device} / ${battery} v${version}.`, "ok");
    el("upVersion").value = ""; el("upNotes").value = ""; el("upFile").value = "";
    el("upSha").textContent = ""; el("notesPreview").innerHTML = "";
  } catch (e) {
    console.error(e);
    toast("Upload failed: " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- Manage / revert ---------------- */
async function refreshManage() {
  try {
    const catalog = await loadCatalog();
    renderVersions(catalog);
  } catch (e) {
    toast("Could not load catalog: " + e.message, "err");
  }
}

el("mgDevice").addEventListener("change", refreshManage);
el("mgBattery").addEventListener("change", refreshManage);

function renderVersions(catalog) {
  const device = el("mgDevice").value;
  const battery = el("mgBattery").value;
  const variant = (catalog.devices[device] && catalog.devices[device][battery]) || {
    activeVersion: "", candidateVersion: "", versions: []
  };
  const rows = (variant.versions || []).slice().sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));

  const tbody = el("versionTable").querySelector("tbody");
  tbody.innerHTML =
    "<tr><th>Production</th><th>Candidate</th><th>Version</th><th>Channel</th><th>Uploaded</th><th>Size</th><th>SHA-256</th></tr>";
  el("clearCandidateBtn").disabled = !variant.candidateVersion;

  if (rows.length === 0) {
    tbody.innerHTML += `<tr><td colspan="7" class="muted">No firmware uploaded for this combination yet.</td></tr>`;
    el("mgNotes").innerHTML = "";
    return;
  }

  for (const v of rows) {
    const isProduction = v.version === variant.activeVersion;
    const isCandidate = v.version === variant.candidateVersion;
    const tr = document.createElement("tr");
    if (isProduction) tr.classList.add("active-row");
    if (isCandidate) tr.classList.add("candidate-row");
    const when = v.uploadedAt ? new Date(v.uploadedAt).toLocaleString() : "—";
    tr.innerHTML =
      `<td><input type="radio" name="productionVer" ${isProduction ? "checked" : ""} aria-label="Set production version ${v.version}"></td>` +
      `<td><input type="radio" name="candidateVer" ${isCandidate ? "checked" : ""} ${v.channel === "candidate" ? "" : "disabled"} aria-label="Set candidate version ${v.version}"></td>` +
      `<td>${v.version} ${isProduction ? '<span class="badge active">production</span>' : ""} ${isCandidate ? '<span class="badge candidate">candidate</span>' : ""}</td>` +
      `<td>${v.channel}</td>` +
      `<td>${when}</td>` +
      `<td class="mono">${v.size || 0}</td>` +
      `<td class="mono">${(v.sha256 || "").slice(0, 12)}…</td>`;
    const [productionInput, candidateInput] = tr.querySelectorAll("input");
    productionInput.addEventListener("change", () => setProduction(device, battery, v.version));
    candidateInput.addEventListener("change", () => setCandidate(device, battery, v.version));
    tr.addEventListener("click", () => { el("mgNotes").innerHTML = window.renderMarkdown(v.notes || "_No notes._"); });
    tbody.appendChild(tr);
  }
  const activeEntry = rows.find((v) => v.version === variant.activeVersion)
    || rows.find((v) => v.version === variant.candidateVersion)
    || rows[0];
  el("mgNotes").innerHTML = window.renderMarkdown(activeEntry.notes || "_No notes._");
}

async function setProduction(device, battery, version) {
  if (!Token.has()) { toast("Add a GitHub token in Settings first.", "err"); refreshManage(); return; }
  if (!confirm(`Set ${device} / ${battery} ${version} as Production? Normal updater installations will receive it.`)) {
    refreshManage(); return;
  }
  try {
    toast(`Promoting or rolling back ${version}...`, "info");
    const catalog = await loadCatalog();
    const variant = catalog.devices[device][battery];
    const release = (variant.versions || []).find((v) => v.version === version);
    if (!release) throw new Error(`Release ${version} does not exist.`);
    const wasSelectedCandidate = variant.candidateVersion === version;
    release.channel = "production";
    variant.activeVersion = version;
    if (wasSelectedCandidate) variant.candidateVersion = "";
    await ghPutJson("catalog.json", catalog, `Catalog: set production ${device}/${battery} = v${version}`);
    await publishManifest(catalog, `Manifest: set ${device}/${battery} production = v${version}`);
    if (wasSelectedCandidate) {
      await publishCandidateManifest(catalog, `Candidate manifest: retire promoted ${device}/${battery} v${version}`);
    }
    toast(`${device} / ${battery} production is now v${version}.`, "ok");
    renderVersions(catalog);
  } catch (e) {
    toast("Failed: " + e.message, "err");
    refreshManage();
  }
}

async function setCandidate(device, battery, version) {
  if (!Token.has()) { toast("Add a GitHub token in Settings first.", "err"); refreshManage(); return; }
  try {
    toast(`Selecting candidate ${version}...`, "info");
    const catalog = await loadCatalog();
    const variant = catalog.devices[device][battery];
    const release = (variant.versions || []).find((v) => v.version === version);
    if (!release || release.channel !== "candidate") throw new Error(`Release ${version} is not a candidate.`);
    variant.candidateVersion = version;
    await ghPutJson("catalog.json", catalog, `Catalog: set candidate ${device}/${battery} = v${version}`);
    await publishCandidateManifest(catalog, `Candidate manifest: set ${device}/${battery} candidate = v${version}`);
    toast(`${device} / ${battery} candidate is now v${version}.`, "ok");
    renderVersions(catalog);
  } catch (e) {
    toast("Failed: " + e.message, "err");
    refreshManage();
  }
}

el("clearCandidateBtn").addEventListener("click", async () => {
  const device = el("mgDevice").value;
  const battery = el("mgBattery").value;
  if (!Token.has()) { toast("Add a GitHub token in Settings first.", "err"); return; }
  if (!confirm(`Clear the selected Candidate for ${device} / ${battery}? Test updaters will no longer receive a candidate for it.`)) return;
  try {
    const catalog = await loadCatalog();
    const variant = catalog.devices[device][battery];
    variant.candidateVersion = "";
    await ghPutJson("catalog.json", catalog, `Catalog: clear candidate ${device}/${battery}`);
    await publishCandidateManifest(catalog, `Candidate manifest: clear ${device}/${battery}`);
    toast(`Cleared the ${device} / ${battery} candidate.`, "ok");
    renderVersions(catalog);
  } catch (e) {
    toast("Failed: " + e.message, "err");
    refreshManage();
  }
});

/* ---------------- Init ---------------- */
function afterLogin() {
  fillSelect(el("upDevice"), CONFIG.devices);
  fillSelect(el("upBattery"), CONFIG.batteries);
  fillSelect(el("mgDevice"), CONFIG.devices);
  fillSelect(el("mgBattery"), CONFIG.batteries);
  updateUploadChannelUi();
  updateBanner();
  if (Token.has()) el("tokenStatus").textContent = "A token is stored in this browser.";
}

// Keep the session unlocked on reload within the same tab.
if (sessionStorage.getItem("ssiot_authed") === "1") { showApp(); afterLogin(); }
