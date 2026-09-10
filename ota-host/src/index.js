const FIRMWARE_PATH =
  /^\/firmware\/4g-iot\/(daly|bestway|bestway-80v)\/[A-Za-z0-9._-]+\.bin$/;
const RELEASE_INDEX_PATH = "/release-index.json";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isFirmware = FIRMWARE_PATH.test(url.pathname);
    const isReleaseIndex = url.pathname === RELEASE_INDEX_PATH;
    if (
      (request.method !== "GET" && request.method !== "HEAD") ||
      (!isFirmware && !isReleaseIndex)
    ) {
      return new Response("Not found", { status: 404 });
    }
    const asset = await env.ASSETS.fetch(
      new Request(new URL(url.pathname, url.origin), { method: "GET" }),
    );
    if (!asset.ok) return new Response("Firmware unavailable", { status: 404 });
    const bytes = await asset.arrayBuffer();
    return new Response(request.method === "HEAD" ? null : bytes, {
      status: 200,
      headers: {
        "Cache-Control": isFirmware
          ? "public, max-age=31536000, immutable"
          : "no-store",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": isFirmware
          ? "application/octet-stream"
          : "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
