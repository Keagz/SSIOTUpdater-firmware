const FIRMWARE_PATH = /^\/firmware\/(4g-iot|voltmeter)\/(daly|bestway|bestway-80v)\/[A-Za-z0-9._-]+\.bin$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((request.method !== "GET" && request.method !== "HEAD") || !FIRMWARE_PATH.test(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }
    const asset = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), { method: "GET" }));
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
