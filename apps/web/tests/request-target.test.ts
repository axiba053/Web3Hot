// Failure cases: an origin-form // path is read as a URL authority and throws a 500; an unknown
// double-slash path becomes a different host's root; HEAD or single-fetch data follows another rule.
import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, test } from "node:test";
import { fakeApi, startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer;
const upstreamPaths: string[] = [];
const api = fakeApi((url, _res, req) => {
  upstreamPaths.push(req.url ?? "");
  if (url.pathname === "/api/site/timeline") return { cards: [], nextCursor: null, dayCounts: {}, hot: [], filters: { category: null, channel: null, tag: null } };
});

before(async () => { web = await startWebServer(api); });
after(() => web.stop());

function raw(path: string, method: "GET" | "HEAD") {
  return new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: web.port, path, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

test("origin-form slashes keep the router's homepage and unknown-route semantics", async () => {
  for (const method of ["GET", "HEAD"] as const) {
    const home = await raw("/", method);
    assert.equal(home.status, 200, web.logs());
    for (const path of ["//", "////", "//?category=protocol"]) {
      const res = await raw(path, method);
      assert.equal(res.status, 200, `${method} ${path}: ${web.logs()}`);
      assert.equal(res.headers["content-type"], home.headers["content-type"]);
      assert.match(res.headers["cache-control"] ?? "", /^public, max-age=\d+, s-maxage=\d+, must-revalidate$/);
      if (method === "HEAD") assert.equal(res.body, "");
    }
    for (const path of ["/unknown-page", "//unknown-page", "//evil.invalid/unknown-page", "//unknown-page.data?token=private"]) {
      const res = await raw(path, method);
      assert.equal(res.status, 404, `${method} ${path}: ${web.logs()}`);
      assert.equal(res.headers["cache-control"], "private, no-store");
      if (method === "HEAD") assert.equal(res.body, "");
    }
  }
  assert.equal(web.logs(), "");
  assert.ok(upstreamPaths.every((path) => path.startsWith("/api/site/")));
});


test("暂停对外接入且不转发到内部 API", async () => {
  for (const path of ["/agent", "/agent.data", "/%61gent", "//agent", "/api/v1/items", "/api/v1/btc-monitor", "/api/mcp", "/feed.xml", "/feed/all.xml", "/llms.txt", "/openapi-v1.json"]) {
    for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
      const response = await fetch(web.origin + path, { method });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      await response.body?.cancel();
    }
  }
  assert.ok(!upstreamPaths.some(path => /^\/api\/(v1|mcp)/.test(path)));
});
