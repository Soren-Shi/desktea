export function captureVideoFrame(
  video: HTMLVideoElement,
  maxDim = 1024,
  quality = 0.82
): { dataUrl: string; mimeType: string } {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D unavailable");
  }
  ctx.drawImage(video, 0, 0, w, h);
  const mimeType = "image/jpeg";
  return {
    dataUrl: canvas.toDataURL(mimeType, quality),
    mimeType,
  };
}

export function sampleTinyGrayscale(video: HTMLVideoElement): Uint8Array | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const w = 64;
  const h = 36;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
}

export function computeFrameDiffPercent(
  prev: Uint8Array | null,
  curr: Uint8Array | null
): number {
  if (!prev || !curr || prev.length !== curr.length || prev.length === 0) {
    return 100;
  }
  let diffSum = 0;
  for (let i = 0; i < prev.length; i++) {
    diffSum += Math.abs(prev[i] - curr[i]);
  }
  return (diffSum / (prev.length * 255)) * 100;
}
