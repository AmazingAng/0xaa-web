import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const QUANTIZED_MAX = 65535;

const assertBinaryAssetPath = (value, label) => {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(
    value,
    /^\/[a-z0-9][a-z0-9._-]*\.bin$/i,
    `${label} must be a public .bin path`,
  );
  return value;
};

const contentHash = (payload) =>
  createHash("sha256").update(payload).digest("hex").slice(0, 16);

const decodePointCloudStats = (payload, meta, pointCount, label) => {
  assert.equal(
    payload.byteLength,
    pointCount * meta.stride * 2,
    `${label} must contain exactly count × stride little-endian Uint16 values`,
  );

  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const stats = Array.from({ length: meta.stride }, () => ({
    min: Infinity,
    max: -Infinity,
  }));
  const uniquePositions = new Set();

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const quantizedPoint = [];

    for (let channelIndex = 0; channelIndex < meta.stride; channelIndex += 1) {
      const byteOffset = (pointIndex * meta.stride + channelIndex) * 2;
      const quantized = view.getUint16(byteOffset, true);
      const { min, range } = meta.channels[channelIndex];
      const value = min + (quantized / QUANTIZED_MAX) * range;

      assert.ok(
        Number.isFinite(value),
        `${label} channel ${channelIndex} must decode to a finite value`,
      );
      stats[channelIndex].min = Math.min(stats[channelIndex].min, value);
      stats[channelIndex].max = Math.max(stats[channelIndex].max, value);
      quantizedPoint.push(quantized);
    }

    uniquePositions.add(`${quantizedPoint[0]}:${quantizedPoint[1]}`);
  }

  for (let channelIndex = 0; channelIndex < meta.stride; channelIndex += 1) {
    const span = stats[channelIndex].max - stats[channelIndex].min;
    assert.ok(
      span > Math.max(meta.channels[channelIndex].range * 0.015, 0.0001),
      `${label} channel ${channelIndex} must retain meaningful variation after UInt16LE decoding`,
    );
  }

  assert.ok(
    uniquePositions.size > Math.min(pointCount * 0.25, 2_000),
    `${label} must contain a spatially varied portrait rather than repeated points`,
  );

  const [x, y, z, size, opacity, lightness, phase] = stats;
  assert.ok(
    x.min >= -0.01 && x.max <= 1.01 && x.max - x.min > 0.3,
    `${label} x positions are invalid`,
  );
  assert.ok(
    y.min >= -0.01 && y.max <= 1.01 && y.max - y.min > 0.3,
    `${label} y positions are invalid`,
  );
  assert.ok(
    Math.abs(z.min) < 0.2 && Math.abs(z.max) < 0.2 && z.max - z.min > 0.003,
    `${label} depth is invalid`,
  );
  assert.ok(
    size.min > 0 && size.max < 8 && size.max - size.min > 0.1,
    `${label} particle sizes are invalid`,
  );
  assert.ok(
    opacity.min >= 0 && opacity.max <= 1.1 && opacity.max - opacity.min > 0.05,
    `${label} particle opacity is invalid`,
  );
  assert.ok(
    lightness.min >= 0 &&
      lightness.max <= 1.1 &&
      lightness.max - lightness.min > 0.05,
    `${label} particle lightness is invalid`,
  );
  assert.ok(
    phase.min >= 0 &&
      phase.max <= Math.PI * 2 + 0.05 &&
      phase.max - phase.min > 1,
    `${label} particle phases are invalid`,
  );

  return stats;
};

let workerImportSequence = 0;

const loadWorker = async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${workerImportSequence}`,
  );
  workerImportSequence += 1;
  const { default: worker } = await import(workerUrl.href);
  return worker;
};

const createExecutionContext = () => ({
  waitUntil() {},
  passThroughOnException() {},
});

const createDistClientBinaryAssets = () => {
  const clientRoot = new URL("../dist/client/", import.meta.url);
  const requestedPaths = [];

  return {
    requestedPaths,
    binding: {
      fetch: async (request) => {
        const assetUrl = new URL(request.url);
        const assetPath = assetUrl.pathname;
        const assetName = assetPath.slice(1);
        requestedPaths.push(assetPath);

        // This is intentionally a pathname lookup: Cloudflare's ASSETS
        // binding receives the resolved public-file path after route matching.
        if (!/^[a-z0-9][a-z0-9._-]*\.bin$/i.test(assetName)) {
          return new Response("Not found", { status: 404 });
        }

        try {
          const payload = await readFile(new URL(assetName, clientRoot));
          return new Response(payload, {
            headers: { "content-type": "application/octet-stream" },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  };
};

async function render(path = "/") {
  const worker = await loadWorker();

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    createExecutionContext(),
  );
}

test("server-renders the signal-defense gate before the homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>0xAA — Neural Monolith<\/title>/i);
  assert.match(html, /0xAA 神经拦截器/);
  assert.match(html, /初始化中/);
  assert.match(html, /声音(?:<!-- -->|\s)*开/);
  assert.match(html, /拖动 · 自动射击/);
  assert.doesNotMatch(html, /Computational Neuroscience Ph\.D\./);
  assert.doesNotMatch(html, /WTF Academy/);
  assert.doesNotMatch(html, /class="portrait-field"/);
  assert.doesNotMatch(html, /class="portrait-particle-canvas"/);
  assert.doesNotMatch(html, /POINT CLOUD \/ INITIALIZING/);
  assert.doesNotMatch(html, /src="\/0xaa\.png"/);
});

test("keeps model-specific home routes ready for comparison", async () => {
  const [gptResponse, fableResponse] = await Promise.all([
    render("/gpt-5-6-Terra"),
    render("/fable-5"),
  ]);

  assert.equal(gptResponse.status, 200);
  assert.match(await gptResponse.text(), /0xAA 神经拦截器/);

  assert.equal(fableResponse.status, 200);
  const fableHtml = await fableResponse.text();
  assert.match(fableHtml, /FABLE 5/);
  // The Fable node now server-renders its own opening game gate.
  assert.match(fableHtml, /突触绽放/);
  assert.match(fableHtml, /初始化神经星云/);
  assert.match(fableHtml, /声音(?:<!-- -->|\s)*开/);
  assert.match(fableHtml, /href="\/gpt-5-6-Terra"/);
  assert.match(fableHtml, /href="\/fable-5"/);
  // Homepage content stays behind the Fable gate.
  assert.doesNotMatch(fableHtml, /WTF Academy/);
  assert.doesNotMatch(fableHtml, /class="fable-site"/);
});

test("keeps the homepage content and external profiles behind the cleared gate", async () => {
  const [page, globalsCss, modelSwitcher, gptRoute, fableRoute, fableHome] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ModelSwitcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/gpt-5-6-Terra/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-5/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-5/FableHome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /WTF Academy/);
  assert.match(page, /xAPI/);
  assert.match(page, /PolyWorld/);
  assert.match(page, /auth2api/);
  assert.match(page, /xapi-cli/);
  assert.match(page, /https:\/\/x\.com\/0xAA_Science/);
  assert.match(page, /https:\/\/scholar\.google\.com\/citations\?user=raXwI1QAAAAJ&hl=en/);
  assert.match(page, /const ParticlePortrait = dynamic\(\(\) => import\("\.\/ParticlePortrait"\), \{ ssr: false \}\)/);
  assert.match(page, /const \[language, setLanguage\] = useState<Language>\("zh"\)/);
  assert.match(page, /<OpeningGame onComplete=\{unlockNode\} language=\{language\} onLanguageChange=\{setLanguage\} \/>/);
  assert.match(page, /home-reveal-curtain/);
  assert.match(page, /isHomeRevealed/);
  assert.match(page, /language-switch/);
  assert.match(page, /<ModelSwitcher/);
  assert.match(page, /<p>\{field\.copy\}<\/p>\s*\{field\.project/);
  assert.doesNotMatch(page, /Computational Neuroscience Ph\.D\./);
  assert.doesNotMatch(page, /NODE_00 \/ NEURAL MONOLITH/);
  assert.doesNotMatch(page, /class="portrait-slab"/);
  // The home-reveal curtain/rise-in animation styles moved out of an inline
  // <style> tag in page.tsx into globals.css.
  assert.doesNotMatch(page, /const homeRevealStyles/);
  assert.doesNotMatch(page, /<style>\{homeRevealStyles\}<\/style>/);
  assert.match(globalsCss, /home-reveal-portrait/);
  assert.match(globalsCss, /@keyframes home-reveal-curtain/);
  assert.match(globalsCss, /\.home-reveal\.is-revealed \.hero-portrait/);
  assert.match(modelSwitcher, /\/gpt-5-6-Terra/);
  assert.match(modelSwitcher, /\/fable-5/);
  assert.match(gptRoute, /import Home from "\.\.\/page"/);
  assert.match(fableRoute, /FableExperience/);
  // The Fable home mirrors the same profile facts behind its own gate.
  assert.match(fableHome, /WTF Academy/);
  assert.match(fableHome, /xAPI/);
  assert.match(fableHome, /PolyWorld/);
  assert.match(fableHome, /auth2api/);
  assert.match(fableHome, /xapi-cli/);
  assert.match(fableHome, /https:\/\/x\.com\/0xAA_Science/);
  assert.match(fableHome, /https:\/\/scholar\.google\.com\/citations\?user=raXwI1QAAAAJ&hl=en/);
  assert.match(fableHome, /ModelSwitcher/);
  assert.match(fableHome, /const FablePortrait = dynamic\(\(\) => import\("\.\/FablePortrait"\), \{ ssr: false \}\)/);
});

test("keeps the Fable gate resource-bounded and dynamically isolated", async () => {
  const [gate, renderer, audio, portrait, experience] = await Promise.all([
    readFile(new URL("../app/fable-5/FableGate.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-5/fableGateRenderer.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-5/fableAudio.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-5/FablePortrait.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-5/FableExperience.tsx", import.meta.url), "utf8"),
  ]);

  // Simulation stays bounded and free of direct Three.js imports.
  assert.match(gate, /const TARGET_CHARGE = 12/);
  assert.match(gate, /const MAX_ACTIVE_SYNAPSES = 5/);
  assert.match(gate, /const MAX_ACTIVE_NOISE = 4/);
  assert.match(gate, /const MAX_TRANSFERS = 4/);
  assert.match(gate, /const INVULN_SECONDS = 1\.2/);
  assert.match(gate, /const MAX_SIM_DELTA = 0\.05/);
  assert.match(gate, /const VICTORY_EXIT_DURATION = 620/);
  assert.match(gate, /await import\("\.\/fableGateRenderer"\)|import\("\.\/fableGateRenderer"\)/);
  assert.match(gate, /createFableGateAudio/);
  assert.match(gate, /visibilitychange/);
  assert.match(gate, /cancelAnimationFrame/);
  assert.match(gate, /prefers-reduced-motion/);
  assert.match(gate, /visualViewport/);
  assert.doesNotMatch(gate, /from "three"|WebGLRenderer|new Image\(/);

  // Renderer pools its objects and caps pixel ratio + frame rate.
  assert.match(renderer, /import \* as THREE from "three"/);
  assert.match(renderer, /const SYNAPSE_POOL = 6/);
  assert.match(renderer, /const NOISE_POOL = 4/);
  assert.match(renderer, /const DUST_COUNT = 260/);
  assert.match(renderer, /const BURST_COUNT = 72/);
  assert.match(renderer, /const SOCKET_COUNT = 12/);
  assert.match(renderer, /const PIXEL_RATIO_CAP = 1\.25/);
  assert.match(renderer, /const MOBILE_PIXEL_RATIO_CAP = 1/);
  assert.match(renderer, /const GATE_RENDER_RATE = 45/);
  assert.match(renderer, /powerPreference: "low-power"/);
  assert.match(renderer, /renderer\.dispose/);
  assert.match(renderer, /renderer\.forceContextLoss/);
  assert.doesNotMatch(renderer, /TextureLoader|EffectComposer|PointLight/);

  // Procedural audio only — no shipped audio files.
  assert.match(audio, /export const createFableGateAudio/);
  assert.match(audio, /CUE_COOLDOWNS_MS/);
  assert.match(audio, /AudioContext/);
  assert.match(audio, /setMuted/);
  assert.match(audio, /dispose/);
  assert.doesNotMatch(audio, /new Audio\(|\.mp3|\.wav|\.ogg/);

  // The Fable portrait reuses the precomputed point-cloud binaries.
  assert.match(portrait, /from "\.\.\/generated\/portrait-points\.meta\.json"/);
  assert.match(portrait, /fetch\(/);
  assert.match(portrait, /prefers-reduced-motion/);
  assert.match(portrait, /forceContextLoss/);
  assert.doesNotMatch(portrait, /getImageData|new Image\(|0xaa\.png/);

  // The gate persists per-session and shares the language preference.
  assert.match(experience, /0xaa:fable-gate-cleared/);
  assert.match(experience, /0xaa:lang/);
  assert.match(experience, /sessionStorage/);
});

test("keeps the Three.js opening game resource-bounded and dynamically isolated", async () => {
  const [openingGame, renderer] = await Promise.all([
    readFile(new URL("../app/OpeningGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/openingGameRenderer.ts", import.meta.url), "utf8"),
  ]);

  assert.match(openingGame, /const MAX_RENDER_RATE = 30/);
  assert.match(openingGame, /const MAX_ENEMIES = 12/);
  assert.match(openingGame, /const MAX_PLAYER_PROJECTILES = 18/);
  assert.match(openingGame, /const MAX_ENEMY_PROJECTILES = 10/);
  assert.match(openingGame, /const MAX_SPARKS = 48/);
  assert.match(openingGame, /const MAX_ASTEROIDS = 6/);
  assert.match(openingGame, /const AUTO_FIRE_INTERVAL = 165/);
  assert.match(openingGame, /const PLAYER_MIN_X = 0\.14/);
  assert.match(openingGame, /const PLAYER_MAX_X = 0\.86/);
  assert.match(openingGame, /const CORE_ENTRY_AT = 5\.8/);
  assert.match(openingGame, /const BOSS_SEQUENCE = \["core", "warden", "archon"\]/);
  assert.match(openingGame, /export type OpeningGameLanguage = "zh" \| "en"/);
  assert.match(openingGame, /const gameCopy: Record<OpeningGameLanguage/);
  assert.match(openingGame, /const BOSS_RESPITE_SECONDS = 1\.1/);
  assert.match(openingGame, /const VICTORY_HOLD_DURATION = 1450/);
  assert.match(openingGame, /const VICTORY_EXIT_DURATION = 640/);
  assert.match(openingGame, /const missionScript/);
  assert.match(openingGame, /forwardDistance/);
  assert.match(openingGame, /playerY/);
  assert.match(openingGame, /advanceMission/);
  assert.match(openingGame, /spawnAsteroid/);
  assert.match(openingGame, /getEnemyVisualScale/);
  assert.match(openingGame, /projectileHitsEnemy/);
  assert.match(openingGame, /halfWidth/);
  assert.match(openingGame, /halfHeight/);
  assert.match(openingGame, /fireBossVolley/);
  assert.match(openingGame, /bossVolleyPatterns/);
  assert.match(openingGame, /velocityX/);
  assert.match(openingGame, /TAP TO ENTER/);
  assert.match(openingGame, /DRAG · AUTO FIRE/);
  assert.match(openingGame, /AUTO FIRE/);
  assert.match(openingGame, /createOpeningGameAudio/);
  assert.match(openingGame, /SND/);
  assert.match(openingGame, /firePlayerShot\(world\)/);
  assert.match(openingGame, /visualViewport/);
  assert.match(openingGame, /opening-game-tap-target/);
  assert.match(openingGame, /opening-game-victory/);
  assert.match(openingGame, /is-exiting/);
  assert.match(openingGame, /await import\("\.\/openingGameRenderer"\)/);
  assert.match(openingGame, /visibilitychange/);
  assert.match(openingGame, /cancelAnimationFrame/);
  assert.match(openingGame, /prefers-reduced-motion/);
  assert.doesNotMatch(openingGame, /from "three"|WebGLRenderer|new Image\(/);
  assert.match(renderer, /import \* as THREE from "three"/);
  assert.match(renderer, /const STAR_COUNT = 280/);
  assert.match(renderer, /const MAX_ASTEROIDS = 6/);
  assert.match(renderer, /const PIXEL_RATIO_CAP = 1\.25/);
  assert.match(renderer, /const MOBILE_PIXEL_RATIO_CAP = 1/);
  assert.match(renderer, /compactRenderer/);
  assert.match(renderer, /const activeStarCount = compactRenderer \? 96 : 136/);
  assert.match(renderer, /const activeStarStreakCount = compactRenderer \? 10 : 18/);
  assert.match(renderer, /const activeTunnelRingCount = compactRenderer \? 2 : 3/);
  assert.match(renderer, /starStreaks\.visible = speedScale > 1/);
  assert.match(renderer, /scoutFramePoints/);
  assert.match(renderer, /sweepFramePoints/);
  assert.match(renderer, /sentinelShellPoints/);
  assert.match(renderer, /wardenFramePoints/);
  assert.match(renderer, /archonFramePoints/);
  assert.match(renderer, /coreShellPoints/);
  assert.match(renderer, /const isBossKind/);
  assert.match(renderer, /const VICTORY_FRAGMENT_COUNT = 12/);
  assert.match(renderer, /updateVictorySignal/);
  assert.match(renderer, /node\.group\.rotation\.set\(0, 0, bank\)/);
  assert.match(renderer, /const shotApproach/);
  assert.match(renderer, /let actionSpan = 6\.2/);
  assert.match(renderer, /safePlayerCenter/);
  assert.match(renderer, /tunnelRingMesh\.instanceMatrix/);
  assert.match(renderer, /new THREE\.WebGLRenderer/);
  assert.match(renderer, /powerPreference: "low-power"/);
  assert.match(renderer, /renderer\.forceContextLoss/);
  assert.match(renderer, /renderer\.dispose/);
  assert.doesNotMatch(renderer, /FLOW_LANE_COUNT|updateFlowGuides|EffectComposer|TextureLoader|PointLight/);
});

test("ships a gesture-gated procedural game soundtrack without external audio assets", async () => {
  const audio = await readFile(new URL("../app/openingGameAudio.ts", import.meta.url), "utf8");

  assert.match(audio, /export const createOpeningGameAudio/);
  assert.match(audio, /MUSIC_STEP_SECONDS/);
  assert.match(audio, /CUE_COOLDOWNS/);
  assert.match(audio, /AudioContext/);
  assert.match(audio, /start: \(\) => Promise<boolean>/);
  assert.match(audio, /setMuted/);
  assert.match(audio, /dispose/);
  assert.doesNotMatch(audio, /new Audio\(|\.mp3|\.wav|\.ogg/);
});

test("ships a precomputed point cloud instead of runtime image sampling", async () => {
  const [component, generator, packageJson, rawMeta] = await Promise.all([
    readFile(new URL("../app/ParticlePortrait.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../scripts/generate-portrait-points.mjs", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(
      new URL("../app/generated/portrait-points.meta.json", import.meta.url),
      "utf8",
    ),
  ]);
  const meta = JSON.parse(rawMeta);

  assert.equal(meta.version, 2);
  assert.equal(meta.stride, 7);
  assert.ok(Number.isFinite(meta.aspectRatio) && meta.aspectRatio > 0);
  assert.ok(meta.lod && typeof meta.lod === "object");
  assert.ok(Number.isInteger(meta.lod.mobile) && meta.lod.mobile > 0);
  assert.ok(
    Number.isInteger(meta.lod.desktop) && meta.lod.desktop >= meta.lod.mobile,
  );
  assert.ok(meta.lod.mobile >= 12_000);
  assert.ok(meta.lod.desktop >= 30_000);
  assert.ok(Number.isInteger(meta.count) && meta.count >= meta.lod.desktop);
  assert.ok(Array.isArray(meta.channels));
  assert.equal(meta.channels.length, meta.stride);
  assert.ok(
    meta.channels.every(
      (channel) =>
        Number.isFinite(channel.min) &&
        Number.isFinite(channel.range) &&
        channel.range > 0,
    ),
  );
  assert.equal(typeof meta.sourceHash, "string");
  assert.ok(meta.sourceHash.trim().length > 0);
  assert.equal(typeof meta.mobileHash, "string");
  assert.ok(meta.mobileHash.trim().length > 0);

  const publicRoot = new URL("../public/", import.meta.url);
  const productionRoot = new URL("../dist/client/", import.meta.url);
  const desktopAssetPath = assertBinaryAssetPath(
    meta.bin,
    "desktop point-cloud asset",
  );
  const mobileAssetPath = assertBinaryAssetPath(
    meta.mobileBin,
    "mobile point-cloud asset",
  );
  assert.notEqual(desktopAssetPath, mobileAssetPath);
  assert.ok(
    desktopAssetPath.includes(meta.sourceHash),
    "desktop meta.bin must use the desktop content hash in its immutable pathname",
  );
  assert.ok(
    mobileAssetPath.includes(meta.mobileHash),
    "mobile meta.mobileBin must use the mobile content hash in its immutable pathname",
  );

  const [bin, mobileBin, emittedBin, emittedMobileBin] = await Promise.all([
    readFile(new URL(desktopAssetPath.slice(1), publicRoot)),
    readFile(new URL(mobileAssetPath.slice(1), publicRoot)),
    readFile(new URL(desktopAssetPath.slice(1), productionRoot)),
    readFile(new URL(mobileAssetPath.slice(1), productionRoot)),
  ]);

  // The desktop and mobile payloads are exact Uint16LE point records. The
  // mobile payload contains just the LOD subset, so mobile clients do not need
  // to download or upload the remaining desktop-only points.
  decodePointCloudStats(bin, meta, meta.count, "desktop point cloud");
  decodePointCloudStats(mobileBin, meta, meta.lod.mobile, "mobile point cloud");
  assert.equal(meta.sourceHash, contentHash(bin));
  assert.equal(meta.mobileHash, contentHash(mobileBin));
  assert.deepEqual(
    mobileBin,
    bin.subarray(0, mobileBin.byteLength),
    "the mobile binary must be the first LOD records of the desktop binary",
  );

  // `npm run test` builds before executing this file. These checks ensure both
  // runtime-fetched public assets were actually copied into the production
  // client output, rather than only existing in the source public/ directory.
  assert.deepEqual(emittedBin, bin);
  assert.deepEqual(emittedMobileBin, mobileBin);

  // The component only statically imports the small meta JSON, not the large
  // points array — the .bin is fetched lazily at runtime.
  assert.match(component, /from "\.\/generated\/portrait-points\.meta\.json"/);
  assert.doesNotMatch(component, /from "\.\/generated\/portrait-points\.json"/);
  assert.doesNotMatch(component, /getImageData|new Image\(|0xaa\.png/);
  assert.match(component, /fetch\(/);
  assert.match(component, /dequantizePoints/);
  assert.match(component, /mobileBin/);
  assert.match(
    component,
    /const desktopAsset: PointCloudAsset = \{\s*bin: pointCloudMeta\.bin,\s*pointCount: pointCloudMeta\.lod\.desktop,\s*assetCount: pointCloudMeta\.count,\s*\};/,
  );
  assert.match(
    component,
    /const mobileAsset: PointCloudAsset \| null = hasMobilePointCloudAsset\(pointCloudMeta\)\s*\? \{\s*bin: pointCloudMeta\.mobileBin,\s*pointCount: pointCloudMeta\.lod\.mobile,\s*assetCount: pointCloudMeta\.lod\.mobile,\s*\}\s*:\s*null;/,
  );
  assert.match(
    component,
    /const response = await fetch\(asset\.bin, \{ signal: abortController\.signal \}\);/,
  );
  assert.match(
    component,
    /if \(canFallbackToDesktop && !mobileFallbackStarted\) \{\s*mobileFallbackStarted = true;\s*void loadPointCloud\(desktopAsset, false\);/,
  );
  assert.match(component, /aPhase/);
  assert.match(component, /uPulseProgress/);
  assert.match(component, /float microDiameter/);
  assert.match(component, /float anchorTier/);
  assert.match(component, /varying float vAnchor/);
  assert.match(component, /geometry\.setDrawRange/);
  assert.match(component, /prefers-reduced-motion/);
  assert.match(generator, /static\/0xaa-particle-reference\.png/);
  assert.match(generator, /const sampleStep = 1/);
  assert.match(generator, /contentHash\(bin\)/);
  assert.match(generator, /contentHash\(mobileBin\)/);
  assert.match(generator, /const desktopAssetName = `[^`]*\$\{sourceHash\}[^`]*`/);
  assert.match(generator, /const mobileAssetName = `[^`]*\$\{mobileHash\}[^`]*`/);
  assert.match(generator, /const mobileBin = bin\.subarray\(0, mobile\.length \* pointStride \* 2\)/);
  assert.match(
    packageJson,
    /"generate:portrait": "node scripts\/generate-portrait-points\.mjs"/,
  );
  assert.match(packageJson, /"predev": "npm run generate:portrait"/);
  assert.match(packageJson, /"build": "npm run generate:portrait/);
});

test("serves the current versioned point-cloud payloads through Worker assets", async () => {
  const rawMeta = await readFile(
    new URL("../app/generated/portrait-points.meta.json", import.meta.url),
    "utf8",
  );
  const meta = JSON.parse(rawMeta);
  const productionRoot = new URL("../dist/client/", import.meta.url);
  const assets = [
    {
      label: "desktop",
      path: assertBinaryAssetPath(meta.bin, "desktop point-cloud asset"),
      hash: meta.sourceHash,
    },
    {
      label: "mobile",
      path: assertBinaryAssetPath(meta.mobileBin, "mobile point-cloud asset"),
      hash: meta.mobileHash,
    },
  ];

  for (const asset of assets) {
    assert.equal(typeof asset.hash, "string", `${asset.label} content hash must be a string`);
    assert.ok(asset.hash.length > 0, `${asset.label} content hash must not be empty`);
    assert.ok(
      asset.path.includes(asset.hash),
      `${asset.label} asset path must identify the same content hash as meta`,
    );
  }

  const { binding, requestedPaths } = createDistClientBinaryAssets();
  const worker = await loadWorker();

  for (const asset of assets) {
    const requestUrl = new URL(asset.path, "http://localhost");
    requestUrl.searchParams.set("v", asset.hash);
    const expectedPayload = await readFile(
      new URL(asset.path.slice(1), productionRoot),
    );
    const response = await worker.fetch(
      new Request(requestUrl.href, {
        headers: { accept: "application/octet-stream" },
      }),
      { ASSETS: binding },
      createExecutionContext(),
    );

    assert.equal(
      response.status,
      200,
      `${asset.label} meta path must resolve with ?v=<content-hash>`,
    );
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      new Uint8Array(
        expectedPayload.buffer,
        expectedPayload.byteOffset,
        expectedPayload.byteLength,
      ),
      `${asset.label} Worker response must be byte-identical to dist/client`,
    );
  }

  assert.deepEqual(
    requestedPaths,
    assets.map(({ path }) => path),
    "the Worker must resolve both versioned requests to their meta asset pathnames",
  );
});

test("keeps legacy v2 point-cloud assets available during the asset-path migration", async () => {
  const legacyPaths = ["/portrait-points.bin", "/portrait-points.mobile.bin"];
  const productionRoot = new URL("../dist/client/", import.meta.url);
  const { binding } = createDistClientBinaryAssets();
  const worker = await loadWorker();

  for (const legacyPath of legacyPaths) {
    const [legacySource, legacyBuild] = await Promise.all([
      readFile(new URL(`../public${legacyPath}`, import.meta.url)),
      readFile(new URL(legacyPath.slice(1), productionRoot)),
    ]);

    assert.deepEqual(
      legacyBuild,
      legacySource,
      "the legacy fixed asset must remain available for already-loaded v2 clients",
    );

    const response = await worker.fetch(
      new Request(`http://localhost${legacyPath}?v=legacy-v2`),
      { ASSETS: binding },
      createExecutionContext(),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      new Uint8Array(legacySource.buffer, legacySource.byteOffset, legacySource.byteLength),
    );
  }
});
