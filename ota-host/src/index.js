const FIRMWARE_PATH = /^\/firmware\/(4g-iot|voltmeter)\/(daly|bestway|bestway-80v)\/[A-Za-z0-9._-]+\.bin$/;
// Keep the first Bestway OTA pilot command valid while A519 remains selected.
// The alias naturally becomes unavailable when the selected A519 artifact is removed.
const LEGACY_A519_PATH = "/firmware/bestway/A519/A7670-A519.ino.esp32s3.bin";
const SELECTED_A519_PATH = "/firmware/4g-iot/bestway/4g-iot_bestway_A519.bin";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetPath = url.pathname === LEGACY_A519_PATH ? SELECTED_A519_PATH : url.pathname;
    if ((request.method !== "GET" && request.method !== "HEAD") || !FIRMWARE_PATH.test(assetPath)) {
      return new Response("Not found", { status: 404 });
    }
    const asset = await env.ASSETS.fetch(new Request(new URL(assetPath, url.origin), { method: "GET" }));
    if (!asset.ok) return new Response("Firmware unavailable", { status: 404 });
    const bytes = await asset.arrayBuffer();
    return new Response(request.method === "HEAD" ? null : bytes, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
