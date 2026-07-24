import * as THREE from "three";
import type { FableGatePhase, GateWorld } from "./FableGate";

export type FableGateRenderer = {
  render: (world: GateWorld, phase: FableGatePhase, reducedMotion: boolean, delta: number) => void;
  resize: () => void;
  dispose: () => void;
};

const SYNAPSE_POOL = 6;
const NOISE_POOL = 4;
const DUST_COUNT = 260;
const TRAIL_COUNT = 36;
const BURST_COUNT = 72;
const SOCKET_COUNT = 12;
const TRANSFER_POOL = 4;
const PIXEL_RATIO_CAP = 1.25;
const MOBILE_PIXEL_RATIO_CAP = 1;
const GATE_RENDER_RATE = 45;

const GOLD = new THREE.Color("#f2c76f");
const EMBER = new THREE.Color("#ff9e64");
const CREAM = new THREE.Color("#fff3da");
const TEAL = new THREE.Color("#7ee8d8");
const ROSE = new THREE.Color("#ff4d6d");
const NIGHT = new THREE.Color("#05060e");

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
    float bloomA = smoothstep(0.75, 0.0, distance(vUv, vec2(0.30 + 0.05 * sin(uTime * 0.11), 0.62)));
    float bloomB = smoothstep(0.68, 0.0, distance(vUv, vec2(0.74, 0.34 + 0.06 * cos(uTime * 0.09))));
    vec3 color = uNight;
    color += uGold * bloomA * 0.10;
    color += uTeal * bloomB * 0.07;
    color *= 0.55 + 0.45 * vignette;
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

type SynapseVisual = {
  group: THREE.Group;
  shell: THREE.Mesh;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  glowMaterial: THREE.ShaderMaterial;
  shellMaterial: THREE.MeshBasicMaterial;
  coreMaterial: THREE.MeshBasicMaterial;
};

type NoiseVisual = {
  group: THREE.Group;
  shard: THREE.Mesh;
  glow: THREE.Mesh;
  glowMaterial: THREE.ShaderMaterial;
};

type TransferVisual = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
};

export const createFableGateRenderer = (
  canvas: HTMLCanvasElement,
  { compact }: { compact: boolean },
): FableGateRenderer => {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  const pixelRatioCap = compact ? MOBILE_PIXEL_RATIO_CAP : PIXEL_RATIO_CAP;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(NIGHT.getHex(), 0.026);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 90);
  camera.position.set(0, 0, 7);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(resource: T): T => {
    disposables.push(resource);
    return resource;
  };

  // Backdrop nebula — one large quad far behind the playfield.
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
  const backdrop = new THREE.Mesh(track(new THREE.PlaneGeometry(160, 100)), backdropMaterial);
  backdrop.position.set(0, 0, -48);
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  // Drifting gold/teal dust.
  const activeDustCount = compact ? 130 : DUST_COUNT;
  const dustGeometry = track(new THREE.BufferGeometry());
  const dustPositions = new Float32Array(activeDustCount * 3);
  const dustColors = new Float32Array(activeDustCount * 3);
  for (let index = 0; index < activeDustCount; index += 1) {
    dustPositions[index * 3] = (seeded(index, 1) - 0.5) * 26;
    dustPositions[index * 3 + 1] = (seeded(index, 2) - 0.5) * 15;
    dustPositions[index * 3 + 2] = -46 + seeded(index, 3) * 52;
    const tint = seeded(index, 4) > 0.72 ? TEAL : GOLD;
    const fade = 0.35 + seeded(index, 5) * 0.65;
    dustColors[index * 3] = tint.r * fade;
    dustColors[index * 3 + 1] = tint.g * fade;
    dustColors[index * 3 + 2] = tint.b * fade;
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dustMaterial = track(
    new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // Shared geometries.
  const shellGeometry = track(new THREE.IcosahedronGeometry(0.17, 1));
  const coreGeometry = track(new THREE.IcosahedronGeometry(0.085, 1));
  const shardGeometry = track(new THREE.IcosahedronGeometry(0.23, 0));
  const glowGeometry = track(new THREE.PlaneGeometry(1, 1));

  // Synapse node pool.
  const synapseVisuals: SynapseVisual[] = [];
  for (let index = 0; index < SYNAPSE_POOL; index += 1) {
    const group = new THREE.Group();
    const shellMaterial = track(
      new THREE.MeshBasicMaterial({
        color: GOLD.clone(),
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      }),
    );
    const coreMaterial = track(
      new THREE.MeshBasicMaterial({ color: CREAM.clone(), transparent: true, opacity: 0.95 }),
    );
    const glowMaterial = track(makeGlowMaterial(GOLD, 0.55));
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.scale.setScalar(1.7);
    group.add(shell, core, glow);
    group.visible = false;
    scene.add(group);
    synapseVisuals.push({ group, shell, core, glow, glowMaterial, shellMaterial, coreMaterial });
  }

  // Noise orb pool.
  const noiseVisuals: NoiseVisual[] = [];
  for (let index = 0; index < NOISE_POOL; index += 1) {
    const group = new THREE.Group();
    const shardMaterial = track(
      new THREE.MeshBasicMaterial({
        color: ROSE.clone(),
        wireframe: true,
        transparent: true,
        opacity: 0.9,
      }),
    );
    const glowMaterial = track(makeGlowMaterial(ROSE, 0.4));
    const shard = new THREE.Mesh(shardGeometry, shardMaterial);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.scale.setScalar(1.5);
    group.add(shard, glow);
    group.visible = false;
    scene.add(group);
    noiseVisuals.push({ group, shard, glow, glowMaterial });
  }

  // Player comet.
  const player = new THREE.Group();
  const playerCoreMaterial = track(
    new THREE.MeshBasicMaterial({ color: CREAM.clone(), transparent: true, opacity: 1 }),
  );
  const playerCore = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.11, 2)), playerCoreMaterial);
  const playerGlowMaterial = track(makeGlowMaterial(EMBER, 0.9));
  const playerGlow = new THREE.Mesh(glowGeometry, playerGlowMaterial);
  playerGlow.scale.setScalar(1.9);
  player.add(playerCore, playerGlow);
  scene.add(player);

  // Comet trail ring buffer.
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
          gl_PointSize = (1.0 - aAge) * 9.0 * uPixelRatio;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAge;
        uniform vec3 uColor;
        void main() {
          vec2 offset = gl_PointCoord - vec2(0.5);
          float alpha = smoothstep(0.5, 0.05, length(offset)) * (1.0 - vAge);
          gl_FragColor = vec4(uColor, alpha * 0.85);
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

  // Ignition burst particles.
  const burstGeometry = track(new THREE.BufferGeometry());
  const burstPositions = new Float32Array(BURST_COUNT * 3);
  const burstVelocities = new Float32Array(BURST_COUNT * 3);
  const burstLives = new Float32Array(BURST_COUNT).fill(1);
  burstGeometry.setAttribute("position", new THREE.BufferAttribute(burstPositions, 3));
  burstGeometry.setAttribute("aLife", new THREE.BufferAttribute(burstLives, 1));
  const burstMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: `
        attribute float aLife;
        varying float vLife;
        uniform float uPixelRatio;
        void main() {
          vLife = aLife;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.0 - aLife) * 12.0 * uPixelRatio + 2.0;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vLife;
        uniform vec3 uColor;
        void main() {
          if (vLife >= 1.0) discard;
          vec2 offset = gl_PointCoord - vec2(0.5);
          float alpha = smoothstep(0.5, 0.0, length(offset)) * (1.0 - vLife);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      uniforms: {
        uColor: { value: GOLD.clone() },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const bursts = new THREE.Points(burstGeometry, burstMaterial);
  bursts.frustumCulled = false;
  scene.add(bursts);
  let burstCursor = 0;

  // Constellation arc sockets — one lights up per ignited synapse.
  const socketVisuals: THREE.Mesh[] = [];
  const socketMaterials: THREE.ShaderMaterial[] = [];
  for (let index = 0; index < SOCKET_COUNT; index += 1) {
    const angle = Math.PI * (0.82 - (index / (SOCKET_COUNT - 1)) * 0.64);
    const material = track(makeGlowMaterial(GOLD, 0.06));
    const socket = new THREE.Mesh(glowGeometry, material);
    socket.position.set(Math.cos(angle) * 4.6, 1.15 + Math.sin(angle) * 1.55, -2.6);
    socket.scale.setScalar(0.5);
    scene.add(socket);
    socketVisuals.push(socket);
    socketMaterials.push(material);
  }

  // Sparks that fly from an ignited synapse to its constellation socket.
  const transferVisuals: TransferVisual[] = [];
  for (let index = 0; index < TRANSFER_POOL; index += 1) {
    const material = track(makeGlowMaterial(CREAM, 1));
    const mesh = new THREE.Mesh(glowGeometry, material);
    mesh.scale.setScalar(0.55);
    mesh.visible = false;
    scene.add(mesh);
    transferVisuals.push({ mesh, material });
  }

  // Victory bloom ring.
  const bloomRingMaterial = track(
    new THREE.MeshBasicMaterial({
      color: GOLD.clone(),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  const bloomRing = new THREE.Mesh(track(new THREE.RingGeometry(0.92, 1, 64)), bloomRingMaterial);
  bloomRing.position.set(0, 0, -1);
  bloomRing.visible = false;
  scene.add(bloomRing);

  let renderAccumulator = 0;
  const renderInterval = 1 / GATE_RENDER_RATE;
  let sceneTime = 0;

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

  const spawnBurst = (x: number, y: number, z: number, tint: THREE.Color) => {
    (burstMaterial.uniforms.uColor as { value: THREE.Color }).value.copy(tint);
    const spawnCount = compact ? 10 : 16;
    for (let index = 0; index < spawnCount; index += 1) {
      const slot = burstCursor;
      burstCursor = (burstCursor + 1) % BURST_COUNT;
      const theta = seeded(slot, sceneTime) * Math.PI * 2;
      const lift = (seeded(slot, sceneTime + 9) - 0.5) * 2;
      const pace = 1.6 + seeded(slot, sceneTime + 17) * 2.4;
      burstPositions[slot * 3] = x;
      burstPositions[slot * 3 + 1] = y;
      burstPositions[slot * 3 + 2] = z;
      burstVelocities[slot * 3] = Math.cos(theta) * pace;
      burstVelocities[slot * 3 + 1] = Math.sin(theta) * pace + lift;
      burstVelocities[slot * 3 + 2] = (seeded(slot, sceneTime + 31) - 0.35) * 3;
      burstLives[slot] = 0;
    }
  };

  let previousCharge = 0;
  let previousHitAt = 0;

  const render = (world: GateWorld, phase: FableGatePhase, reducedMotion: boolean, delta: number) => {
    renderAccumulator += delta;
    if (renderAccumulator < renderInterval) return;
    const frameDelta = Math.min(renderAccumulator, 0.1);
    renderAccumulator = 0;
    sceneTime += frameDelta;

    (backdropMaterial.uniforms.uTime as { value: number }).value = sceneTime;

    // Dust drifts toward the camera with the world's forward speed.
    const drift = (reducedMotion ? 0.25 : 0.55) * world.speed * frameDelta;
    for (let index = 0; index < activeDustCount; index += 1) {
      dustPositions[index * 3 + 2] += drift;
      if (dustPositions[index * 3 + 2] > 6) dustPositions[index * 3 + 2] -= 52;
    }
    dustGeometry.getAttribute("position").needsUpdate = true;

    // Player comet follows the simulated position.
    player.position.set(world.playerX, world.playerY, 0);
    const pulse = 1 + Math.sin(sceneTime * 5.2) * 0.06;
    playerCore.scale.setScalar(pulse);
    playerGlow.quaternion.copy(camera.quaternion);
    const invulnerable = world.lastHitAt > 0 && world.elapsed - world.lastHitAt < 1.2;
    playerCoreMaterial.opacity = invulnerable ? 0.45 + Math.sin(sceneTime * 26) * 0.35 : 1;

    // Trail ring buffer.
    if (!reducedMotion && phase === "active") {
      trailPositions[trailHead * 3] = world.playerX + (seeded(trailHead, sceneTime) - 0.5) * 0.06;
      trailPositions[trailHead * 3 + 1] = world.playerY + (seeded(trailHead, sceneTime + 3) - 0.5) * 0.06;
      trailPositions[trailHead * 3 + 2] = 0.02;
      trailAges[trailHead] = 0;
      trailHead = (trailHead + 1) % TRAIL_COUNT;
    }
    for (let index = 0; index < TRAIL_COUNT; index += 1) {
      trailAges[index] = Math.min(1, trailAges[index] + frameDelta * 1.7);
    }
    trailGeometry.getAttribute("position").needsUpdate = true;
    trailGeometry.getAttribute("aAge").needsUpdate = true;

    // Synapse nodes.
    for (let index = 0; index < SYNAPSE_POOL; index += 1) {
      const node = world.nodes[index];
      const visual = synapseVisuals[index];
      if (!node || !node.active) {
        visual.group.visible = false;
        continue;
      }
      visual.group.visible = true;
      visual.group.position.set(node.x, node.y, node.z);
      visual.shell.rotation.x += frameDelta * (0.6 + node.seed);
      visual.shell.rotation.y += frameDelta * 0.9;
      visual.glow.quaternion.copy(camera.quaternion);
      if (node.ignited) {
        const since = Math.max(0, world.elapsed - node.ignitedAt);
        const flare = Math.max(0, 1 - since * 2.2);
        visual.glowMaterial.uniforms.uIntensity.value = 0.55 + flare * 1.4;
        visual.shellMaterial.color.copy(CREAM);
        visual.coreMaterial.opacity = 0.4 + flare * 0.6;
        visual.group.scale.setScalar(1 + flare * 0.7);
      } else {
        const shimmer = 0.5 + Math.sin(sceneTime * 3 + node.seed * 9) * 0.18;
        visual.glowMaterial.uniforms.uIntensity.value = shimmer;
        visual.shellMaterial.color.copy(GOLD);
        visual.coreMaterial.opacity = 0.95;
        visual.group.scale.setScalar(1);
      }
    }

    // Noise orbs.
    for (let index = 0; index < NOISE_POOL; index += 1) {
      const orb = world.noises[index];
      const visual = noiseVisuals[index];
      if (!orb || !orb.active) {
        visual.group.visible = false;
        continue;
      }
      visual.group.visible = true;
      const jitter = reducedMotion ? 0 : (seeded(index, Math.floor(sceneTime * 18)) - 0.5) * 0.05;
      visual.group.position.set(orb.x + jitter, orb.y - jitter, orb.z);
      visual.shard.rotation.x -= frameDelta * 1.7;
      visual.shard.rotation.z += frameDelta * 1.2;
      visual.glow.quaternion.copy(camera.quaternion);
      visual.glowMaterial.uniforms.uIntensity.value = 0.32 + Math.sin(sceneTime * 7 + index * 2) * 0.12;
    }

    // Ignition feedback: burst at every newly ignited synapse.
    if (world.charge !== previousCharge) {
      previousCharge = world.charge;
      for (const node of world.nodes) {
        if (node.active && node.ignited && world.elapsed - node.ignitedAt < 0.1) {
          spawnBurst(node.x, node.y, node.z, GOLD);
        }
      }
    }
    if (world.lastHitAt !== previousHitAt && world.lastHitAt > 0) {
      previousHitAt = world.lastHitAt;
      spawnBurst(world.playerX, world.playerY, 0, ROSE);
    }

    // Advance burst particles.
    for (let index = 0; index < BURST_COUNT; index += 1) {
      if (burstLives[index] >= 1) continue;
      burstLives[index] = Math.min(1, burstLives[index] + frameDelta * 1.4);
      burstPositions[index * 3] += burstVelocities[index * 3] * frameDelta;
      burstPositions[index * 3 + 1] += burstVelocities[index * 3 + 1] * frameDelta;
      burstPositions[index * 3 + 2] += burstVelocities[index * 3 + 2] * frameDelta;
    }
    burstGeometry.getAttribute("position").needsUpdate = true;
    burstGeometry.getAttribute("aLife").needsUpdate = true;

    // Constellation sockets and transfer sparks.
    for (let index = 0; index < SOCKET_COUNT; index += 1) {
      const material = socketMaterials[index];
      const lit = index < world.charge;
      const target = lit ? 0.85 + Math.sin(sceneTime * 2.4 + index) * 0.15 : 0.06;
      material.uniforms.uIntensity.value +=
        (target - (material.uniforms.uIntensity.value as number)) * Math.min(1, frameDelta * 6);
      socketVisuals[index].quaternion.copy(camera.quaternion);
    }
    for (let index = 0; index < TRANSFER_POOL; index += 1) {
      const transfer = world.transfers[index];
      const visual = transferVisuals[index];
      if (!transfer || !transfer.active) {
        visual.mesh.visible = false;
        continue;
      }
      const socket = socketVisuals[Math.min(transfer.socket, SOCKET_COUNT - 1)];
      const progress = Math.min(1, (world.elapsed - transfer.startedAt) / 0.8);
      const eased = 1 - (1 - progress) * (1 - progress);
      visual.mesh.visible = true;
      visual.mesh.position.set(
        transfer.fromX + (socket.position.x - transfer.fromX) * eased,
        transfer.fromY + (socket.position.y - transfer.fromY) * eased + Math.sin(progress * Math.PI) * 0.7,
        transfer.fromZ + (socket.position.z - transfer.fromZ) * eased,
      );
      visual.mesh.quaternion.copy(camera.quaternion);
      visual.material.uniforms.uIntensity.value = 1.1 - progress * 0.5;
    }

    // Camera: gentle sway, hit shake, victory push-in.
    const sway = reducedMotion ? 0 : 1;
    let shake = 0;
    if (!reducedMotion && world.lastHitAt > 0) {
      const sinceHit = world.elapsed - world.lastHitAt;
      if (sinceHit < 0.5) shake = (0.5 - sinceHit) * 0.5;
    }
    camera.position.x = world.playerX * 0.12 * sway + (seeded(1, sceneTime * 40) - 0.5) * shake;
    camera.position.y = world.playerY * 0.1 * sway + (seeded(2, sceneTime * 40) - 0.5) * shake;
    if (phase === "cleared") {
      const sinceClear = Math.max(0, world.elapsed - world.clearedAt);
      camera.position.z = 7 - Math.min(2.2, sinceClear * 1.4);
      bloomRing.visible = true;
      const ringScale = 0.4 + sinceClear * (reducedMotion ? 2.4 : 5.2);
      bloomRing.scale.setScalar(ringScale);
      bloomRingMaterial.opacity = Math.max(0, 0.9 - sinceClear * 0.55);
    } else {
      camera.position.z = 7;
      bloomRing.visible = false;
    }
    camera.lookAt(0, 0, -6);

    renderer.render(scene, camera);
  };

  const dispose = () => {
    for (const resource of disposables) resource.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  return { render, resize, dispose };
};
