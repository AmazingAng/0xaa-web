import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const sourcePath = resolve(projectRoot, "static/0xaa.png");
const outputPath = resolve(projectRoot, "app/generated/portrait-points.json");
const crop = { x: 24, y: 0, width: 352, height: 400 };
const sampleSize = 168;
const desktopCount = 1650;
const mobileCount = 760;
const pointStride = 7;

const stableHash = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round = (value) => Number(value.toFixed(6));

const sourceBuffer = await readFile(sourcePath);
const image = PNG.sync.read(sourceBuffer);

if (crop.x + crop.width > image.width || crop.y + crop.height > image.height) {
  throw new Error("The portrait crop exceeds the image bounds.");
}

const samplePixel = (x, y) => {
  const sourceX = clamp(
    crop.x + ((x + 0.5) / sampleSize) * crop.width - 0.5,
    crop.x,
    crop.x + crop.width - 1,
  );
  const sourceY = clamp(
    crop.y + ((y + 0.5) / sampleSize) * crop.height - 0.5,
    crop.y,
    crop.y + crop.height - 1,
  );
  const left = Math.floor(sourceX);
  const top = Math.floor(sourceY);
  const right = Math.min(left + 1, image.width - 1);
  const bottom = Math.min(top + 1, image.height - 1);
  const mixX = sourceX - left;
  const mixY = sourceY - top;
  const topLeft = (top * image.width + left) * 4;
  const topRight = (top * image.width + right) * 4;
  const bottomLeft = (bottom * image.width + left) * 4;
  const bottomRight = (bottom * image.width + right) * 4;

  return [0, 1, 2, 3].map((channel) => {
    const topValue = image.data[topLeft + channel] * (1 - mixX) + image.data[topRight + channel] * mixX;
    const bottomValue =
      image.data[bottomLeft + channel] * (1 - mixX) + image.data[bottomRight + channel] * mixX;
    return topValue * (1 - mixY) + bottomValue * mixY;
  });
};

const luminanceAt = (x, y) => {
  const [red, green, blue] = samplePixel(x, y);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
};

const candidates = [];

for (let y = 1; y < sampleSize - 1; y += 2) {
  for (let x = 1; x < sampleSize - 1; x += 2) {
    const [red, green, blue, alphaChannel] = samplePixel(x, y);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const leftLuminance = luminanceAt(x - 1, y);
    const rightLuminance = luminanceAt(x + 1, y);
    const aboveLuminance = luminanceAt(x, y - 1);
    const belowLuminance = luminanceAt(x, y + 1);
    const alpha = alphaChannel / 255;
    const ink = alpha * Math.pow(Math.max(0, (0.95 - luminance) / 0.95), 0.74);
    const edge = Math.min(
      1,
      (Math.abs(leftLuminance - rightLuminance) + Math.abs(aboveLuminance - belowLuminance)) * 1.32,
    );
    const body = Math.max(0, ink - 0.67) * 0.18;
    const density = Math.min(0.96, edge * 0.97 + body);
    const chance = stableHash(x, y);

    if (density < 0.1 || chance > density) continue;

    const edgeWeight = Math.min(1, edge * 1.55);
    candidates.push({
      rank: edge * 0.9 + body * 0.08 + stableHash(x + 641, y + 73) * 0.02,
      point: [
        round((x + 0.5) / sampleSize),
        round((y + 0.5) / sampleSize),
        round((stableHash(x + 97, y + 43) - 0.5) * 0.18),
        round(1.02 + edgeWeight * 1.52 + stableHash(x + 7, y + 11) * 0.4),
        round(0.24 + edgeWeight * 0.68 + body * 0.2),
        round(0.3 + edgeWeight * 0.64 + body * 0.15),
        round(stableHash(x + 211, y + 619) * Math.PI * 2),
      ],
    });
  }
}

const selected = candidates
  .sort((first, second) => second.rank - first.rank)
  .slice(0, desktopCount)
  .map(({ point }) => point);
const points = selected.flat();
const payload = {
  version: 1,
  stride: pointStride,
  aspectRatio: crop.height / crop.width,
  lod: {
    mobile: Math.min(mobileCount, selected.length),
    desktop: selected.length,
  },
  sourceHash: createHash("sha256").update(sourceBuffer).digest("hex").slice(0, 16),
  points,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
console.log(`Generated ${selected.length} portrait points at ${outputPath}`);
