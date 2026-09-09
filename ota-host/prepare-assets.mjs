import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(repoRoot, "ota-host", "public");
const catalog = JSON.parse(await readFile(join(repoRoot, "catalog.json"), "utf8"));
const allowedArtifact = /^firmware\/(4g-iot|voltmeter)\/(daly|bestway|bestway-80v)\/[A-Za-z0-9._-]+\.bin$/;
const insideRoot = (path) => {
  const rel = relative(repoRoot, path);
  return rel && !rel.startsWith(`..${sep}`) && rel !== ".." && !rel.includes(`${sep}..${sep}`);
};
const selected = [];
for (const [device, batteries] of Object.entries(catalog.devices ?? {})) {
  for (const [battery, variant] of Object.entries(batteries ?? {})) {
    const versions = Array.isArray(variant.versions) ? variant.versions : [];
    for (const [channel, pointer] of [["production", variant.activeVersion], ["candidate", variant.candidateVersion]]) {
      if (!pointer) continue;
      const release = versions.find((entry) => entry.version === pointer && entry.channel === channel);
      if (!release || !allowedArtifact.test(release.file ?? "")) throw new Error(`Invalid ${channel} release for ${device}/${battery}.`);
      const source = resolve(repoRoot, release.file);
      if (!insideRoot(source)) throw new Error(`Artifact escapes repository: ${release.file}`);
      const info = await stat(source);
      if (info.size !== release.size) throw new Error(`Size mismatch for ${release.file}: catalog=${release.size}, file=${info.size}.`);
      selected.push({ device, battery, channel, version: release.version, file: release.file, size: info.size, sha256: release.sha256 });
    }
  }
}
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const release of selected) {
  const destination = resolve(outputRoot, release.file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(repoRoot, release.file), destination, { force: false });
}
await writeFile(join(outputRoot, "release-index.json"), `${JSON.stringify(selected, null, 2)}\n`);
console.log(`Prepared ${selected.length} selected OTA artifacts.`);
