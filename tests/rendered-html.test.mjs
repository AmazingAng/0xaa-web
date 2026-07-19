import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
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
  assert.match(fableHtml, /FABLE/);
  assert.match(fableHtml, /Claude Fable 正在构建这颗节点/);
  assert.match(fableHtml, /href="\/gpt-5-6-Terra"/);
  assert.match(fableHtml, /href="\/fable-5"/);
});

test("keeps the homepage content and external profiles behind the cleared gate", async () => {
  const [page, globalsCss, modelSwitcher, gptRoute, fableRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ModelSwitcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/gpt-5-6-Terra/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-5/page.tsx", import.meta.url), "utf8"),
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
  assert.match(fableRoute, /ModelSwitcher/);
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
  const [component, generator, packageJson, rawMeta, bin] = await Promise.all([
    readFile(new URL("../app/ParticlePortrait.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-portrait-points.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/generated/portrait-points.meta.json", import.meta.url), "utf8"),
    readFile(new URL("../public/portrait-points.bin", import.meta.url)),
  ]);
  const meta = JSON.parse(rawMeta);

  assert.equal(meta.version, 2);
  assert.equal(meta.stride, 7);
  assert.ok(meta.lod.mobile >= 12_000);
  assert.ok(meta.lod.desktop >= 30_000);
  assert.ok(meta.lod.desktop >= meta.lod.mobile);
  assert.ok(meta.count >= meta.lod.desktop);
  assert.equal(meta.channels.length, meta.stride);
  assert.ok(meta.channels.every((channel) => Number.isFinite(channel.min) && Number.isFinite(channel.range)));
  assert.equal(typeof meta.sourceHash, "string");
  assert.equal(meta.bin, "/portrait-points.bin");
  // The binary asset is count * stride Uint16 (2-byte) little-endian values.
  assert.equal(bin.byteLength, meta.count * meta.stride * 2);

  // The component only statically imports the small meta JSON, not the large
  // points array — the .bin is fetched lazily at runtime.
  assert.match(component, /from "\.\/generated\/portrait-points\.meta\.json"/);
  assert.doesNotMatch(component, /from "\.\/generated\/portrait-points\.json"/);
  assert.doesNotMatch(component, /getImageData|new Image\(|0xaa\.png/);
  assert.match(component, /fetch\(/);
  assert.match(component, /dequantizePoints/);
  assert.match(component, /aPhase/);
  assert.match(component, /uPulseProgress/);
  assert.match(component, /float microDiameter/);
  assert.match(component, /float anchorTier/);
  assert.match(component, /varying float vAnchor/);
  assert.match(component, /geometry\.setDrawRange/);
  assert.match(component, /prefers-reduced-motion/);
  assert.match(generator, /static\/0xaa-particle-reference\.png/);
  assert.match(generator, /const sampleStep = 1/);
  assert.match(packageJson, /"generate:portrait": "node scripts\/generate-portrait-points\.mjs"/);
  assert.match(packageJson, /"build": "npm run generate:portrait/);
});
