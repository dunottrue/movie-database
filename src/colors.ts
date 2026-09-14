import { useState } from "react";

export const FALLBACK = ["#7c5cff", "#38c6ff", "#ff5fb0"];
const cache = new Map<string, string[]>();
const inflight = new Set<string>();

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function colorDistance(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const dr = (pa >> 16) - (pb >> 16);
  const dg = ((pa >> 8) & 0xff) - ((pb >> 8) & 0xff);
  const db = (pa & 0xff) - (pb & 0xff);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function extractColors(url: string, onDone: (colors: string[]) => void): void {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const size = 24;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = Math.max(1, Math.round((size * img.height) / img.width));
      const ctx = canvas.getContext("2d");
      if (!ctx) return onDone(FALLBACK);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < 22 && g < 22 && b < 22) continue;
        const key = `${r >> 5}:${g >> 5}:${b >> 5}`;
        const hit = buckets.get(key);
        if (hit) {
          hit.r += r; hit.g += g; hit.b += b; hit.n += 1;
        } else {
          buckets.set(key, { r, g, b, n: 1 });
        }
      }

      const top = [...buckets.values()].sort((a, z) => z.n - a.n).slice(0, 12);
      const picked: string[] = [];
      for (const c of top) {
        const hex =
          "#" +
          [c.r, c.g, c.b]
            .map((ch) => Math.round(ch / c.n).toString(16).padStart(2, "0"))
            .join("");
        if (picked.every((p) => colorDistance(p, hex) > 90)) picked.push(hex);
        if (picked.length >= 3) break;
      }
      const out = picked.length >= 2 ? picked.slice(0, 3) : [...FALLBACK];
      while (out.length < 3) out.push(shade(out[out.length - 1], -45));
      onDone(out);
    } catch {
      onDone(FALLBACK);
    }
  };
  img.onerror = () => onDone(FALLBACK);
  img.src = url;
}

export function usePosterColors(url: string): string[] {
  const [colors, setColors] = useState<string[]>(() => cache.get(url) || FALLBACK);

  if (!cache.has(url)) {
    // запускаем извлечение один раз на URL (защита от параллельных дублей)
    if (!inflight.has(url)) {
      inflight.add(url);
      extractColors(url, (out) => {
        inflight.delete(url);
        cache.set(url, out);
        setColors(out);
      });
    }
  }

  return colors;
}