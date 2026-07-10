import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the 0xaa signal homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>0xaa\.xyz — Personal Signal<\/title>/i);
  assert.doesNotMatch(html, /PERSONAL SIGNAL/);
  assert.match(html, /NEUROSCIENCE × WEB3/);
  assert.match(html, /Computational Neuroscience Ph\.D\./);
  assert.match(html, /终生学习/);
  assert.match(html, /MEME/);
  assert.match(html, /PolyWorld/);
  assert.match(html, /auth2api/);
  assert.match(html, /xapi-cli/);
  assert.match(html, /https:\/\/x\.com\/0xAA_Science/);
  assert.match(html, /class="portrait-stage"/);
  assert.match(html, /class="portrait-particle-canvas"/);
  assert.match(html, /POINT CLOUD \/ LOADING/);
  assert.match(html, /property="og:image" content="https:\/\/0xaa\.xyz\/og\.png"/);
  assert.doesNotMatch(html, /src="\/0xaa\.png"/);
});

test("ships a precomputed point cloud instead of runtime image sampling", async () => {
  const [component, generator, packageJson, rawPointCloud] = await Promise.all([
    readFile(new URL("../app/ParticlePortrait.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-portrait-points.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/generated/portrait-points.json", import.meta.url), "utf8"),
  ]);
  const pointCloud = JSON.parse(rawPointCloud);

  assert.equal(pointCloud.version, 1);
  assert.equal(pointCloud.stride, 7);
  assert.ok(pointCloud.lod.mobile > 0);
  assert.ok(pointCloud.lod.desktop >= pointCloud.lod.mobile);
  assert.equal(pointCloud.points.length, pointCloud.lod.desktop * pointCloud.stride);
  assert.match(component, /from "\.\/generated\/portrait-points\.json"/);
  assert.doesNotMatch(component, /getImageData|new Image\(|0xaa\.png/);
  assert.match(generator, /static\/0xaa\.png/);
  assert.match(packageJson, /"generate:portrait": "node scripts\/generate-portrait-points\.mjs"/);
  assert.match(packageJson, /"build": "npm run generate:portrait/);
});
