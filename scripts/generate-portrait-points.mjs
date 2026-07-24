import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
// The user-approved particle reference is sampled only at build time. The
// Three.js client receives this generated meta JSON + a quantized binary
// point cloud, never image pixels.
const sourcePath = resolve(projectRoot, "static/0xaa-particle-reference.png");
const metaOutputPath = resolve(projectRoot, "app/generated/portrait-points.meta.json");
const publicDirectory = resolve(projectRoot, "public");
const crop = { x: 505, y: 50, width: 660, height: 830 };
const sampleStep = 1;
const desktopCount = 30_000;
const mobileCount = 12_000;
const pointStride = 7;

const stableHash = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round = (value) => Number(value.toFixed(6));
const smoothstep = (edge0, edge1, value) => {
  const ratio = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
};

const sourceBuffer = await readFile(sourcePath);
const image = PNG.sync.read(sourceBuffer);

if (crop.x + crop.width > image.width || crop.y + crop.height > image.height) {
  throw new Error("The portrait crop exceeds the image bounds.");
}

const cropPixelCount = crop.width * crop.height;
const luminance = new Float32Array(cropPixelCount);

for (let y = 0; y < crop.height; y += 1) {
  for (let x = 0; x < crop.width; x += 1) {
    const sourceOffset = ((crop.y + y) * image.width + crop.x + x) * 4;
    const alpha = image.data[sourceOffset + 3] / 255;
    luminance[y * crop.width + x] =
      alpha *
      ((0.2126 * image.data[sourceOffset] +
        0.7152 * image.data[sourceOffset + 1] +
        0.0722 * image.data[sourceOffset + 2]) /
        255);
  }
}

const integralWidth = crop.width + 1;
const integral = new Float32Array((crop.height + 1) * integralWidth);

for (let y = 1; y <= crop.height; y += 1) {
  let rowSum = 0;
  for (let x = 1; x <= crop.width; x += 1) {
    rowSum += luminance[(y - 1) * crop.width + x - 1];
    integral[y * integralWidth + x] = integral[(y - 1) * integralWidth + x] + rowSum;
  }
}

const boxAverage = (x, y, radius) => {
  const left = Math.max(0, x - radius);
  const right = Math.min(crop.width - 1, x + radius);
  const top = Math.max(0, y - radius);
  const bottom = Math.min(crop.height - 1, y + radius);
  const x1 = right + 1;
  const y1 = bottom + 1;
  const sum =
    integral[y1 * integralWidth + x1] -
    integral[top * integralWidth + x1] -
    integral[y1 * integralWidth + left] +
    integral[top * integralWidth + left];

  return sum / ((x1 - left) * (y1 - top));
};

const candidates = [];

for (let y = 1; y < crop.height - 1; y += sampleStep) {
  for (let x = 1; x < crop.width - 1; x += sampleStep) {
    const index = y * crop.width + x;
    const tone = luminance[index];
    const ink = Math.max(0, (tone - 0.035) / 0.965);
    const localEnergy = boxAverage(x, y, 12);
    const mask = smoothstep(0.045, 0.15, localEnergy);
    const gradient = Math.min(
      1,
      (Math.abs(luminance[index - 1] - luminance[index + 1]) +
        Math.abs(luminance[index - crop.width] - luminance[index + crop.width])) *
        1.9,
    );
    const weight = mask * (0.026 + 0.82 * Math.pow(ink, 0.72) + 0.19 * Math.pow(gradient, 0.68));

    if (weight <= 0.006) continue;

    const desktopKey = -Math.log(Math.max(stableHash(x + 103, y + 691), 0.000001)) / weight;
    const mobileKey = -Math.log(Math.max(stableHash(x + 859, y + 233), 0.000001)) / weight;
    const rareSparkle = stableHash(x + 17, y + 941) > 0.992 ? 0.46 : 0;
    const jitterX = (stableHash(x + 433, y + 97) - 0.5) * 0.66;
    const jitterY = (stableHash(x + 701, y + 59) - 0.5) * 0.66;

    candidates.push({
      id: index,
      desktopKey,
      mobileKey,
      point: [
        round((x + 0.5 + jitterX) / crop.width),
        round((y + 0.5 + jitterY) / crop.height),
        round((stableHash(x + 97, y + 43) - 0.5) * (0.018 + 0.06 * Math.sqrt(weight))),
        round(0.45 + 1.15 * Math.pow(ink, 0.58) + 0.55 * Math.pow(gradient, 0.7) + rareSparkle),
        round(Math.min(1, 0.05 + 0.9 * Math.pow(ink, 0.72))),
        round(0.1 + 0.88 * Math.pow(ink, 0.58)),
        round(stableHash(x + 211, y + 619) * Math.PI * 2),
      ],
    });
  }
}

const choose = (key, count, excluded = new Set()) =>
  candidates
    .filter(({ id }) => !excluded.has(id))
    .sort((first, second) => first[key] - second[key])
    .slice(0, count);

// A distinct weighted mobile draw keeps the first setDrawRange subset faithful
// to the full portrait instead of reducing it to a bright outline.
const mobile = choose("mobileKey", mobileCount);
const selectedIds = new Set(mobile.map(({ id }) => id));
const desktopRemainder = choose("desktopKey", desktopCount - mobile.length, selectedIds);
const selected = [...mobile, ...desktopRemainder];

// Quantize each of the 7 channels independently to an unsigned 16-bit range so
// the point cloud can ship as a small binary asset instead of a ~1.9MB JSON
// array. Per-channel min/range are stored in the meta file so the client can
// dequantize back to floats.
const channelMin = new Array(pointStride).fill(Infinity);
const channelMax = new Array(pointStride).fill(-Infinity);

for (const { point } of selected) {
  for (let channel = 0; channel < pointStride; channel += 1) {
    const value = point[channel];
    if (value < channelMin[channel]) channelMin[channel] = value;
    if (value > channelMax[channel]) channelMax[channel] = value;
  }
}

const channels = channelMin.map((min, channel) => {
  const max = channelMax[channel];
  // Guard against a degenerate (constant-value) channel producing a zero range.
  const range = max - min > 0 ? max - min : 1;
  return { min: round(min), range: round(range) };
});

const QUANTIZED_MAX = 65535;
const bin = Buffer.alloc(selected.length * pointStride * 2);

selected.forEach(({ point }, pointIndex) => {
  for (let channel = 0; channel < pointStride; channel += 1) {
    const { min, range } = channels[channel];
    const normalized = clamp((point[channel] - min) / range, 0, 1);
    const quantized = Math.round(normalized * QUANTIZED_MAX);
    const byteOffset = (pointIndex * pointStride + channel) * 2;
    bin.writeUInt16LE(quantized, byteOffset);
  }
});

// The mobile selection is deliberately first in `selected`, so it can share
// the exact same quantization channels as the desktop cloud while shipping a
// smaller prefix payload for mobile clients.
const mobileBin = bin.subarray(0, mobile.length * pointStride * 2);
const contentHash = (payload) => createHash("sha256").update(payload).digest("hex").slice(0, 16);

// Keep content hashes in metadata for integrity checks and use them in the
// emitted pathnames. Sampling, quantization, and encoding changes therefore
// produce new immutable asset URLs rather than reusing a mutable response.
const sourceHash = contentHash(bin);
const mobileHash = contentHash(mobileBin);
// Put the content hash in the pathname, rather than only a query parameter.
// Public assets are otherwise served from a stable pathname, which could let
// an older page decode a newer point cloud during a rolling deployment.
const desktopAssetName = `portrait-points.${sourceHash}.bin`;
const mobileAssetName = `portrait-points.mobile.${mobileHash}.bin`;
const binOutputPath = resolve(publicDirectory, desktopAssetName);
const mobileBinOutputPath = resolve(publicDirectory, mobileAssetName);

const meta = {
  version: 2,
  stride: pointStride,
  aspectRatio: crop.height / crop.width,
  lod: {
    mobile: mobile.length,
    desktop: selected.length,
  },
  count: selected.length,
  sourceHash,
  channels,
  bin: `/${desktopAssetName}`,
  mobileHash,
  mobileBin: `/${mobileAssetName}`,
};

await mkdir(dirname(metaOutputPath), { recursive: true });
await mkdir(publicDirectory, { recursive: true });
// Intentionally do not clean older public/portrait-points*.bin files. A page
// already running an earlier client bundle must be able to finish loading the
// binary named by its embedded meta after a newer deployment is live.
await writeFile(metaOutputPath, `${JSON.stringify(meta)}\n`);
await writeFile(binOutputPath, bin);
await writeFile(mobileBinOutputPath, mobileBin);
console.log(
  `Generated ${selected.length} portrait points -> ${metaOutputPath} (meta) + ${binOutputPath} (${bin.length} bytes) + ${mobileBinOutputPath} (${mobileBin.length} bytes)`,
);
