import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(repoRoot, "ota-host", "public");
const catalog = JSON.parse(
  await readFile(join(repoRoot, "catalog.json"), "utf8"),
);
const manifests = {
  production: JSON.parse(
    await readFile(join(repoRoot, "manifest.json"), "utf8"),
  ),
  candidate: JSON.parse(
    await readFile(join(repoRoot, "candidate-manifest.json"), "utf8"),
  ),
};
const allowedArtifact =
  /^firmware\/4g-iot\/(daly|bestway|bestway-80v)\/[A-Za-z0-9._-]+\.bin$/;
const insideRoot = (path) => {
  const rel = relative(repoRoot, path);
  return (
    rel &&
    !rel.startsWith(`..${sep}`) &&
    rel !== ".." &&
    !rel.includes(`${sep}..${sep}`)
  );
};
const releases = [];
const paths = new Set();
for (const [device, batteries] of Object.entries(catalog.devices ?? {})) {
  if (device !== "4G IOT") continue;
  for (const [battery, variant] of Object.entries(batteries ?? {})) {
    const versions = Array.isArray(variant.versions) ? variant.versions : [];
    for (const release of versions) {
      if (!release || !allowedArtifact.test(release.file ?? ""))
        throw new Error(
          `Invalid artifact path for ${device}/${battery}/${release?.version ?? "unknown"}.`,
        );
      if (!/^(production|candidate)$/.test(release.channel ?? ""))
        throw new Error(
          `Invalid channel for ${device}/${battery}/${release.version}.`,
        );
      if (!/^[A-Fa-f0-9]{64}$/.test(release.sha256 ?? ""))
        throw new Error(`Invalid SHA-256 for ${release.file}.`);
      if (paths.has(release.file))
        throw new Error(`Duplicate catalog artifact path: ${release.file}.`);
      paths.add(release.file);
      const source = resolve(repoRoot, release.file);
      if (!insideRoot(source))
        throw new Error(`Artifact escapes repository: ${release.file}`);
      const info = await stat(source);
      if (info.size !== release.size)
        throw new Error(
          `Size mismatch for ${release.file}: catalog=${release.size}, file=${info.size}.`,
        );
      const bytes = await readFile(source);
      const sha256 = createHash("sha256")
        .update(bytes)
        .digest("hex")
        .toUpperCase();
      if (sha256 !== release.sha256.toUpperCase())
        throw new Error(
          `SHA-256 mismatch for ${release.file}: catalog=${release.sha256}, file=${sha256}.`,
        );
      releases.push({
        device,
        battery,
        channel: release.channel,
        version: release.version,
        file: release.file,
        size: info.size,
        sha256,
        selected:
          (release.channel === "production" &&
            release.version === variant.activeVersion) ||
          (release.channel === "candidate" &&
            release.version === variant.candidateVersion),
      });
    }
    for (const [channel, pointer] of [
      ["production", variant.activeVersion],
      ["candidate", variant.candidateVersion],
    ]) {
      if (!pointer) continue;
      const release = versions.find(
        (entry) => entry.version === pointer && entry.channel === channel,
      );
      if (!release)
        throw new Error(
          `Invalid ${channel} pointer for ${device}/${battery}: ${pointer}.`,
        );
      const manifestRelease = manifests[channel]?.firmware?.[device]?.[battery];
      if (
        !manifestRelease ||
        manifestRelease.version !== release.version ||
        manifestRelease.file !== release.file ||
        manifestRelease.size !== release.size ||
        manifestRelease.sha256?.toUpperCase() !==
          release.sha256.toUpperCase() ||
        manifestRelease.chip !== "esp32s3" ||
        manifestRelease.offset !== "0x10000"
      ) {
        throw new Error(
          `${channel} manifest does not exactly match ${device}/${battery}/${pointer}.`,
        );
      }
    }
  }
}
releases.sort((left, right) => left.file.localeCompare(right.file));
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const release of releases) {
  const destination = resolve(outputRoot, release.file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(repoRoot, release.file), destination, { force: false });
}
await writeFile(
  join(outputRoot, "release-index.json"),
  `${JSON.stringify(releases, null, 2)}\n`,
);
console.log(
  `Prepared and verified ${releases.length} catalogued 4G-IOT OTA artifacts.`,
);
