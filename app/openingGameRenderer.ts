import * as THREE from "three";
import type { GamePhase, GameWorld } from "./OpeningGame";

export type OpeningGameRenderer = {
  render: (world: GameWorld, phase: GamePhase, reducedMotion: boolean, delta: number) => void;
  resize: () => void;
  dispose: () => void;
};

type EnemyKind = "scout" | "sweep" | "sentinel" | "warden" | "archon" | "core";

type RenderEnemy = Omit<GameWorld["enemies"][number], "kind"> & {
  kind?: EnemyKind;
  health?: number;
  maxHealth?: number;
  spawnAt?: number;
};

type RenderWorld = GameWorld & {
  playerY?: number;
};

type EnemyNode = {
  group: THREE.Group;
  variants: Record<EnemyKind, THREE.Group>;
  activeKind: EnemyKind;
  pulses: Partial<Record<EnemyKind, THREE.Object3D>>;
};

const STAR_COUNT = 280;
const STAR_STREAK_COUNT = 96;
const MAX_PLAYER_SHOTS = 18;
const MAX_ENEMY_SHOTS = 10;
const MAX_SPARKS = 48;
const MAX_ASTEROIDS = 6;
const MAX_ENEMY_NODES = 12;
const TUNNEL_RING_COUNT = 8;
const PIXEL_RATIO_CAP = 1.25;
const MOBILE_PIXEL_RATIO_CAP = 1;
const STAR_FAR_Z = -10.5;
const STAR_NEAR_Z = 5;
const STAR_DEPTH = STAR_NEAR_Z - STAR_FAR_Z;
const HORIZON_Y = 0.1;
const PLAYER_Y_FALLBACK = 0.84;

const toWorldY = (y: number) => (0.54 - y) * 5.15;

const seeded = (index: number, offset = 0) => {
  const value = Math.sin(index * 12.9898 + offset * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const createShapeGeometry = (points: ReadonlyArray<readonly [number, number]>) => {
  const shape = new THREE.Shape();
  const [firstX, firstY] = points[0];
  shape.moveTo(firstX, firstY);
  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index][0], points[index][1]);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
};

const resolveEnemyKind = (enemy: RenderEnemy, index: number, total: number): EnemyKind => {
  if (
    enemy.kind === "scout" ||
    enemy.kind === "sweep" ||
    enemy.kind === "sentinel" ||
    enemy.kind === "warden" ||
    enemy.kind === "archon" ||
    enemy.kind === "core"
  ) {
    return enemy.kind;
  }
  if (index === total - 1) return "core";
  const fallbackKinds: EnemyKind[] = ["scout", "sweep", "scout", "sentinel"];
  return fallbackKinds[index % fallbackKinds.length];
};

const isBossKind = (kind: EnemyKind) => kind === "warden" || kind === "archon" || kind === "core";

export const createOpeningGameRenderer = (
  canvas: HTMLCanvasElement,
  onContextLost: () => void,
): OpeningGameRenderer => {
  let disposed = false;
  let contextLost = false;
  // Geometry gains detail on desktop, while mobile keeps the same visual language
  // with a smaller pixel buffer and fewer animated background primitives.
  const compactRenderer = window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
  // The background is intentionally much quieter than the action layer. A
  // handful of deep stars and gates is enough to imply travel; rendering every
  // available visual cue at once made the flight field compete with the ship.
  const activeStarCount = compactRenderer ? 96 : 136;
  const activeStarStreakCount = compactRenderer ? 10 : 18;
  const activeTunnelRingCount = compactRenderer ? 2 : 3;
  const modelDetail = compactRenderer ? 0 : 1;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    // Keep MSAA enabled even for the 1× mobile buffer: the interceptor is a
    // high-contrast silhouette, so clean diagonal edges matter more here than
    // the small framebuffer cost. Performance remains bounded by the 30 FPS
    // cap, 1× DPR, and fixed geometry pools below.
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x030404, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030404, 0.055);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
  camera.position.set(0, 0.24, 7);
  camera.lookAt(0, -0.22, -1.2);
  scene.add(camera);

  // The game coordinate system stays normalized, but a portrait viewport has
  // far less horizontal camera space. Compressing the action lane on narrow
  // screens keeps the ship, enemies, and shots inside the visible playfield.
  let actionSpan = 6.2;
  const toWorldX = (x: number) => (x - 0.5) * actionSpan;

  const geometries: Array<{ dispose: () => void }> = [];
  const materials: Array<{ dispose: () => void }> = [];
  const geometry = <T extends { dispose: () => void }>(item: T) => {
    geometries.push(item);
    return item;
  };
  const material = <T extends { dispose: () => void }>(item: T) => {
    materials.push(item);
    return item;
  };

  const stage = new THREE.Group();
  scene.add(stage);

  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starRays = new Float32Array(STAR_COUNT * 2);
  const starSpeeds = new Float32Array(STAR_COUNT);
  const starColors = new Float32Array(STAR_COUNT * 3);
  const setStarRay = (index: number, salt = 0) => {
    const rayOffset = index * 2;
    const angle = seeded(index + salt, 1) * Math.PI * 2;
    starRays[rayOffset] = Math.cos(angle) * (3.1 + seeded(index + salt, 2) * 3.45);
    starRays[rayOffset + 1] = Math.sin(angle) * (2.05 + seeded(index + salt, 3) * 2.3);
  };
  const placeStar = (index: number, z: number) => {
    const offset = index * 3;
    const rayOffset = index * 2;
    const depth = THREE.MathUtils.clamp((z - STAR_FAR_Z) / STAR_DEPTH, 0, 1);
    // A quadratic expansion from the vanishing point makes the star field move
    // through the player, rather than merely drift around a distant horizon.
    const radialProgress = 0.025 + Math.pow(depth, 2.5) * 0.9;
    starPositions[offset] = starRays[rayOffset] * radialProgress;
    starPositions[offset + 1] = HORIZON_Y + starRays[rayOffset + 1] * radialProgress;
    starPositions[offset + 2] = z;
  };
  for (let index = 0; index < STAR_COUNT; index += 1) {
    const offset = index * 3;
    setStarRay(index);
    placeStar(index, STAR_FAR_Z + seeded(index, 4) * STAR_DEPTH);
    starSpeeds[index] = 0.36 + seeded(index, 5) * 0.76;
    const brightness = 0.28 + seeded(index, 6) * 0.48;
    starColors[offset] = brightness;
    starColors[offset + 1] = brightness;
    starColors[offset + 2] = brightness;
  }
  const starGeometry = geometry(new THREE.BufferGeometry());
  const starPositionAttribute = new THREE.BufferAttribute(starPositions, 3);
  starPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  starGeometry.setAttribute("position", starPositionAttribute);
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  starGeometry.setDrawRange(0, activeStarCount);
  const starMaterial = material(
    new THREE.PointsMaterial({
      size: compactRenderer ? 0.024 : 0.028,
      vertexColors: true,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    }),
  );
  stage.add(new THREE.Points(starGeometry, starMaterial));

  // A very small subset of the stars becomes thin velocity streaks. They only
  // appear in flight, so the forward-vector cue reads as a pulse rather than a
  // permanent layer of visual noise.
  const starStreakGeometry = geometry(new THREE.BufferGeometry());
  const starStreakPositions = new Float32Array(STAR_STREAK_COUNT * 6);
  const starStreakAttribute = new THREE.BufferAttribute(starStreakPositions, 3);
  starStreakAttribute.setUsage(THREE.DynamicDrawUsage);
  starStreakGeometry.setAttribute("position", starStreakAttribute);
  starStreakGeometry.setDrawRange(0, activeStarStreakCount * 2);
  const starStreakMaterial = material(
    new THREE.LineBasicMaterial({
      color: 0xdde3e0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  const starStreaks = new THREE.LineSegments(starStreakGeometry, starStreakMaterial);
  stage.add(starStreaks);

  // Sparse solid gates provide the only persistent corridor rhythm. Avoiding
  // wireframe here removes the spinning mesh noise from the earlier design.
  const tunnelRingGeometry = geometry(
    new THREE.TorusGeometry(2.78, 0.011, compactRenderer ? 4 : 6, compactRenderer ? 48 : 72),
  );
  const tunnelRingMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x9aa39f, transparent: true, opacity: 0.105, depthWrite: false }),
  );
  const tunnelRingMesh = new THREE.InstancedMesh(tunnelRingGeometry, tunnelRingMaterial, TUNNEL_RING_COUNT);
  tunnelRingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tunnelRingMesh.frustumCulled = false;
  stage.add(tunnelRingMesh);
  const tunnelDummy = new THREE.Object3D();

  // One dim, static monolith retains the site language without becoming a
  // second encounter on the horizon.
  const monolith = new THREE.Group();
  monolith.position.set(0, 0.36, -4.2);
  const monolithMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x79807d, wireframe: true, transparent: true, opacity: 0.075, depthWrite: false }),
  );
  const monolithHead = new THREE.Mesh(geometry(new THREE.BoxGeometry(0.72, 0.48, 0.08)), monolithMaterial);
  monolithHead.position.y = 0.7;
  const monolithBrim = new THREE.Mesh(geometry(new THREE.BoxGeometry(1.3, 0.1, 0.08)), monolithMaterial);
  monolithBrim.position.y = 0.38;
  const monolithFace = new THREE.Mesh(geometry(new THREE.BoxGeometry(0.78, 1.08, 0.08)), monolithMaterial);
  monolithFace.position.y = -0.25;
  monolith.add(monolithHead, monolithBrim, monolithFace);
  stage.add(monolith);

  // A high-clarity FC interceptor needs more than a flat glyph, but it should
  // still resolve at mobile scale. The model is a short stack of filled
  // ShapeGeometry layers: a dark double-chevron backplate, warm-white swept
  // armor, a dark obelisk canopy, and twin trapezoid nozzles. No textures,
  // lights, or wireframe outlines are involved, so the silhouette stays clean
  // while its extra structure remains effectively free to animate.
  const player = new THREE.Group();
  const playerBackplatePoints = [
    [0, 0.62],
    [0.16, 0.43],
    [0.31, 0.16],
    [0.71, -0.31],
    [0.38, -0.29],
    [0.26, -0.58],
    [0.13, -0.66],
    [-0.13, -0.66],
    [-0.26, -0.58],
    [-0.38, -0.29],
    [-0.71, -0.31],
    [-0.31, 0.16],
    [-0.16, 0.43],
  ] as const;
  const playerFuselagePoints = [
    [0, 0.6],
    [0.14, 0.31],
    [0.2, 0.04],
    [0.25, -0.46],
    [0.1, -0.58],
    [-0.1, -0.58],
    [-0.25, -0.46],
    [-0.2, 0.04],
    [-0.14, 0.31],
  ] as const;
  const rightWingPoints = [
    [0.1, 0.19],
    [0.65, -0.29],
    [0.31, -0.25],
    [0.2, -0.51],
    [0.06, -0.28],
  ] as const;
  const leftWingPoints = [
    [-0.1, 0.19],
    [-0.65, -0.29],
    [-0.31, -0.25],
    [-0.2, -0.51],
    [-0.06, -0.28],
  ] as const;
  const rightWingInsetPoints = [
    [0.17, 0.03],
    [0.55, -0.26],
    [0.29, -0.21],
    [0.16, -0.37],
  ] as const;
  const leftWingInsetPoints = [
    [-0.17, 0.03],
    [-0.55, -0.26],
    [-0.29, -0.21],
    [-0.16, -0.37],
  ] as const;
  const playerArmorPoints = [
    [0, 0.51],
    [0.082, 0.22],
    [0.104, -0.39],
    [0.038, -0.5],
    [-0.038, -0.5],
    [-0.104, -0.39],
    [-0.082, 0.22],
  ] as const;
  const cockpitPoints = [
    [0, 0.36],
    [0.083, 0.12],
    [0.06, -0.11],
    [0, -0.17],
    [-0.06, -0.11],
    [-0.083, 0.12],
  ] as const;
  const cockpitGleamPoints = [
    [-0.036, 0.25],
    [0, 0.31],
    [0.039, 0.13],
    [0.005, 0.075],
  ] as const;
  const rightIntakePoints = [
    [0.114, -0.076],
    [0.205, -0.166],
    [0.19, -0.374],
    [0.102, -0.302],
  ] as const;
  const leftIntakePoints = [
    [-0.114, -0.076],
    [-0.205, -0.166],
    [-0.19, -0.374],
    [-0.102, -0.302],
  ] as const;
  const rightNozzlePoints = [
    [0.075, -0.49],
    [0.175, -0.49],
    [0.154, -0.61],
    [0.095, -0.61],
  ] as const;
  const leftNozzlePoints = [
    [-0.075, -0.49],
    [-0.175, -0.49],
    [-0.154, -0.61],
    [-0.095, -0.61],
  ] as const;
  const rightEngineCorePoints = [
    [0.101, -0.515],
    [0.149, -0.515],
    [0.139, -0.582],
    [0.111, -0.582],
  ] as const;
  const leftEngineCorePoints = [
    [-0.101, -0.515],
    [-0.149, -0.515],
    [-0.139, -0.582],
    [-0.111, -0.582],
  ] as const;

  const playerDarkMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x080c0a, side: THREE.DoubleSide, depthWrite: false }),
  );
  const playerHullMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xf0eee7, side: THREE.DoubleSide, depthWrite: false }),
  );
  const playerArmorMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xaeb5b0, side: THREE.DoubleSide, depthWrite: false }),
  );
  const playerPanelMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x202925, side: THREE.DoubleSide, depthWrite: false }),
  );
  const playerCanopyMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x141c19, side: THREE.DoubleSide, depthWrite: false }),
  );
  const playerHighlightMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xdde1da, side: THREE.DoubleSide, depthWrite: false }),
  );
  const playerEngineCoreMaterial = material(
    new THREE.MeshBasicMaterial({
      color: 0xf7f8f3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    }),
  );

  const playerBackplate = new THREE.Mesh(geometry(createShapeGeometry(playerBackplatePoints)), playerDarkMaterial);
  playerBackplate.position.z = 0.04;
  const playerRightWing = new THREE.Mesh(geometry(createShapeGeometry(rightWingPoints)), playerArmorMaterial);
  playerRightWing.position.z = 0.1;
  const playerLeftWing = new THREE.Mesh(geometry(createShapeGeometry(leftWingPoints)), playerArmorMaterial);
  playerLeftWing.position.z = 0.1;
  const playerRightWingInset = new THREE.Mesh(
    geometry(createShapeGeometry(rightWingInsetPoints)),
    playerPanelMaterial,
  );
  playerRightWingInset.position.z = 0.13;
  const playerLeftWingInset = new THREE.Mesh(
    geometry(createShapeGeometry(leftWingInsetPoints)),
    playerPanelMaterial,
  );
  playerLeftWingInset.position.z = 0.13;
  const playerHull = new THREE.Mesh(geometry(createShapeGeometry(playerFuselagePoints)), playerHullMaterial);
  playerHull.position.z = 0.16;
  const playerArmor = new THREE.Mesh(geometry(createShapeGeometry(playerArmorPoints)), playerArmorMaterial);
  playerArmor.position.z = 0.19;
  const playerCockpit = new THREE.Mesh(geometry(createShapeGeometry(cockpitPoints)), playerCanopyMaterial);
  playerCockpit.position.z = 0.22;
  const cockpitGleam = new THREE.Mesh(geometry(createShapeGeometry(cockpitGleamPoints)), playerHighlightMaterial);
  cockpitGleam.position.z = 0.235;
  const playerIntakeRight = new THREE.Mesh(geometry(createShapeGeometry(rightIntakePoints)), playerDarkMaterial);
  playerIntakeRight.position.z = 0.245;
  const playerIntakeLeft = new THREE.Mesh(geometry(createShapeGeometry(leftIntakePoints)), playerDarkMaterial);
  playerIntakeLeft.position.z = 0.245;
  const playerNozzleRight = new THREE.Mesh(geometry(createShapeGeometry(rightNozzlePoints)), playerDarkMaterial);
  playerNozzleRight.position.z = 0.255;
  const playerNozzleLeft = new THREE.Mesh(geometry(createShapeGeometry(leftNozzlePoints)), playerDarkMaterial);
  playerNozzleLeft.position.z = 0.255;
  const playerEngineCores = [
    new THREE.Mesh(geometry(createShapeGeometry(rightEngineCorePoints)), playerEngineCoreMaterial),
    new THREE.Mesh(geometry(createShapeGeometry(leftEngineCorePoints)), playerEngineCoreMaterial),
  ];
  for (const core of playerEngineCores) {
    core.position.z = 0.27;
  }

  player.add(
    playerBackplate,
    playerRightWing,
    playerLeftWing,
    playerRightWingInset,
    playerLeftWingInset,
    playerHull,
    playerArmor,
    playerCockpit,
    cockpitGleam,
    playerIntakeRight,
    playerIntakeLeft,
    playerNozzleRight,
    playerNozzleLeft,
    ...playerEngineCores,
  );
  player.scale.setScalar(1.12);
  player.position.set(0, -1.82, 0.72);
  stage.add(player);

  const trailGeometry = geometry(new THREE.BufferGeometry());
  const trailPositions = new Float32Array(12);
  const trailAttribute = new THREE.BufferAttribute(trailPositions, 3);
  trailAttribute.setUsage(THREE.DynamicDrawUsage);
  trailGeometry.setAttribute("position", trailAttribute);
  const trail = new THREE.LineSegments(
    trailGeometry,
    material(new THREE.LineBasicMaterial({ color: 0xe2e7e4, transparent: true, opacity: 0.24, depthWrite: false })),
  );
  stage.add(trail);

  // Enemy craft are all front-facing, solid silhouettes. Their earlier X/Y
  // rotations made zero-thickness planes turn into odd flat shards. These
  // shared plates give the scout, sweep and sentinel distinct readable forms
  // without introducing dense wireframes or per-enemy allocations.
  const scoutFramePoints = [
    [0, 0.47], [0.12, 0.2], [0.58, 0.03], [0.3, -0.11], [0.17, -0.5],
    [0, -0.61], [-0.17, -0.5], [-0.3, -0.11], [-0.58, 0.03], [-0.12, 0.2],
  ] as const;
  const scoutArmorPoints = [
    [0, 0.4], [0.1, 0.15], [0.4, 0.03], [0.16, -0.05], [0.1, -0.4],
    [0, -0.47], [-0.1, -0.4], [-0.16, -0.05], [-0.4, 0.03], [-0.1, 0.15],
  ] as const;
  const scoutCanopyPoints = [
    [0, 0.27], [0.07, 0.08], [0.045, -0.17], [0, -0.25], [-0.045, -0.17], [-0.07, 0.08],
  ] as const;
  const scoutPortPoints = [[0.2, -0.04], [0.44, 0.01], [0.23, -0.1], [0.13, -0.27]] as const;
  const scoutStarboardPoints = scoutPortPoints.map(([x, y]) => [-x, y] as const);

  const sweepFramePoints = [
    [0, 0.43], [0.14, 0.22], [0.7, 0.08], [0.43, -0.07], [0.5, -0.33], [0.15, -0.18],
    [0.08, -0.51], [0, -0.58], [-0.08, -0.51], [-0.15, -0.18], [-0.5, -0.33],
    [-0.43, -0.07], [-0.7, 0.08], [-0.14, 0.22],
  ] as const;
  const sweepArmorPoints = [
    [0, 0.36], [0.1, 0.15], [0.55, 0.06], [0.3, -0.04], [0.34, -0.23], [0.1, -0.12],
    [0.055, -0.42], [0, -0.47], [-0.055, -0.42], [-0.1, -0.12], [-0.34, -0.23],
    [-0.3, -0.04], [-0.55, 0.06], [-0.1, 0.15],
  ] as const;
  const sweepSpinePoints = [[0, 0.31], [0.09, 0.09], [0.055, -0.35], [0, -0.43], [-0.055, -0.35], [-0.09, 0.09]] as const;
  const sweepPortPodPoints = [[0.29, 0.045], [0.56, 0.065], [0.39, -0.08], [0.23, -0.105]] as const;
  const sweepStarboardPodPoints = sweepPortPodPoints.map(([x, y]) => [-x, y] as const);

  const sentinelShellPoints = [
    [0, 0.5], [0.25, 0.36], [0.42, 0.08], [0.34, -0.29], [0, -0.47],
    [-0.34, -0.29], [-0.42, 0.08], [-0.25, 0.36],
  ] as const;
  const sentinelPlatePoints = [
    [0, 0.37], [0.19, 0.25], [0.29, 0.04], [0.22, -0.2], [0, -0.32],
    [-0.22, -0.2], [-0.29, 0.04], [-0.19, 0.25],
  ] as const;
  const sentinelEyePoints = [[0, 0.2], [0.105, 0.035], [0, -0.17], [-0.105, 0.035]] as const;
  const sentinelPortFinPoints = [[-0.3, 0.19], [-0.58, 0.1], [-0.48, -0.12], [-0.31, -0.08]] as const;
  const sentinelStarboardFinPoints = sentinelPortFinPoints.map(([x, y]) => [-x, y] as const);

  // Bosses borrow the same layered, zero-thickness language as the smaller
  // craft, but their much wider silhouettes, negative-space panels, and slow
  // orbital rings make them read as encounters instead of enlarged enemies.
  // Keeping them entirely in the XY plane also avoids the old edge-on shard
  // problem when their animation banks are applied.
  const wardenFramePoints = [
    [0, 0.72], [0.22, 0.54], [0.72, 0.46], [0.9, 0.23], [0.66, 0.05], [0.78, -0.3],
    [0.45, -0.27], [0.29, -0.65], [0, -0.77], [-0.29, -0.65], [-0.45, -0.27],
    [-0.78, -0.3], [-0.66, 0.05], [-0.9, 0.23], [-0.72, 0.46], [-0.22, 0.54],
  ] as const;
  const wardenArmorPoints = [
    [0, 0.6], [0.16, 0.44], [0.58, 0.37], [0.68, 0.23], [0.47, 0.08], [0.57, -0.21],
    [0.3, -0.18], [0.18, -0.53], [0, -0.63], [-0.18, -0.53], [-0.3, -0.18],
    [-0.57, -0.21], [-0.47, 0.08], [-0.68, 0.23], [-0.58, 0.37], [-0.16, 0.44],
  ] as const;
  const wardenSpinePoints = [
    [0, 0.49], [0.13, 0.27], [0.17, -0.33], [0, -0.54], [-0.17, -0.33], [-0.13, 0.27],
  ] as const;
  const wardenPortPylonPoints = [[-0.4, 0.34], [-0.79, 0.23], [-0.62, 0.06], [-0.35, 0.1]] as const;
  const wardenStarboardPylonPoints = wardenPortPylonPoints.map(([x, y]) => [-x, y] as const);
  const wardenCorePoints = [[0, 0.28], [0.095, 0.08], [0.055, -0.16], [0, -0.24], [-0.055, -0.16], [-0.095, 0.08]] as const;

  const archonFramePoints = [
    [0, 0.88], [0.19, 0.59], [0.39, 0.43], [0.82, 0.22], [0.54, 0.04], [0.69, -0.34],
    [0.28, -0.29], [0.18, -0.72], [0, -0.86], [-0.18, -0.72], [-0.28, -0.29],
    [-0.69, -0.34], [-0.54, 0.04], [-0.82, 0.22], [-0.39, 0.43], [-0.19, 0.59],
  ] as const;
  const archonArmorPoints = [
    [0, 0.66], [0.13, 0.44], [0.3, 0.31], [0.62, 0.2], [0.36, 0.04], [0.47, -0.23],
    [0.18, -0.17], [0.105, -0.59], [0, -0.7], [-0.105, -0.59], [-0.18, -0.17],
    [-0.47, -0.23], [-0.36, 0.04], [-0.62, 0.2], [-0.3, 0.31], [-0.13, 0.44],
  ] as const;
  const archonCrownPoints = [[-0.34, 0.45], [-0.18, 0.78], [0, 0.56], [0.18, 0.78], [0.34, 0.45], [0.17, 0.38], [0, 0.49], [-0.17, 0.38]] as const;
  const archonObeliskPoints = [[0, 0.46], [0.12, 0.17], [0.075, -0.44], [0, -0.59], [-0.075, -0.44], [-0.12, 0.17]] as const;
  const archonPortWingPoints = [[-0.32, 0.27], [-0.79, 0.2], [-0.52, 0.02], [-0.27, 0.04]] as const;
  const archonStarboardWingPoints = archonPortWingPoints.map(([x, y]) => [-x, y] as const);
  const archonKernelPoints = [[0, 0.17], [0.1, 0], [0, -0.21], [-0.1, 0]] as const;

  const coreShellPoints = [
    [0, 0.72], [0.25, 0.52], [0.6, 0.29], [0.5, -0.06], [0.34, -0.55],
    [0, -0.72], [-0.34, -0.55], [-0.5, -0.06], [-0.6, 0.29], [-0.25, 0.52],
  ] as const;
  const corePlatePoints = [
    [0, 0.57], [0.18, 0.4], [0.39, 0.22], [0.3, -0.04], [0.2, -0.43],
    [0, -0.56], [-0.2, -0.43], [-0.3, -0.04], [-0.39, 0.22], [-0.18, 0.4],
  ] as const;
  const coreObeliskPoints = [[0, 0.43], [0.115, 0.13], [0.08, -0.31], [0, -0.43], [-0.08, -0.31], [-0.115, 0.13]] as const;
  const corePortFinPoints = [[-0.38, 0.2], [-0.75, 0.03], [-0.55, -0.12], [-0.31, -0.05]] as const;
  const coreStarboardFinPoints = corePortFinPoints.map(([x, y]) => [-x, y] as const);

  const scoutFrameGeometry = geometry(createShapeGeometry(scoutFramePoints));
  const scoutArmorGeometry = geometry(createShapeGeometry(scoutArmorPoints));
  const scoutCanopyGeometry = geometry(createShapeGeometry(scoutCanopyPoints));
  const scoutPortGeometry = geometry(createShapeGeometry(scoutPortPoints));
  const scoutStarboardGeometry = geometry(createShapeGeometry(scoutStarboardPoints));
  const sweepFrameGeometry = geometry(createShapeGeometry(sweepFramePoints));
  const sweepArmorGeometry = geometry(createShapeGeometry(sweepArmorPoints));
  const sweepSpineGeometry = geometry(createShapeGeometry(sweepSpinePoints));
  const sweepPortPodGeometry = geometry(createShapeGeometry(sweepPortPodPoints));
  const sweepStarboardPodGeometry = geometry(createShapeGeometry(sweepStarboardPodPoints));
  const sentinelShellGeometry = geometry(createShapeGeometry(sentinelShellPoints));
  const sentinelPlateGeometry = geometry(createShapeGeometry(sentinelPlatePoints));
  const sentinelEyeGeometry = geometry(createShapeGeometry(sentinelEyePoints));
  const sentinelPortFinGeometry = geometry(createShapeGeometry(sentinelPortFinPoints));
  const sentinelStarboardFinGeometry = geometry(createShapeGeometry(sentinelStarboardFinPoints));
  const wardenFrameGeometry = geometry(createShapeGeometry(wardenFramePoints));
  const wardenArmorGeometry = geometry(createShapeGeometry(wardenArmorPoints));
  const wardenSpineGeometry = geometry(createShapeGeometry(wardenSpinePoints));
  const wardenPortPylonGeometry = geometry(createShapeGeometry(wardenPortPylonPoints));
  const wardenStarboardPylonGeometry = geometry(createShapeGeometry(wardenStarboardPylonPoints));
  const wardenCoreGeometry = geometry(createShapeGeometry(wardenCorePoints));
  const archonFrameGeometry = geometry(createShapeGeometry(archonFramePoints));
  const archonArmorGeometry = geometry(createShapeGeometry(archonArmorPoints));
  const archonCrownGeometry = geometry(createShapeGeometry(archonCrownPoints));
  const archonObeliskGeometry = geometry(createShapeGeometry(archonObeliskPoints));
  const archonPortWingGeometry = geometry(createShapeGeometry(archonPortWingPoints));
  const archonStarboardWingGeometry = geometry(createShapeGeometry(archonStarboardWingPoints));
  const archonKernelGeometry = geometry(createShapeGeometry(archonKernelPoints));
  const coreShellGeometry = geometry(createShapeGeometry(coreShellPoints));
  const corePlateGeometry = geometry(createShapeGeometry(corePlatePoints));
  const coreObeliskGeometry = geometry(createShapeGeometry(coreObeliskPoints));
  const corePortFinGeometry = geometry(createShapeGeometry(corePortFinPoints));
  const coreStarboardFinGeometry = geometry(createShapeGeometry(coreStarboardFinPoints));
  const wardenPulseGeometry = geometry(new THREE.RingGeometry(0.66, 0.69, compactRenderer ? 8 : 12));
  const archonPulseGeometry = geometry(new THREE.RingGeometry(0.74, 0.772, compactRenderer ? 4 : 6));
  const corePulseGeometry = geometry(new THREE.RingGeometry(0.29, 0.335, compactRenderer ? 8 : 12));
  const enemyFrameMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x080d0b, side: THREE.DoubleSide, depthWrite: false }),
  );
  const enemyBodyMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x69716d, side: THREE.DoubleSide, depthWrite: false }),
  );
  const enemyArmorMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xcbd1cb, side: THREE.DoubleSide, depthWrite: false }),
  );
  const enemyPanelMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0x1a221f, side: THREE.DoubleSide, depthWrite: false }),
  );
  const enemyHighlightMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xf0f2ed, side: THREE.DoubleSide, depthWrite: false }),
  );
  const enemyPulseMaterial = material(
    new THREE.MeshBasicMaterial({
      color: 0xe0e6df,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  const enemyLayer = (shape: THREE.BufferGeometry, layerMaterial: THREE.MeshBasicMaterial, z: number) => {
    const mesh = new THREE.Mesh(shape, layerMaterial);
    mesh.position.z = z;
    return mesh;
  };

  const createEnemyNode = () => {
    const group = new THREE.Group();
    const scout = new THREE.Group();
    scout.add(
      enemyLayer(scoutFrameGeometry, enemyFrameMaterial, 0.02),
      enemyLayer(scoutArmorGeometry, enemyArmorMaterial, 0.05),
      enemyLayer(scoutPortGeometry, enemyBodyMaterial, 0.07),
      enemyLayer(scoutStarboardGeometry, enemyBodyMaterial, 0.07),
      enemyLayer(scoutCanopyGeometry, enemyPanelMaterial, 0.09),
    );

    const sweep = new THREE.Group();
    sweep.add(
      enemyLayer(sweepFrameGeometry, enemyFrameMaterial, 0.02),
      enemyLayer(sweepArmorGeometry, enemyBodyMaterial, 0.05),
      enemyLayer(sweepPortPodGeometry, enemyArmorMaterial, 0.07),
      enemyLayer(sweepStarboardPodGeometry, enemyArmorMaterial, 0.07),
      enemyLayer(sweepSpineGeometry, enemyPanelMaterial, 0.09),
    );

    const sentinel = new THREE.Group();
    sentinel.add(
      enemyLayer(sentinelShellGeometry, enemyFrameMaterial, 0.02),
      enemyLayer(sentinelPortFinGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(sentinelStarboardFinGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(sentinelPlateGeometry, enemyArmorMaterial, 0.06),
      enemyLayer(sentinelEyeGeometry, enemyHighlightMaterial, 0.09),
    );

    const warden = new THREE.Group();
    const wardenPulse = enemyLayer(wardenPulseGeometry, enemyPulseMaterial, 0.01);
    warden.add(
      wardenPulse,
      enemyLayer(wardenFrameGeometry, enemyFrameMaterial, 0.02),
      enemyLayer(wardenPortPylonGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(wardenStarboardPylonGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(wardenArmorGeometry, enemyArmorMaterial, 0.06),
      enemyLayer(wardenSpineGeometry, enemyPanelMaterial, 0.09),
      enemyLayer(wardenCoreGeometry, enemyHighlightMaterial, 0.12),
    );

    const archon = new THREE.Group();
    const archonPulse = enemyLayer(archonPulseGeometry, enemyPulseMaterial, 0.01);
    archon.add(
      archonPulse,
      enemyLayer(archonFrameGeometry, enemyFrameMaterial, 0.02),
      enemyLayer(archonPortWingGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(archonStarboardWingGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(archonArmorGeometry, enemyArmorMaterial, 0.06),
      enemyLayer(archonCrownGeometry, enemyHighlightMaterial, 0.09),
      enemyLayer(archonObeliskGeometry, enemyPanelMaterial, 0.12),
      enemyLayer(archonKernelGeometry, enemyHighlightMaterial, 0.14),
    );

    const core = new THREE.Group();
    const pulse = enemyLayer(corePulseGeometry, enemyPulseMaterial, 0.16);
    core.add(
      enemyLayer(coreShellGeometry, enemyFrameMaterial, 0.02),
      enemyLayer(corePortFinGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(coreStarboardFinGeometry, enemyBodyMaterial, 0.04),
      enemyLayer(corePlateGeometry, enemyArmorMaterial, 0.07),
      enemyLayer(coreObeliskGeometry, enemyPanelMaterial, 0.11),
      pulse,
    );

    const variants: Record<EnemyKind, THREE.Group> = { scout, sweep, sentinel, warden, archon, core };
    for (const variant of Object.values(variants)) {
      variant.visible = false;
      group.add(variant);
    }
    scout.visible = true;
    return { group, variants, activeKind: "scout" as EnemyKind, pulses: { warden: wardenPulse, archon: archonPulse, core: pulse } };
  };

  const enemyNodes: EnemyNode[] = [];
  for (let index = 0; index < MAX_ENEMY_NODES; index += 1) {
    const node = createEnemyNode();
    stage.add(node.group);
    enemyNodes.push(node);
  }

  // Hazards are drawn from a fixed instanced pool. Their screen-space motion is
  // owned by the game world; depth and rotation are layered here for the
  // approaching-asteroid effect.
  const asteroidMesh = new THREE.InstancedMesh(
    geometry(new THREE.DodecahedronGeometry(1, compactRenderer ? 0 : modelDetail)),
    material(
      new THREE.MeshBasicMaterial({
        color: 0x9ea7a2,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    ),
    MAX_ASTEROIDS,
  );
  asteroidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  asteroidMesh.frustumCulled = false;
  stage.add(asteroidMesh);
  const asteroidDummy = new THREE.Object3D();

  const targetReticle = new THREE.Mesh(
    geometry(new THREE.TorusGeometry(0.45, 0.007, 3, 48)),
    material(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false })),
  );
  stage.add(targetReticle);

  // The end state intentionally resolves into a small, calm signal lock
  // rather than adding another explosion or post-processing pass. Every
  // piece is preallocated: twelve square samples fall into a fixed reticle
  // while the nested rings settle into place.
  const VICTORY_FRAGMENT_COUNT = 12;
  const victorySignal = new THREE.Group();
  victorySignal.visible = false;
  victorySignal.position.set(0, HORIZON_Y + 0.04, -0.42);
  const victoryOuterMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xdce1dc, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  const victoryInnerMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xf3f5f1, transparent: true, opacity: 0.58, depthWrite: false }),
  );
  const victoryGuideMaterial = material(
    new THREE.LineBasicMaterial({ color: 0xaeb7b1, transparent: true, opacity: 0.26, depthWrite: false }),
  );
  const victoryFragmentMaterial = material(
    new THREE.MeshBasicMaterial({ color: 0xf4f6f2, transparent: true, opacity: 0.72, depthWrite: false }),
  );
  const victoryOuter = new THREE.Mesh(
    geometry(new THREE.TorusGeometry(1.14, 0.009, compactRenderer ? 4 : 6, compactRenderer ? 48 : 72)),
    victoryOuterMaterial,
  );
  const victoryInner = new THREE.Mesh(
    geometry(new THREE.TorusGeometry(0.46, 0.014, compactRenderer ? 4 : 6, compactRenderer ? 36 : 56)),
    victoryInnerMaterial,
  );
  const victoryCore = new THREE.Mesh(
    geometry(new THREE.CircleGeometry(0.035, compactRenderer ? 6 : 10)),
    victoryInnerMaterial,
  );
  const victoryGuideGeometry = geometry(new THREE.BufferGeometry());
  victoryGuideGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([
        -1.48, 0, 0, -0.72, 0, 0,
        0.72, 0, 0, 1.48, 0, 0,
        0, -1.04, 0, 0, -0.6, 0,
        0, 0.6, 0, 0, 1.04, 0,
      ]),
      3,
    ),
  );
  const victoryGuides = new THREE.LineSegments(victoryGuideGeometry, victoryGuideMaterial);
  const victoryFragments = new THREE.InstancedMesh(
    geometry(new THREE.BoxGeometry(0.042, 0.042, 0.01)),
    victoryFragmentMaterial,
    VICTORY_FRAGMENT_COUNT,
  );
  victoryFragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  victoryFragments.frustumCulled = false;
  victorySignal.add(victoryOuter, victoryGuides, victoryInner, victoryCore, victoryFragments);
  stage.add(victorySignal);
  const victoryDummy = new THREE.Object3D();
  let victoryElapsed = 0;
  let victoryWasActive = false;

  const shotGeometry = geometry(new THREE.BoxGeometry(0.028, 0.18, 0.03));
  const friendlyShotMesh = new THREE.InstancedMesh(
    shotGeometry,
    material(new THREE.MeshBasicMaterial({ color: 0xf3f4f2, transparent: true, opacity: 0.95, depthWrite: false })),
    MAX_PLAYER_SHOTS,
  );
  const enemyShotMesh = new THREE.InstancedMesh(
    shotGeometry,
    material(new THREE.MeshBasicMaterial({ color: 0x8d9592, transparent: true, opacity: 0.75, depthWrite: false })),
    MAX_ENEMY_SHOTS,
  );
  friendlyShotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  enemyShotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stage.add(friendlyShotMesh, enemyShotMesh);
  const shotDummy = new THREE.Object3D();

  const sparkGeometry = geometry(new THREE.BufferGeometry());
  const sparkPositions = new Float32Array(MAX_SPARKS * 3);
  const sparkAttribute = new THREE.BufferAttribute(sparkPositions, 3);
  sparkAttribute.setUsage(THREE.DynamicDrawUsage);
  sparkGeometry.setAttribute("position", sparkAttribute);
  const sparkPoints = new THREE.Points(
    sparkGeometry,
    material(
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.07,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    ),
  );
  stage.add(sparkPoints);

  const updateShots = (world: GameWorld) => {
    let friendlyIndex = 0;
    let enemyIndex = 0;
    for (const shot of world.projectiles) {
      const mesh = shot.friendly ? friendlyShotMesh : enemyShotMesh;
      const index = shot.friendly ? friendlyIndex : enemyIndex;
      if (index >= (shot.friendly ? MAX_PLAYER_SHOTS : MAX_ENEMY_SHOTS)) continue;
      // A friendly shot recedes with its screen position, matching the depth
      // range of approaching enemy craft. Keeping it at a fixed foreground Z
      // made side targets look missed even when the gameplay collider hit.
      const shotApproach = THREE.MathUtils.clamp((shot.y - 0.06) / 0.9, 0, 1);
      const shotDepth = shot.friendly ? -1.92 + shotApproach * 1.28 : 0.12;
      shotDummy.position.set(toWorldX(shot.x), toWorldY(shot.y), shotDepth);
      shotDummy.rotation.set(0, 0, 0);
      shotDummy.scale.set(1, 1, 1);
      shotDummy.updateMatrix();
      mesh.setMatrixAt(index, shotDummy.matrix);
      if (shot.friendly) friendlyIndex += 1;
      else enemyIndex += 1;
    }
    friendlyShotMesh.count = friendlyIndex;
    enemyShotMesh.count = enemyIndex;
    friendlyShotMesh.instanceMatrix.needsUpdate = true;
    enemyShotMesh.instanceMatrix.needsUpdate = true;
  };

  const updateAsteroids = (world: GameWorld, time: number, reducedMotion: boolean) => {
    let instance = 0;
    for (const asteroid of world.asteroids) {
      if (!asteroid.active || instance >= MAX_ASTEROIDS) continue;
      const progress = THREE.MathUtils.clamp((asteroid.y + 0.16) / 1.28, 0, 1);
      const kindScale = asteroid.kind === "monolith" ? 1.36 : 0.72;
      const size = asteroid.size * kindScale * (2.5 + progress * 7.1);
      asteroidDummy.position.set(
        toWorldX(asteroid.x),
        toWorldY(asteroid.y),
        -6.15 + progress * 7.35,
      );
      const spin = reducedMotion ? 0 : time * asteroid.spin;
      asteroidDummy.rotation.set(spin * 0.74 + asteroid.id, spin * 0.48, -spin * 0.36);
      asteroidDummy.scale.setScalar(size);
      asteroidDummy.updateMatrix();
      asteroidMesh.setMatrixAt(instance, asteroidDummy.matrix);
      instance += 1;
    }
    asteroidMesh.count = instance;
    asteroidMesh.instanceMatrix.needsUpdate = true;
  };

  const updateSparks = (world: GameWorld) => {
    const count = Math.min(world.sparks.length, MAX_SPARKS);
    for (let index = 0; index < count; index += 1) {
      const spark = world.sparks[index];
      const offset = index * 3;
      sparkPositions[offset] = toWorldX(spark.x);
      sparkPositions[offset + 1] = toWorldY(spark.y);
      sparkPositions[offset + 2] = 0.25 + spark.life * 0.4;
    }
    sparkGeometry.setDrawRange(0, count);
    sparkAttribute.needsUpdate = true;
  };

  let starRecycle = 0;
  const updateStars = (delta: number, speedScale: number) => {
    if (delta > 0) {
      for (let index = 0; index < activeStarCount; index += 1) {
        const offset = index * 3;
        let z = starPositions[offset + 2] + starSpeeds[index] * speedScale * delta;
        if (z > STAR_NEAR_Z) {
          starRecycle += 1;
          setStarRay(index, starRecycle * 7);
          z = STAR_FAR_Z + seeded(index + starRecycle, 17) * 0.72;
        }
        placeStar(index, z);
      }
      starPositionAttribute.needsUpdate = true;
    }

    for (let index = 0; index < activeStarStreakCount; index += 1) {
      const starIndex = Math.floor((index * activeStarCount) / activeStarStreakCount);
      const source = starIndex * 3;
      const rayOffset = starIndex * 2;
      const target = index * 6;
      const depth = THREE.MathUtils.clamp((starPositions[source + 2] - STAR_FAR_Z) / STAR_DEPTH, 0, 1);
      const tailDepth = Math.max(0, depth - (0.022 + depth * depth * Math.min(0.11, speedScale * 0.025)));
      const tailRadial = 0.025 + Math.pow(tailDepth, 2.5) * 0.9;
      starStreakPositions[target] = starRays[rayOffset] * tailRadial;
      starStreakPositions[target + 1] = HORIZON_Y + starRays[rayOffset + 1] * tailRadial;
      starStreakPositions[target + 2] = STAR_FAR_Z + tailDepth * STAR_DEPTH;
      starStreakPositions[target + 3] = starPositions[source];
      starStreakPositions[target + 4] = starPositions[source + 1];
      starStreakPositions[target + 5] = starPositions[source + 2];
    }
    starStreaks.visible = speedScale > 1;
    starStreakMaterial.opacity = speedScale > 1 ? 0.16 : 0;
    starStreakAttribute.needsUpdate = true;
  };

  const updateVictorySignal = (phase: GamePhase, reducedMotion: boolean, delta: number) => {
    const cleared = phase === "cleared";
    victorySignal.visible = cleared;
    if (!cleared) {
      victoryElapsed = 0;
      victoryWasActive = false;
      return;
    }

    if (!victoryWasActive) victoryElapsed = 0;
    victoryWasActive = true;
    if (!reducedMotion) victoryElapsed += Math.min(delta, 0.05);

    // Reduced-motion visitors receive the settled composition immediately.
    const settle = reducedMotion ? 1 : THREE.MathUtils.smoothstep(victoryElapsed, 0.04, 1.04);
    const calmTime = reducedMotion ? 0 : victoryElapsed;
    victorySignal.scale.setScalar(0.86 + settle * 0.14);
    victorySignal.rotation.z = reducedMotion ? 0 : calmTime * 0.08;
    victoryOuter.rotation.z = reducedMotion ? 0 : -calmTime * 0.18;
    victoryInner.rotation.z = reducedMotion ? 0 : calmTime * 0.3;
    victoryOuterMaterial.opacity = 0.08 + settle * 0.16;
    victoryInnerMaterial.opacity = 0.38 + settle * 0.34;
    victoryGuideMaterial.opacity = 0.1 + settle * 0.22;
    victoryFragmentMaterial.opacity = 0.42 + settle * 0.38;

    for (let index = 0; index < VICTORY_FRAGMENT_COUNT; index += 1) {
      const phaseOffset = (index / VICTORY_FRAGMENT_COUNT) * Math.PI * 2;
      const stagger = THREE.MathUtils.clamp((settle - index * 0.025) / 0.72, 0, 1);
      const eased = 1 - Math.pow(1 - stagger, 2);
      const radius = 1.36 * (1 - eased) + 0.22;
      const angle = phaseOffset + calmTime * (index % 2 === 0 ? 0.3 : -0.22);
      const size = 0.48 + eased * 0.72;
      victoryDummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.74, 0.04);
      victoryDummy.rotation.set(0, 0, angle + Math.PI * 0.25);
      victoryDummy.scale.setScalar(size);
      victoryDummy.updateMatrix();
      victoryFragments.setMatrixAt(index, victoryDummy.matrix);
    }
    victoryFragments.instanceMatrix.needsUpdate = true;
  };

  const resize = () => {
    if (disposed || contextLost) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const pixelRatioCap = compactRenderer ? MOBILE_PIXEL_RATIO_CAP : PIXEL_RATIO_CAP;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const playerScale =
      camera.aspect < 0.38 ? 0.45 : camera.aspect < 0.78 ? 0.6 : camera.aspect < 1 ? 0.84 : 1.12;
    player.scale.setScalar(playerScale);
    const visibleHalfWidth =
      Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.distanceTo(player.position) * camera.aspect;
    const safePlayerCenter = Math.max(0, visibleHalfWidth - 0.71 * playerScale - 0.06);
    // 0.36 is the normalized distance from the center to the gameplay's
    // left/right input bounds (0.14–0.86).
    actionSpan = THREE.MathUtils.clamp(safePlayerCenter / 0.36, 1.2, 6.2);
    camera.updateProjectionMatrix();
  };

  const render = (world: GameWorld, phase: GamePhase, reducedMotion: boolean, delta: number) => {
    if (disposed || contextLost) return;

    const motionDelta = reducedMotion ? 0 : Math.min(delta, 0.05);
    const time = world.elapsed;
    const activeFlight = phase === "active";
    const victory = phase === "cleared";
    const renderWorld = world as RenderWorld;
    const forwardDistance = Number.isFinite(world.forwardDistance) ? world.forwardDistance : time * 0.72;
    const flightSpeed = reducedMotion ? 0.08 : activeFlight ? 1.9 : phase === "briefing" ? 0.16 : victory ? 0.08 : 0.28;
    updateStars(motionDelta, flightSpeed);
    updateVictorySignal(phase, reducedMotion, motionDelta);
    monolithMaterial.opacity = victory ? 0.13 : 0.075;
    tunnelRingMaterial.opacity = victory ? 0.15 : 0.105;

    const corridorTravel = reducedMotion ? 0 : activeFlight ? forwardDistance * 1.45 : time * 0.045;
    const tunnelDepth = 16;
    for (let index = 0; index < activeTunnelRingCount; index += 1) {
      const travel = (index * (tunnelDepth / activeTunnelRingCount) + corridorTravel) % tunnelDepth;
      const progress = travel / tunnelDepth;
      // Gates stay behind the playfield instead of growing through it. Their
      // slow drift gives the scene a quiet vector without adding a second
      // source of foreground motion.
      const scale = 0.42 + progress * 0.56;
      tunnelDummy.position.set(0, HORIZON_Y, -12.5 + travel * 0.56);
      tunnelDummy.rotation.set(0, 0, 0);
      tunnelDummy.scale.set(scale, scale * 0.76, 1);
      tunnelDummy.updateMatrix();
      tunnelRingMesh.setMatrixAt(index, tunnelDummy.matrix);
    }
    tunnelRingMesh.count = activeTunnelRingCount;
    tunnelRingMesh.instanceMatrix.needsUpdate = true;

    const playerY = typeof renderWorld.playerY === "number" ? renderWorld.playerY : PLAYER_Y_FALLBACK;
    player.visible = phase !== "failed";
    player.position.x = toWorldX(world.playerX);
    player.position.y = toWorldY(playerY) - 0.17;
    player.rotation.z = reducedMotion ? 0 : (world.playerX - 0.5) * -0.42;
    player.rotation.x = reducedMotion ? 0 : Math.sin(time * 2.6) * 0.018;
    const enginePulse = reducedMotion ? 0.74 : activeFlight ? 0.82 + Math.sin(time * 7.4) * 0.12 : 0.46;
    playerEngineCoreMaterial.opacity = enginePulse;
    // Two short, quiet vectors originate at the trapezoid nozzles. They imply
    // forward thrust without turning the calmer background into a speed-line
    // effect again.
    const exhaustLength = activeFlight ? 0.62 : 0.22;
    trailPositions[0] = player.position.x - 0.13;
    trailPositions[1] = player.position.y - 0.63;
    trailPositions[2] = player.position.z;
    trailPositions[3] = player.position.x - 0.16;
    trailPositions[4] = player.position.y - (0.63 + exhaustLength);
    trailPositions[5] = -0.18;
    trailPositions[6] = player.position.x + 0.13;
    trailPositions[7] = player.position.y - 0.63;
    trailPositions[8] = player.position.z;
    trailPositions[9] = player.position.x + 0.16;
    trailPositions[10] = player.position.y - (0.63 + exhaustLength);
    trailPositions[11] = -0.18;
    trailAttribute.needsUpdate = true;

    let targetNode: EnemyNode | null = null;
    let targetKind: EnemyKind | null = null;
    let targetPriority = -1;
    let targetApproach = -1;
    for (let index = 0; index < world.enemies.length; index += 1) {
      const enemy = world.enemies[index] as RenderEnemy;
      const node = enemyNodes[index];
      if (!node) continue;
      node.group.visible = !victory && enemy.alive;
      if (victory || !enemy.alive) continue;
      const kind = resolveEnemyKind(enemy, index, world.enemies.length);
      if (node.activeKind !== kind) {
        for (const [variantKind, variant] of Object.entries(node.variants) as Array<[EnemyKind, THREE.Group]>) {
          variant.visible = variantKind === kind;
        }
        node.activeKind = kind;
      }
      const approach = THREE.MathUtils.clamp((enemy.y - 0.06) / 0.9, 0, 1);
      const boss = isBossKind(kind);
      const depthLayer = boss ? -1.4 : -1.92 - (index % 3) * 0.24;
      node.group.position.set(toWorldX(enemy.x), toWorldY(enemy.y), depthLayer + approach * 1.28);
      // Every enemy is a layered XY silhouette. Keeping X/Y at zero prevents
      // a plane from turning edge-on and looking like a flattened shard. A
      // small bounded Z bank supplies motion without losing its readable form.
      const bank = reducedMotion
        ? 0
        : boss
          ? Math.sin(time * (kind === "archon" ? 0.48 : 0.62) + index) * (kind === "warden" ? 0.012 : 0.018)
          : Math.sin(time * (kind === "sweep" ? 1.25 : 1.65) + index * 0.8) * (kind === "sweep" ? 0.07 : 0.045);
      node.group.rotation.set(0, 0, bank);
      const kindScale =
        kind === "archon"
          ? 1.72
          : kind === "core"
            ? 1.58
            : kind === "warden"
              ? 1.46
              : kind === "sentinel"
                ? 1.07
                : kind === "sweep"
                  ? 0.98
                  : 0.9;
      const bossBreath = boss && !reducedMotion ? 1 + Math.sin(time * 2.1 + index) * 0.026 : 1;
      const scale = kindScale * (0.84 + (index % 3) * 0.08) * (0.82 + approach * 0.34) * bossBreath;
      node.group.scale.setScalar(scale);
      const pulse = node.pulses[kind];
      if (pulse) {
        const pulseSpeed = kind === "warden" ? 0.52 : kind === "archon" ? -0.72 : -1.1;
        pulse.rotation.z = reducedMotion ? 0 : time * pulseSpeed;
        pulse.scale.setScalar(1 + (reducedMotion ? 0 : Math.sin(time * 3.3 + index) * 0.075));
      }
      if (boss) {
        const priority = kind === "archon" ? 3 : kind === "core" ? 2 : 1;
        if (priority > targetPriority || (priority === targetPriority && approach > targetApproach)) {
          targetNode = node;
          targetKind = kind;
          targetPriority = priority;
          targetApproach = approach;
        }
      }
    }
    if (targetNode && targetKind) {
      const reticleScale = targetKind === "archon" ? 2.18 : targetKind === "core" ? 1.82 : 1.62;
      targetReticle.visible = true;
      targetReticle.position.copy(targetNode.group.position);
      targetReticle.position.z += 0.05;
      targetReticle.scale.setScalar(reticleScale);
      targetReticle.rotation.z = reducedMotion ? 0 : time * (targetKind === "archon" ? -1.15 : 1.1);
    } else {
      targetReticle.visible = false;
    }

    if (victory) {
      // The settlement is a visual release: clear leftover bullets, rocks,
      // and impact sparks so the signal lock gets the whole frame.
      asteroidMesh.count = 0;
      friendlyShotMesh.count = 0;
      enemyShotMesh.count = 0;
      sparkGeometry.setDrawRange(0, 0);
      asteroidMesh.instanceMatrix.needsUpdate = true;
      friendlyShotMesh.instanceMatrix.needsUpdate = true;
      enemyShotMesh.instanceMatrix.needsUpdate = true;
    } else {
      updateAsteroids(world, time, reducedMotion);
      updateShots(world);
      updateSparks(world);
    }

    // A static camera keeps the background from "breathing" with the ship;
    // player motion remains legible because the interceptor itself moves.
    camera.position.set(0, 0.24, 7);
    camera.lookAt(0, -0.28, -1.4);
    renderer.render(scene, camera);
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    onContextLost();
  };

  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  resize();

  return {
    render,
    resize,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      for (const item of geometries) item.dispose();
      for (const item of materials) item.dispose();
      renderer.renderLists.dispose();
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
};
