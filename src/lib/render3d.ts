/**
 * 3D depiction presets.
 *
 * Ball-and-stick proportions are a convention, not a measurement: spheres are
 * drawn well below true van der Waals radii so bonds stay visible. `scale`
 * multiplies the VDW radius, so 0.25 means "a quarter of the real atom size",
 * which is roughly the textbook look. Spacefill is the honest one — scale 1.0
 * is the actual VDW surface.
 */

export type Style3D = {
  mode: 'ball-stick' | 'stick' | 'spacefill' | 'wireframe'
  /** VDW radius multiplier for atom spheres. */
  sphereScale: number
  /** Bond cylinder radius in Ångström. */
  stickRadius: number
  /** Jmol (CPK-like) vs. a single carbon color scheme. */
  colorscheme: 'Jmol' | 'greenCarbon' | 'cyanCarbon' | 'grayCarbon'
  /** Transparent PNG vs. white. */
  background: 'transparent' | 'white'
  /** Orthographic reads more like a textbook diagram; perspective more physical. */
  orthographic: boolean
  /** Slow auto-rotation — useful on screen, off for stills. */
  spin: boolean
  /**
   * Export supersampling factor. The WebGL canvas is temporarily resized to
   * this multiple of its on-screen size, rendered, captured, then restored —
   * so output resolution isn't limited by the window.
   */
  exportScale: number
}

export const DEFAULT_STYLE_3D: Style3D = {
  mode: 'ball-stick',
  sphereScale: 0.25,
  stickRadius: 0.15,
  colorscheme: 'Jmol',
  background: 'transparent',
  orthographic: true,
  spin: false,
  exportScale: 3,
}

export const PRESETS_3D = {
  ballStick: {
    label: 'Ball & stick',
    hint: 'The textbook default. Shows both geometry and connectivity.',
    style: DEFAULT_STYLE_3D,
  },
  stick: {
    label: 'Stick',
    hint: 'Bonds only — clearer for larger molecules where spheres crowd.',
    style: { ...DEFAULT_STYLE_3D, mode: 'stick' as const, stickRadius: 0.18 },
  },
  spacefill: {
    label: 'Spacefill',
    hint: 'True van der Waals surface. Shows real molecular volume.',
    style: { ...DEFAULT_STYLE_3D, mode: 'spacefill' as const, sphereScale: 1 },
  },
  wireframe: {
    label: 'Wireframe',
    hint: 'Thin lines. Least ink, good over a busy background.',
    style: { ...DEFAULT_STYLE_3D, mode: 'wireframe' as const, stickRadius: 0.05 },
  },
} as const

export type Preset3DKey = keyof typeof PRESETS_3D

/**
 * Translate a Style3D into a 3Dmol AtomStyleSpec.
 *
 * Ball-and-stick is the only mode needing both primitives; the rest are one or
 * the other. Kept as a plain object so the caller can hand it straight to
 * `viewer.setStyle({}, spec)`.
 */
export function toMolStyle(style: Style3D): Record<string, unknown> {
  const { colorscheme } = style

  switch (style.mode) {
    case 'spacefill':
      return { sphere: { scale: style.sphereScale, colorscheme } }
    case 'stick':
      return { stick: { radius: style.stickRadius, colorscheme } }
    case 'wireframe':
      return { line: { colorscheme } }
    case 'ball-stick':
    default:
      return {
        sphere: { scale: style.sphereScale, colorscheme },
        stick: { radius: style.stickRadius, colorscheme },
      }
  }
}

/**
 * Crop a rendered PNG data URI to its non-transparent content.
 *
 * 3Dmol renders at canvas size, so the export inherits the viewport's aspect
 * ratio and leaves wide empty margins — the same problem the SVG path had. We
 * scan the alpha channel for the drawn bounds and re-draw into a tight canvas.
 *
 * Only works on a transparent render: with an opaque background every pixel has
 * alpha 255 and there is nothing to detect, so callers pass `white` through
 * untouched (or composite white after cropping).
 */
export async function cropPngDataUri(
  uri: string,
  { padding = 24, background = 'transparent' as 'transparent' | 'white' } = {},
): Promise<string> {
  const img = new Image()
  img.src = uri
  await img.decode()

  const w = img.naturalWidth
  const h = img.naturalHeight
  const probe = document.createElement('canvas')
  probe.width = w
  probe.height = h
  const pctx = probe.getContext('2d')
  if (!pctx) return uri
  pctx.drawImage(img, 0, 0)

  const { data } = pctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Alpha > 8 ignores the faint edges antialiasing leaves behind.
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // Nothing drawn, or already full-bleed: leave it alone.
  if (maxX < 0 || maxY < 0) return uri

  const pad = Math.max(0, padding)
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(w, maxX + pad + 1) - sx
  const sh = Math.min(h, maxY + pad + 1) - sy

  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const octx = out.getContext('2d')
  if (!octx) return uri

  if (background === 'white') {
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, sw, sh)
  }
  octx.drawImage(probe, sx, sy, sw, sh, 0, 0, sw, sh)

  return out.toDataURL('image/png')
}

/** Which sliders are meaningful for the current mode. */
export function activeControls(mode: Style3D['mode']): {
  sphere: boolean
  stick: boolean
} {
  switch (mode) {
    case 'spacefill':
      return { sphere: true, stick: false }
    case 'stick':
      return { sphere: false, stick: true }
    case 'wireframe':
      return { sphere: false, stick: false }
    default:
      return { sphere: true, stick: true }
  }
}
