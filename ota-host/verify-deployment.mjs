import { createHash } from "node:crypto";

const publicHttpBase =
  process.env.OTA_PUBLIC_HTTP_BASE ??
  "http://ssiot-ota-pilot.battery-monitor.workers.dev/";
const releaseIndexUrl =
  process.env.OTA_RELEASE_INDEX_URL ??
  "https://ssiot-ota-pilot.battery-monitor.workers.dev/release-index.json";
const allowedArtifact =
  /^firmware\/4g-iot\/(daly|bestway|bestway-80v)\/[A-Za-z0-9._-]+\.bin$/;

async function directFetch(url) {
  let lastStatus = "network error";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
      });
      lastStatus = `HTTP ${response.status}`;
      if (response.status === 200 && !response.redirected) return response;
      await response.arrayBuffer();
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    `${url} returned ${lastStatus}; a direct 200 response is required after deployment.`,
  );
}

const indexResponse = await directFetch(releaseIndexUrl);
if (
  !indexResponse.headers
    .get("content-type")
    ?.toLowerCase()
    .startsWith("application/json")
)
  throw new Error("The deployed release index is not application/json.");
const releases = await indexResponse.json();
if (!Array.isArray(releases) || releases.length === 0)
  throw new Error("The deployed release index is empty or invalid.");

const seen = new Set();
for (const release of releases) {
  if (!allowedArtifact.test(release.file ?? ""))
    throw new Error(`Invalid release-index artifact path: ${release.file}.`);
  if (seen.has(release.file))
    throw new Error(`Duplicate release-index path: ${release.file}.`);
  seen.add(release.file);
  if (
    !Number.isSafeInteger(release.size) ||
    release.size < 100000 ||
    release.size > 0x140000
  )
    throw new Error(`Invalid release-index size for ${release.file}.`);
  if (!/^[A-Fa-f0-9]{64}$/.test(release.sha256 ?? ""))
    throw new Error(`Invalid release-index SHA-256 for ${release.file}.`);
  if (typeof release.selected !== "boolean")
    throw new Error(`Invalid release-index pointer state for ${release.file}.`);

  const artifactUrl = new URL(release.file, publicHttpBase).href;
  if (!artifactUrl.startsWith("http://"))
    throw new Error(`Artifact URL is not HTTP: ${artifactUrl}.`);
  const response = await directFetch(artifactUrl);
  if (
    response.headers.get("content-type")?.toLowerCase().split(";", 1)[0] !==
    "application/octet-stream"
  )
    throw new Error(`${artifactUrl} is not application/octet-stream.`);
  if (response.headers.get("content-length") !== String(release.size))
    throw new Error(
      `${artifactUrl} Content-Length does not match release-index metadata.`,
    );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== release.size)
    throw new Error(
      `${artifactUrl} downloaded byte length does not match release-index metadata.`,
    );
  const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (sha256 !== release.sha256.toUpperCase())
    throw new Error(
      `${artifactUrl} SHA-256 does not match release-index metadata.`,
    );
  console.log(`Verified ${release.version}: ${artifactUrl}`);
}

console.log(
  `Verified ${releases.length} deployed plain-HTTP OTA artifacts with no redirects.`,
);
