import * as THREE from "three";
import type { PlatformWorld, WorldPhase, FableWorldLanguage } from "./FableWorld";
import {
  BLOCK_SIZE,
  COIN_RADIUS,
  ENEMY_HALF,
  FLAG_X,
  FLOATING_PLATFORMS,
  GROUND_SEGMENTS,
  LEVEL_BLOCKS,
  LEVEL_COINS,
  LEVEL_ENEMIES,
  LEVEL_PORTALS,
  LEVEL_SIGNS,
  LEVEL_END_X,
} from "./fableLevel";

export type FableWorldRenderer = {
  render: (world: PlatformWorld, phase: WorldPhase, reducedMotion: boolean, delta: number) => void;
  resize: () => void;
  setLanguage: (language: FableWorldLanguage) => void;
  dispose: () => void;
};

const PIXEL_RATIO_CAP = 1.25;
const MOBILE_PIXEL_RATIO_CAP = 1;
const DUST_COUNT = 420;
const TRAIL_COUNT = 30;
const BURST_COUNT = 90;
const CAMERA_DISTANCE = 11.5;
const CAMERA_MIN_X = 4;
const CAMERA_LOOKAHEAD = 1.7;

const NIGHT = new THREE.Color("#05060e");
const SLAB = new THREE.Color("#141733");
const SLAB_DARK = new THREE.Color("#0b0d20");
const GOLD = new THREE.Color("#e8c47c");
const GOLD_BRIGHT = new THREE.Color("#f6d79a");
const CREAM = new THREE.Color("#fff3da");
const EMBER = new THREE.Color("#ff9e64");
const TEAL = new THREE.Color("#7ee8d8");
const ROSE = new THREE.Color("#ff4d6d");

const seeded = (index: number, offset = 0) => {
  const value = Math.sin(index * 12.9898 + offset * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const glowVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    float dist = distance(vUv, vec2(0.5));
    float alpha = smoothstep(0.5, 0.02, dist);
    alpha *= alpha;
    gl_FragColor = vec4(uColor, alpha * uIntensity);
  }
`;

const backdropFragmentShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uNight;
  uniform vec3 uGold;
  uniform vec3 uTeal;
  void main() {
    vec2 centered = vUv - vec2(0.5);
    float vignette = smoothstep(0.95, 0.18, length(centered));
    float bloomA = smoothstep(0.75, 0.0, distance(vUv, vec2(0.32 + 0.04 * sin(uTime * 0.09), 0.66)));
    float bloomB = smoothstep(0.62, 0.0, distance(vUv, vec2(0.72, 0.36 + 0.05 * cos(uTime * 0.08))));
    vec3 color = uNight;
    color += uGold * bloomA * 0.11;
    color += uTeal * bloomB * 0.07;
    color *= 0.5 + 0.5 * vignette;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const makeGlowMaterial = (color: THREE.Color, intensity: number) =>
  new THREE.ShaderMaterial({
    vertexShader: glowVertexShader,
    fragmentShader: glowFragmentShader,
    uniforms: {
      uColor: { value: color.clone() },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

// ---- Canvas text textures -------------------------------------------------

const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "STSong", Georgia, serif`;
const MONO = `"SFMono-Regular", "Cascadia Code", Menlo, Monaco, monospace`;
const SANS = `"PingFang SC", "Microsoft YaHei", Inter, system-ui, sans-serif`;

// Wraps text into lines that fit maxWidth: CJK wraps per character, Latin per
// word.
const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const tokens = text.match(/[⺀-鿿豈-﫿＀-￯]|\S+|\s/g) ?? [text];
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const candidate = line + token;
    if (line.length > 0 && context.measureText(candidate).width > maxWidth) {
      lines.push(line.trimEnd());
      line = token.trimStart();
    } else {
      line = candidate;
    }
  }
  if (line.trim().length > 0) lines.push(line.trimEnd());
  return lines;
};

type CardContent = { kicker: string; title: string; body: string; meta?: string };

const makeCardTexture = (content: CardContent, options: { width?: number; accent?: string } = {}) => {
  const width = options.width ?? 1024;
  const accent = options.accent ?? "#e8c47c";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const height = 640;
  canvas.width = width;
  canvas.height = height;
  if (!context) return new THREE.CanvasTexture(canvas);

  context.fillStyle = "rgba(10, 12, 26, 0.94)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(232, 196, 124, 0.55)";
  context.lineWidth = 4;
  context.strokeRect(10, 10, width - 20, height - 20);
  context.strokeStyle = "rgba(232, 196, 124, 0.18)";
  context.lineWidth = 2;
  context.strokeRect(26, 26, width - 52, height - 52);

  const paddingX = 64;
  let cursorY = 118;
  context.fillStyle = "rgba(154, 163, 192, 0.95)";
  context.font = `28px ${MONO}`;
  context.fillText(content.kicker, paddingX, cursorY);

  cursorY += 88;
  context.fillStyle = accent;
  context.font = `72px ${SERIF}`;
  context.fillText(content.title, paddingX, cursorY);

  cursorY += 64;
  context.fillStyle = "rgba(223, 216, 200, 0.95)";
  context.font = `34px ${SANS}`;
  for (const line of wrapText(context, content.body, width - paddingX * 2).slice(0, 4)) {
    context.fillText(line, paddingX, cursorY);
    cursorY += 48;
  }

  if (content.meta) {
    context.fillStyle = "#ff9e64";
    context.font = `30px ${MONO}`;
    context.fillText(content.meta, paddingX, height - 62);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
};

const makeBlockTexture = (used: boolean) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = used ? "rgba(14, 15, 28, 0.98)" : "rgba(20, 20, 40, 0.98)";
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = used ? "rgba(154, 163, 192, 0.3)" : "rgba(232, 196, 124, 0.85)";
  context.lineWidth = 10;
  context.strokeRect(10, 10, 236, 236);
  context.fillStyle = used ? "rgba(154, 163, 192, 0.3)" : "#f6d79a";
  context.font = `150px ${SERIF}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(used ? "·" : "?", 128, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeLabelTexture = (label: string, sub: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 224;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.clearRect(0, 0, 512, 224);
  context.textAlign = "center";
  context.fillStyle = "#f6d79a";
  context.font = `64px ${MONO}`;
  context.fillText(label, 256, 96);
  context.fillStyle = "rgba(154, 163, 192, 0.95)";
  context.font = `36px ${MONO}`;
  context.fillText(sub, 256, 168);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeFlagTexture = (language: FableWorldLanguage) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = "#c2721f";
  context.fillRect(0, 0, 512, 320);
  context.fillStyle = "rgba(5, 6, 14, 0.16)";
  context.fillRect(0, 250, 512, 70);
  context.fillStyle = "#0a0c1a";
  context.textAlign = "center";
  context.font = language === "zh" ? `92px ${SERIF}` : `56px ${SERIF}`;
  context.fillText(language === "zh" ? "未完待续" : "TO BE", 256, language === "zh" ? 178 : 130);
  if (language === "en") context.fillText("CONTINUED", 256, 210);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// ---- Renderer -------------------------------------------------------------

type EnemyVisual = {
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMaterial: THREE.MeshBasicMaterial;
  glowMaterial: THREE.ShaderMaterial;
};

export const createFableWorldRenderer = (
  canvas: HTMLCanvasElement,
  { compact, language }: { compact: boolean; language: FableWorldLanguage },
): FableWorldRenderer => {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !compact,
    alpha: false,
    powerPreference: "low-power",
  });
  const pixelRatioCap = compact ? MOBILE_PIXEL_RATIO_CAP : PIXEL_RATIO_CAP;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(NIGHT.getHex(), 0.02);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.set(CAMERA_MIN_X, 3, CAMERA_DISTANCE);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(resource: T): T => {
    disposables.push(resource);
    return resource;
  };

  // Backdrop nebula quad — repositioned each frame for parallax.
  const backdropMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: glowVertexShader,
      fragmentShader: backdropFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: NIGHT.clone() },
        uGold: { value: GOLD.clone() },
        uTeal: { value: TEAL.clone() },
      },
      depthWrite: false,
      depthTest: false,
    }),
  );
  const backdrop = new THREE.Mesh(track(new THREE.PlaneGeometry(150, 84)), backdropMaterial);
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  // Static dust across the whole level; z-depth provides parallax for free.
  const activeDustCount = compact ? 220 : DUST_COUNT;
  const dustGeometry = track(new THREE.BufferGeometry());
  const dustPositions = new Float32Array(activeDustCount * 3);
  const dustColors = new Float32Array(activeDustCount * 3);
  for (let index = 0; index < activeDustCount; index += 1) {
    dustPositions[index * 3] = -8 + seeded(index, 1) * (LEVEL_END_X + 24);
    dustPositions[index * 3 + 1] = -2 + seeded(index, 2) * 16;
    dustPositions[index * 3 + 2] = -19 + seeded(index, 3) * 16;
    const tint = seeded(index, 4) > 0.75 ? TEAL : GOLD;
    const fade = 0.3 + seeded(index, 5) * 0.7;
    dustColors[index * 3] = tint.r * fade;
    dustColors[index * 3 + 1] = tint.g * fade;
    dustColors[index * 3 + 2] = tint.b * fade;
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dustMaterial = track(
    new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(new THREE.Points(dustGeometry, dustMaterial));

  // Shared materials/geometries.
  const slabMaterial = track(new THREE.MeshBasicMaterial({ color: SLAB }));
  const slabDeepMaterial = track(new THREE.MeshBasicMaterial({ color: SLAB_DARK }));
  const goldStripMaterial = track(new THREE.MeshBasicMaterial({ color: GOLD }));
  const unitBox = track(new THREE.BoxGeometry(1, 1, 1));
  const glowGeometry = track(new THREE.PlaneGeometry(1, 1));

  const addPlatform = (x: number, top: number, width: number, height: number, deep = false) => {
    const body = new THREE.Mesh(unitBox, deep ? slabDeepMaterial : slabMaterial);
    body.scale.set(width, height, 1.6);
    body.position.set(x + width / 2, top - height / 2, 0);
    scene.add(body);
    const strip = new THREE.Mesh(unitBox, goldStripMaterial);
    strip.scale.set(width, 0.06, 1.66);
    strip.position.set(x + width / 2, top - 0.03, 0.02);
    scene.add(strip);
  };
  for (const segment of GROUND_SEGMENTS) addPlatform(segment.x, segment.y, segment.width, segment.height, true);
  for (const platform of FLOATING_PLATFORMS) addPlatform(platform.x, platform.y, platform.width, platform.height);

  // ? blocks + their reveal cards.
  const freshBlockTexture = track(makeBlockTexture(false));
  const usedBlockTexture = track(makeBlockTexture(true));
  const freshBlockMaterial = track(new THREE.MeshBasicMaterial({ map: freshBlockTexture }));
  const usedBlockMaterial = track(new THREE.MeshBasicMaterial({ map: usedBlockTexture }));
  const blockMeshes: THREE.Mesh[] = [];
  const cardMeshes: THREE.Mesh[] = [];
  const cardMaterials: THREE.MeshBasicMaterial[] = [];
  const cardGeometry = track(new THREE.PlaneGeometry(4.6, 4.6 * (640 / 1024)));
  for (const block of LEVEL_BLOCKS) {
    const mesh = new THREE.Mesh(unitBox, freshBlockMaterial);
    mesh.scale.setScalar(BLOCK_SIZE);
    mesh.position.set(block.x, block.y + BLOCK_SIZE / 2, 0);
    scene.add(mesh);
    blockMeshes.push(mesh);

    const material = track(
      new THREE.MeshBasicMaterial({ map: makeCardTexture(block.card[language]), transparent: true, opacity: 0 }),
    );
    const card = new THREE.Mesh(cardGeometry, material);
    card.position.set(block.x, block.y + BLOCK_SIZE + 2.2, -0.8);
    card.visible = false;
    scene.add(card);
    cardMeshes.push(card);
    cardMaterials.push(material);
  }

  // Standing signs (always visible).
  const signMaterials: THREE.MeshBasicMaterial[] = [];
  const signMeshes: THREE.Mesh[] = [];
  for (const sign of LEVEL_SIGNS) {
    const material = track(
      new THREE.MeshBasicMaterial({ map: makeCardTexture(sign.copy[language]), transparent: true, opacity: 0.96 }),
    );
    const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(sign.width, sign.width * (640 / 1024))), material);
    mesh.position.set(sign.x, sign.y, -1.2);
    scene.add(mesh);
    signMaterials.push(material);
    signMeshes.push(mesh);
    const post = new THREE.Mesh(unitBox, slabMaterial);
    post.scale.set(0.14, sign.y, 0.14);
    post.position.set(sign.x, sign.y / 2, -1.25);
    scene.add(post);
  }

  // Coins.
  const coinGeometry = track(new THREE.OctahedronGeometry(COIN_RADIUS, 0));
  const coinMaterial = track(new THREE.MeshBasicMaterial({ color: GOLD_BRIGHT, transparent: true, opacity: 0.95 }));
  const coinMeshes: THREE.Mesh[] = [];
  for (const coin of LEVEL_COINS) {
    const mesh = new THREE.Mesh(coinGeometry, coinMaterial);
    mesh.position.set(coin.x, coin.y, 0);
    scene.add(mesh);
    coinMeshes.push(mesh);
  }

  // Enemies: noise blobs with angry glow.
  const enemyGeometry = track(new THREE.IcosahedronGeometry(ENEMY_HALF.y, 1));
  const enemyVisuals: EnemyVisual[] = [];
  for (let index = 0; index < LEVEL_ENEMIES.length; index += 1) {
    const group = new THREE.Group();
    const bodyMaterial = track(
      new THREE.MeshBasicMaterial({ color: ROSE.clone(), wireframe: true, transparent: true, opacity: 0.95 }),
    );
    const body = new THREE.Mesh(enemyGeometry, bodyMaterial);
    body.scale.set(ENEMY_HALF.x / ENEMY_HALF.y, 1, 1);
    const glowMaterial = track(makeGlowMaterial(ROSE, 0.4));
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.scale.setScalar(1.5);
    group.add(body, glow);
    scene.add(group);
    enemyVisuals.push({ group, body, bodyMaterial, glowMaterial });
  }

  // Portals: standing rings with labels.
  const portalRingGeometry = track(new THREE.TorusGeometry(1.05, 0.06, 10, 40));
  const portalVisuals: { ring: THREE.Mesh; ringMaterial: THREE.MeshBasicMaterial; glowMaterial: THREE.ShaderMaterial }[] = [];
  for (const portal of LEVEL_PORTALS) {
    const ringMaterial = track(new THREE.MeshBasicMaterial({ color: TEAL.clone(), transparent: true, opacity: 0.8 }));
    const ring = new THREE.Mesh(portalRingGeometry, ringMaterial);
    ring.position.set(portal.x, portal.y + 1.15, 0);
    scene.add(ring);
    const glowMaterial = track(makeGlowMaterial(TEAL, 0.35));
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.scale.setScalar(2.6);
    glow.position.copy(ring.position);
    scene.add(glow);
    const labelMaterial = track(
      new THREE.MeshBasicMaterial({ map: track(makeLabelTexture(portal.label, portal.sub)), transparent: true }),
    );
    const label = new THREE.Mesh(track(new THREE.PlaneGeometry(2.6, 2.6 * (224 / 512))), labelMaterial);
    label.position.set(portal.x, portal.y + 3, -0.4);
    scene.add(label);
    portalVisuals.push({ ring, ringMaterial, glowMaterial });
  }

  // Finale flag.
  const poleMaterial = track(new THREE.MeshBasicMaterial({ color: GOLD }));
  const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 10)), poleMaterial);
  pole.position.set(FLAG_X, 2.7, 0);
  scene.add(pole);
  let flagTexture = track(makeFlagTexture(language));
  const flagMaterial = track(new THREE.MeshBasicMaterial({ map: flagTexture, side: THREE.DoubleSide }));
  const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(2.2, 1.35)), flagMaterial);
  flag.position.set(FLAG_X + 1.15, 4.5, 0);
  scene.add(flag);

  // Player character: a little golden ink knight.
  const player = new THREE.Group();
  const bodyMaterial = track(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true }));
  const headMaterial = track(new THREE.MeshBasicMaterial({ color: CREAM, transparent: true }));
  const eyeMaterial = track(new THREE.MeshBasicMaterial({ color: SLAB_DARK, transparent: true }));
  const body = new THREE.Mesh(unitBox, bodyMaterial);
  body.scale.set(0.5, 0.5, 0.42);
  body.position.y = -0.12;
  const head = new THREE.Mesh(unitBox, headMaterial);
  head.scale.set(0.44, 0.36, 0.44);
  head.position.y = 0.3;
  const eyeLeft = new THREE.Mesh(unitBox, eyeMaterial);
  eyeLeft.scale.set(0.06, 0.11, 0.05);
  eyeLeft.position.set(0.12, 0.32, 0.23);
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.02;
  const legMaterial = track(new THREE.MeshBasicMaterial({ color: EMBER, transparent: true }));
  const legLeft = new THREE.Mesh(unitBox, legMaterial);
  legLeft.scale.set(0.13, 0.22, 0.16);
  legLeft.position.set(-0.12, -0.42, 0);
  const legRight = legLeft.clone();
  legRight.position.x = 0.12;
  const playerGlowMaterial = track(makeGlowMaterial(EMBER, 0.65));
  const playerGlow = new THREE.Mesh(glowGeometry, playerGlowMaterial);
  playerGlow.scale.setScalar(1.7);
  playerGlow.position.z = -0.1;
  player.add(body, head, eyeLeft, eyeRight, legLeft, legRight, playerGlow);
  scene.add(player);
  const playerMaterials = [bodyMaterial, headMaterial, eyeMaterial, legMaterial];

  // Comet trail behind the player.
  const trailGeometry = track(new THREE.BufferGeometry());
  const trailPositions = new Float32Array(TRAIL_COUNT * 3);
  const trailAges = new Float32Array(TRAIL_COUNT).fill(1);
  trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute("aAge", new THREE.BufferAttribute(trailAges, 1));
  const trailMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: `
        attribute float aAge;
        varying float vAge;
        uniform float uPixelRatio;
        void main() {
          vAge = aAge;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.0 - aAge) * 8.0 * uPixelRatio;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAge;
        uniform vec3 uColor;
        void main() {
          vec2 offset = gl_PointCoord - vec2(0.5);
          float alpha = smoothstep(0.5, 0.05, length(offset)) * (1.0 - vAge);
          gl_FragColor = vec4(uColor, alpha * 0.8);
        }
      `,
      uniforms: {
        uColor: { value: EMBER.clone() },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const trail = new THREE.Points(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  scene.add(trail);
  let trailHead = 0;

  // Shared burst particle pool for coins, bumps, stomps, and the finale.
  const burstGeometry = track(new THREE.BufferGeometry());
  const burstPositions = new Float32Array(BURST_COUNT * 3);
  const burstVelocities = new Float32Array(BURST_COUNT * 3);
  const burstColors = new Float32Array(BURST_COUNT * 3);
  const burstLives = new Float32Array(BURST_COUNT).fill(1);
  burstGeometry.setAttribute("position", new THREE.BufferAttribute(burstPositions, 3));
  burstGeometry.setAttribute("color", new THREE.BufferAttribute(burstColors, 3));
  burstGeometry.setAttribute("aLife", new THREE.BufferAttribute(burstLives, 1));
  const burstMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: `
        attribute float aLife;
        attribute vec3 color;
        varying float vLife;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vLife = aLife;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.0 - aLife) * 11.0 * uPixelRatio + 2.0;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vLife;
        varying vec3 vColor;
        void main() {
          if (vLife >= 1.0) discard;
          vec2 offset = gl_PointCoord - vec2(0.5);
          float alpha = smoothstep(0.5, 0.0, length(offset)) * (1.0 - vLife);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const bursts = new THREE.Points(burstGeometry, burstMaterial);
  bursts.frustumCulled = false;
  scene.add(bursts);
  let burstCursor = 0;
  let sceneTime = 0;

  const spawnBurst = (x: number, y: number, tint: THREE.Color, count: number, pace = 3) => {
    for (let index = 0; index < count; index += 1) {
      const slot = burstCursor;
      burstCursor = (burstCursor + 1) % BURST_COUNT;
      const theta = seeded(slot, sceneTime) * Math.PI * 2;
      const speed = pace * (0.5 + seeded(slot, sceneTime + 9));
      burstPositions[slot * 3] = x;
      burstPositions[slot * 3 + 1] = y;
      burstPositions[slot * 3 + 2] = 0.4;
      burstVelocities[slot * 3] = Math.cos(theta) * speed;
      burstVelocities[slot * 3 + 1] = Math.sin(theta) * speed + 1.6;
      burstVelocities[slot * 3 + 2] = (seeded(slot, sceneTime + 17) - 0.5) * 1.4;
      burstColors[slot * 3] = tint.r;
      burstColors[slot * 3 + 1] = tint.g;
      burstColors[slot * 3 + 2] = tint.b;
      burstLives[slot] = 0;
    }
  };

  const resize = () => {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const ratio = renderer.getPixelRatio();
    (trailMaterial.uniforms.uPixelRatio as { value: number }).value = ratio;
    (burstMaterial.uniforms.uPixelRatio as { value: number }).value = ratio;
  };
  resize();

  let activeLanguage = language;
  const setLanguage = (nextLanguage: FableWorldLanguage) => {
    if (nextLanguage === activeLanguage) return;
    activeLanguage = nextLanguage;
    for (let index = 0; index < LEVEL_BLOCKS.length; index += 1) {
      cardMaterials[index].map?.dispose();
      cardMaterials[index].map = makeCardTexture(LEVEL_BLOCKS[index].card[nextLanguage]);
      cardMaterials[index].needsUpdate = true;
    }
    for (let index = 0; index < LEVEL_SIGNS.length; index += 1) {
      signMaterials[index].map?.dispose();
      signMaterials[index].map = makeCardTexture(LEVEL_SIGNS[index].copy[nextLanguage]);
      signMaterials[index].needsUpdate = true;
    }
    flagTexture.dispose();
    flagTexture = makeFlagTexture(nextLanguage);
    flagMaterial.map = flagTexture;
    flagMaterial.needsUpdate = true;
  };

  let cameraX = CAMERA_MIN_X;
  let cameraY = 3;
  let wasGrounded = true;
  let landedAt = -10;
  let coinProcessedAt = 0;
  let bumpProcessedAt = 0;
  let stompProcessedAt = 0;
  let hurtProcessedAt = 0;
  let victoryProcessedAt = 0;

  const render = (world: PlatformWorld, phase: WorldPhase, reducedMotion: boolean, delta: number) => {
    const frameDelta = Math.min(delta, 0.1);
    sceneTime += frameDelta;
    (backdropMaterial.uniforms.uTime as { value: number }).value = sceneTime;

    const simPlayer = world.player;

    // Camera follows with lookahead; gentle shake while hurt.
    const targetX = Math.max(CAMERA_MIN_X, Math.min(simPlayer.x + simPlayer.facing * CAMERA_LOOKAHEAD, LEVEL_END_X - 4));
    const targetY = Math.max(2.4, Math.min(simPlayer.y + 1.6, 7));
    const follow = Math.min(1, frameDelta * 5.2);
    cameraX += (targetX - cameraX) * follow;
    cameraY += (targetY - cameraY) * follow;
    let shake = 0;
    if (!reducedMotion && simPlayer.hurtAt > 0) {
      const sinceHurt = world.elapsed - simPlayer.hurtAt;
      if (sinceHurt < 0.45) shake = (0.45 - sinceHurt) * 0.4;
    }
    camera.position.set(
      cameraX + (seeded(1, sceneTime * 40) - 0.5) * shake,
      cameraY + (seeded(2, sceneTime * 40) - 0.5) * shake,
      CAMERA_DISTANCE,
    );
    camera.lookAt(cameraX, cameraY - 0.4, 0);
    backdrop.position.set(cameraX * 0.92, cameraY * 0.6 + 2, -34);

    // Player transform + squash/stretch + run cycle.
    player.position.set(simPlayer.x, simPlayer.y, 0);
    player.rotation.y = simPlayer.facing === 1 ? 0 : Math.PI;
    if (simPlayer.grounded && !wasGrounded) landedAt = sceneTime;
    wasGrounded = simPlayer.grounded;
    const landSquash = Math.max(0, 1 - (sceneTime - landedAt) * 6);
    let scaleY = 1 - landSquash * 0.22;
    let scaleX = 1 + landSquash * 0.18;
    if (!simPlayer.grounded) {
      const stretch = Math.min(0.2, Math.abs(simPlayer.vy) * 0.012);
      scaleY = 1 + stretch;
      scaleX = 1 - stretch * 0.6;
    }
    player.scale.set(scaleX, scaleY, 1);
    const runSpeed = Math.abs(simPlayer.vx);
    const runPhase = Math.sin(sceneTime * 15) * Math.min(1, runSpeed / 5);
    legLeft.position.y = -0.42 + (simPlayer.grounded ? Math.max(0, runPhase) * 0.13 : 0.06);
    legRight.position.y = -0.42 + (simPlayer.grounded ? Math.max(0, -runPhase) * 0.13 : 0.06);
    body.rotation.z = simPlayer.grounded ? -runSpeed * 0.02 : 0;
    playerGlow.quaternion.copy(camera.quaternion);
    const invulnerable = world.elapsed < simPlayer.invulnUntil;
    const blink = invulnerable ? 0.35 + Math.abs(Math.sin(sceneTime * 20)) * 0.55 : 1;
    for (const material of playerMaterials) material.opacity = blink;
    playerGlowMaterial.uniforms.uIntensity.value = 0.5 + Math.min(0.5, runSpeed * 0.06);

    // Trail.
    if (!reducedMotion && phase === "playing" && (runSpeed > 1.5 || !simPlayer.grounded)) {
      trailPositions[trailHead * 3] = simPlayer.x - simPlayer.facing * 0.3;
      trailPositions[trailHead * 3 + 1] = simPlayer.y - 0.1 + (seeded(trailHead, sceneTime) - 0.5) * 0.15;
      trailPositions[trailHead * 3 + 2] = 0.1;
      trailAges[trailHead] = 0;
      trailHead = (trailHead + 1) % TRAIL_COUNT;
    }
    for (let index = 0; index < TRAIL_COUNT; index += 1) {
      trailAges[index] = Math.min(1, trailAges[index] + frameDelta * 2);
    }
    trailGeometry.getAttribute("position").needsUpdate = true;
    trailGeometry.getAttribute("aAge").needsUpdate = true;

    // Blocks: bump spring + used texture + card reveal.
    for (let index = 0; index < LEVEL_BLOCKS.length; index += 1) {
      const blockState = world.blocks[index];
      const mesh = blockMeshes[index];
      const block = LEVEL_BLOCKS[index];
      const sinceBump = blockState.bumpAt > 0 ? world.elapsed - blockState.bumpAt : 10;
      const lift = sinceBump < 0.3 ? Math.sin((sinceBump / 0.3) * Math.PI) * 0.24 : 0;
      mesh.position.y = block.y + BLOCK_SIZE / 2 + lift;
      mesh.material = blockState.used ? usedBlockMaterial : freshBlockMaterial;

      const card = cardMeshes[index];
      const material = cardMaterials[index];
      if (blockState.used) {
        card.visible = true;
        const sinceReveal = world.elapsed - blockState.bumpAt;
        material.opacity = Math.min(1, Math.max(material.opacity, sinceReveal * 1.6));
        card.position.y =
          block.y + BLOCK_SIZE + 2.2 + (reducedMotion ? 0 : Math.sin(sceneTime * 1.3 + index) * 0.08);
      }
    }

    // Signs float gently.
    for (let index = 0; index < signMeshes.length; index += 1) {
      if (!reducedMotion) {
        signMeshes[index].position.y = LEVEL_SIGNS[index].y + Math.sin(sceneTime * 1.1 + index * 2) * 0.05;
      }
    }

    // Coins spin; collected coins pop away.
    for (let index = 0; index < LEVEL_COINS.length; index += 1) {
      const state = world.coins[index];
      const mesh = coinMeshes[index];
      if (state.collected) {
        const since = world.elapsed - state.collectedAt;
        if (since > 0.25) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.scale.setScalar(1 + since * 3);
        continue;
      }
      mesh.visible = true;
      mesh.scale.setScalar(1);
      mesh.rotation.y = sceneTime * 2.4 + index;
      mesh.position.y = LEVEL_COINS[index].y + (reducedMotion ? 0 : Math.sin(sceneTime * 2 + index) * 0.06);
    }

    // Enemies wobble; squashed enemies flatten and fade.
    for (let index = 0; index < LEVEL_ENEMIES.length; index += 1) {
      const state = world.enemies[index];
      const visual = enemyVisuals[index];
      visual.group.position.set(state.x, state.y, 0);
      visual.glowMaterial.uniforms.uIntensity.value = 0.3 + Math.sin(sceneTime * 6 + index * 2) * 0.1;
      (visual.group.children[1] as THREE.Mesh).quaternion.copy(camera.quaternion);
      if (!state.alive) {
        const since = world.elapsed - state.squashedAt;
        visual.group.visible = since < 0.5;
        visual.group.scale.set(1.4, Math.max(0.12, 1 - since * 3), 1);
        visual.bodyMaterial.opacity = Math.max(0, 0.95 - since * 2);
        continue;
      }
      visual.group.visible = true;
      const wobble = reducedMotion ? 0 : Math.sin(sceneTime * 9 + index * 3) * 0.08;
      visual.group.scale.set(1 + wobble, 1 - wobble, 1);
      visual.body.rotation.z += frameDelta * state.direction * -2.2;
    }

    // Portals pulse; the active one brightens.
    for (let index = 0; index < portalVisuals.length; index += 1) {
      const visual = portalVisuals[index];
      const active = world.activePortal === index;
      visual.ring.rotation.z += frameDelta * (active ? 1.6 : 0.5);
      const pulse = 0.35 + Math.sin(sceneTime * 2.2 + index) * 0.1;
      visual.glowMaterial.uniforms.uIntensity.value = active ? 0.9 : pulse;
      visual.ringMaterial.opacity = active ? 1 : 0.7;
    }

    // Flag waves.
    if (!reducedMotion) flag.rotation.y = Math.sin(sceneTime * 2.4) * 0.18;

    // Transient effects from simulation events.
    if (world.lastCoinAt !== coinProcessedAt && world.lastCoinAt > 0) {
      coinProcessedAt = world.lastCoinAt;
      for (let index = 0; index < LEVEL_COINS.length; index += 1) {
        if (world.coins[index].collectedAt === world.lastCoinAt) {
          spawnBurst(LEVEL_COINS[index].x, LEVEL_COINS[index].y, GOLD_BRIGHT, compact ? 6 : 9, 2.4);
          break;
        }
      }
    }
    if (world.lastBumpAt !== bumpProcessedAt && world.lastBumpAt > 0) {
      bumpProcessedAt = world.lastBumpAt;
      spawnBurst(world.lastBumpX, world.lastBumpY + 0.4, GOLD, compact ? 8 : 14, 3.2);
    }
    if (world.lastStompAt !== stompProcessedAt && world.lastStompAt > 0) {
      stompProcessedAt = world.lastStompAt;
      spawnBurst(world.lastStompX, world.lastStompY, ROSE, compact ? 7 : 12, 3);
    }
    if (simPlayer.hurtAt !== hurtProcessedAt && simPlayer.hurtAt > 0) {
      hurtProcessedAt = simPlayer.hurtAt;
      spawnBurst(simPlayer.x, simPlayer.y, ROSE, compact ? 6 : 10, 2.6);
    }
    if (phase === "victory" && world.victoryAt !== victoryProcessedAt) {
      victoryProcessedAt = world.victoryAt;
      spawnBurst(FLAG_X, 5, GOLD_BRIGHT, 24, 4.4);
      spawnBurst(FLAG_X + 1, 3.4, EMBER, 18, 3.6);
      spawnBurst(FLAG_X - 1, 4.2, TEAL, 18, 3.6);
    }

    // Advance burst particles with light gravity.
    for (let index = 0; index < BURST_COUNT; index += 1) {
      if (burstLives[index] >= 1) continue;
      burstLives[index] = Math.min(1, burstLives[index] + frameDelta * 1.5);
      burstVelocities[index * 3 + 1] -= 5.4 * frameDelta;
      burstPositions[index * 3] += burstVelocities[index * 3] * frameDelta;
      burstPositions[index * 3 + 1] += burstVelocities[index * 3 + 1] * frameDelta;
      burstPositions[index * 3 + 2] += burstVelocities[index * 3 + 2] * frameDelta;
    }
    burstGeometry.getAttribute("position").needsUpdate = true;
    burstGeometry.getAttribute("aLife").needsUpdate = true;

    renderer.render(scene, camera);
  };

  const dispose = () => {
    for (const resource of disposables) resource.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  return { render, resize, setLanguage, dispose };
};
