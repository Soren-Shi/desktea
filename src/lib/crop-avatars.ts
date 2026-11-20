import type { Box2D, DeskObject } from "./ai/types";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export async function compressImageToDataUrl(
  source: File | Blob | string,
  maxDim = 1280,
  quality = 0.86
): Promise<{ dataUrl: string; mimeType: string }> {
  const objectUrl =
    typeof source === "string" ? source : URL.createObjectURL(source);

  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D unavailable");
    }
    ctx.drawImage(img, 0, 0, width, height);
    const mimeType = "image/jpeg";
    return {
      dataUrl: canvas.toDataURL(mimeType, quality),
      mimeType,
    };
  } finally {
    if (typeof source !== "string") {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function makeFallbackBadgeDataUrl(index: number): string {
  const num = String(index).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" fill="#ECE9E1"/>
    <rect x="6" y="6" width="148" height="148" fill="none" stroke="#141413" stroke-width="2"/>
    <text x="80" y="92" font-family="monospace" font-size="44" font-weight="600" fill="#141413" text-anchor="middle">${num}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function cropSingleBox(
  img: HTMLImageElement,
  box: Box2D,
  index: number,
  size = 160
): string {
  try {
    const [ymin, xmin, ymax, xmax] = box;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return makeFallbackBadgeDataUrl(index);

    const rawX = (xmin / 1000) * w;
    const rawY = (ymin / 1000) * h;
    const rawW = Math.max(12, ((xmax - xmin) / 1000) * w);
    const rawH = Math.max(12, ((ymax - ymin) / 1000) * h);

    // Add 12% breathing room and square-pad around center so avatars look editorial & crisp
    const side = Math.max(rawW, rawH) * 1.16;
    const cx = rawX + rawW / 2;
    const cy = rawY + rawH / 2;

    const clampedSide = Math.min(side, Math.min(w, h));
    let sx = cx - clampedSide / 2;
    let sy = cy - clampedSide / 2;
    sx = Math.max(0, Math.min(w - clampedSide, sx));
    sy = Math.max(0, Math.min(h - clampedSide, sy));

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return makeFallbackBadgeDataUrl(index);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, clampedSide, clampedSide, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return makeFallbackBadgeDataUrl(index);
  }
}

export async function cropSingleBoxFromSrc(
  imageSrc: string,
  box: Box2D,
  index = 99,
  size = 160
): Promise<string> {
  try {
    const img = await loadImage(imageSrc);
    return cropSingleBox(img, box, index, size);
  } catch {
    return makeFallbackBadgeDataUrl(index);
  }
}

export async function cropObjectAvatars(
  imageSrc: string,
  objects: DeskObject[]
): Promise<DeskObject[]> {
  try {
    const img = await loadImage(imageSrc);
    return objects.map((obj) => ({
      ...obj,
      avatarUrl: obj.avatarUrl || cropSingleBox(img, obj.box_2d, obj.index),
    }));
  } catch {
    return objects.map((obj) => ({
      ...obj,
      avatarUrl: obj.avatarUrl || makeFallbackBadgeDataUrl(obj.index),
    }));
  }
}
