/**
 * Client-side auto-enhance for hero images.
 *
 * Mimics the "magic wand" auto-enhance on iPhone:
 *  1. Auto-levels  — stretches each R/G/B channel so shadows → 0, highlights → 255
 *  2. Gamma correction — brightens dark images by adjusting midtones
 *  3. Vibrance boost — selectively increases saturation on dull pixels
 *
 * No external libraries needed — pure Canvas ImageData manipulation.
 */

/** Clip percentage for auto-levels (0.005 = 0.5% from each end). */
const CLIP = 0.005;

/** Maximum vibrance multiplier for very desaturated pixels. */
const VIBRANCE_STRENGTH = 0.35;

/** Target midtone brightness (0–1). Images darker than this get a gamma lift. */
const MIDTONE_TARGET = 0.45;

// ─── Helpers ──────────────────────────────────────────────

function buildHistogram(data: Uint8ClampedArray, channel: 0 | 1 | 2): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = channel; i < data.length; i += 4) {
    hist[data[i]]++;
  }
  return hist;
}

/** Find the value at a given cumulative-fraction of the histogram. */
function percentile(hist: Uint32Array, fraction: number): number {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i];
  const target = total * fraction;
  let cumulative = 0;
  for (let i = 0; i < 256; i++) {
    cumulative += hist[i];
    if (cumulative >= target) return i;
  }
  return 255;
}

/** Build a 256-entry look-up table that stretches [lo, hi] → [0, 255]. */
function levelsLUT(lo: number, hi: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const range = hi - lo || 1; // avoid divide-by-zero
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.max(0, Math.min(255, Math.round(((i - lo) / range) * 255)));
  }
  return lut;
}

// ─── Main ─────────────────────────────────────────────────

/**
 * Load an image URL into an offscreen canvas and return enhanced pixels as a Blob.
 * The returned Blob is JPEG at 92 % quality.
 */
export async function autoEnhanceImage(imageUrl: string): Promise<Blob> {
  // 1. Load the image
  const img = await loadImage(imageUrl);
  const { naturalWidth: w, naturalHeight: h } = img;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  // 2. Auto-levels per channel
  const rHist = buildHistogram(data, 0);
  const gHist = buildHistogram(data, 1);
  const bHist = buildHistogram(data, 2);

  const rLUT = levelsLUT(percentile(rHist, CLIP), percentile(rHist, 1 - CLIP));
  const gLUT = levelsLUT(percentile(gHist, CLIP), percentile(gHist, 1 - CLIP));
  const bLUT = levelsLUT(percentile(bHist, CLIP), percentile(bHist, 1 - CLIP));

  // Apply auto-levels
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = rLUT[data[i]];
    data[i + 1] = gLUT[data[i + 1]];
    data[i + 2] = bLUT[data[i + 2]];
  }

  // 3. Gamma correction for dark images
  let lumSum = 0;
  const pixelCount = w * h;
  for (let i = 0; i < data.length; i += 4) {
    // Perceived luminance (Rec. 709)
    lumSum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }
  const avgLum = lumSum / pixelCount;

  if (avgLum < MIDTONE_TARGET) {
    // Compute gamma that would push avgLum toward MIDTONE_TARGET
    const gamma = Math.log(MIDTONE_TARGET) / Math.log(Math.max(avgLum, 0.01));
    const gammaLUT = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      gammaLUT[i] = Math.round(255 * Math.pow(i / 255, 1 / gamma));
    }
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = gammaLUT[data[i]];
      data[i + 1] = gammaLUT[data[i + 1]];
      data[i + 2] = gammaLUT[data[i + 2]];
    }
  }

  // 4. Vibrance boost (selective saturation)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = (max + min) / 2;

    if (max === min) continue; // achromatic — skip

    // Current saturation (HSL)
    const sat = lum > 127.5
      ? (max - min) / (510 - max - min)
      : (max - min) / (max + min);

    // Boost inversely proportional to current saturation (vibrance, not flat saturation)
    const boost = VIBRANCE_STRENGTH * (1 - sat);
    if (boost <= 0) continue;

    // Shift each channel away from the average
    const avg = (r + g + b) / 3;
    data[i]     = Math.max(0, Math.min(255, Math.round(r + (r - avg) * boost)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g + (g - avg) * boost)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b + (b - avg) * boost)));
  }

  // 5. Write back and export
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error('Canvas export failed')); },
      'image/jpeg',
      0.92,
    );
  });
}

/** Load an image with CORS enabled (needed for canvas pixel access). */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
