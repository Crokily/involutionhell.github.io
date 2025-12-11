import { readFileSync } from "node:fs";

const svgPath = process.argv[2] ?? "public/mascot.svg";
const svgContent = readFileSync(svgPath, "utf8");

const rects = [...svgContent.matchAll(/<rect[^>]+>/g)];

let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;

for (const match of rects) {
  const rect = match[0];
  const x = +(rect.match(/x="([\d.]+)"/)?.[1] ?? NaN);
  const y = +(rect.match(/y="([\d.]+)"/)?.[1] ?? NaN);
  const width = +(rect.match(/width="([\d.]+)"/)?.[1] ?? NaN);
  const height = +(rect.match(/height="([\d.]+)"/)?.[1] ?? NaN);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    continue;
  }

  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  maxX = Math.max(maxX, x + width);
  maxY = Math.max(maxY, y + height);
}

console.log(
  JSON.stringify(
    {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.ceil(maxX - minX),
      height: Math.ceil(maxY - minY),
    },
    null,
    2,
  ),
);
