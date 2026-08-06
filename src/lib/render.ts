/**
 * Indigo render options for image export.
 *
 * The names below are the exact keys `ketcher-standalone` forwards to the
 * Indigo WASM renderer (see its `generateImageAsBase64`). Anything not on that
 * list is dropped silently, so do not invent keys — verify against the package
 * before adding. `GenerateImageOptions` only types `outputFormat` and
 * `backgroundColor`; the rest ride along via its string index signature.
 */

export type RenderStyle = {
  /** Ångström-ish bond length; drives overall drawing scale. */
  bondLength: number
  /** Bond stroke weight, in the same units as bondLength. */
  bondThickness: number
  /** Gap between the lines of a double/triple bond. */
  bondSpacing: number
  /**
   * Atom label size in px, same unit as bondLength so the two stay in
   * proportion. Textbook depictions sit around 0.30-0.35 × bond length.
   */
  fontSize: number
  /** Subscript size in px (the 3 in CH3), conventionally ~0.7 × fontSize. */
  fontSizeSub: number
  /** Wedge width for stereo bonds. */
  stereoBondWidth: number
  /** CPK element coloring. Off = single-color line art. */
  coloring: boolean
  /** White background rect vs. transparent. */
  background: 'transparent' | 'white'
  /** PNG only: pixels per inch. */
  resolution: number
}

export const DEFAULT_STYLE: RenderStyle = {
  bondLength: 40,
  bondThickness: 2,
  bondSpacing: 0.15,
  // ~0.32 × bondLength, the usual textbook proportion.
  fontSize: 13,
  fontSizeSub: 9,
  stereoBondWidth: 6,
  coloring: false,
  background: 'transparent',
  resolution: 300,
}

/**
 * Presets tuned for Dreamscape Learn curriculum output.
 *
 * `print` follows ACS-ish conventions (black line art, heavier bonds) which is
 * what reproduces well once placed and scaled in Illustrator. `slide` bumps
 * weight and label size so structures survive projection. `figureColor` is the
 * only preset with CPK coloring on — use it when the color carries meaning,
 * not for decoration.
 */
export const STYLE_PRESETS = {
  print: {
    label: 'Print / Illustrator',
    hint: 'Black line art, ACS-like weights. Best for placing in Illustrator.',
    style: DEFAULT_STYLE,
  },
  slide: {
    label: 'Slide / Projection',
    hint: 'Heavier bonds and larger labels so it reads at the back of a room.',
    style: {
      ...DEFAULT_STYLE,
      bondThickness: 3,
      fontSize: 15,
      fontSizeSub: 10,
      stereoBondWidth: 8,
    },
  },
  figureColor: {
    label: 'Color figure',
    hint: 'CPK element colors. Use when color is doing pedagogical work.',
    style: { ...DEFAULT_STYLE, coloring: true, bondThickness: 2.5 },
  },
  compact: {
    label: 'Compact / inline',
    hint: 'Smaller scale for inline or margin figures.',
    style: {
      ...DEFAULT_STYLE,
      bondLength: 28,
      bondThickness: 1.5,
      fontSize: 9,
      fontSizeSub: 6.5,
    },
  },
} as const

export type PresetKey = keyof typeof STYLE_PRESETS

/**
 * Translate a RenderStyle into the flat, hyphenated option bag Indigo wants.
 *
 * Background handling has two non-obvious rules, both verified against the live
 * Indigo 1.42 build:
 *
 * 1. Indigo parses colors as COMMA-SEPARATED NUMERIC TRIPLES — "255, 255, 255".
 *    Hex ('#ffffff', 'ffffff') and CSS names ('white') are all rejected with
 *    `option manager: Cannot recognize "..." as a color value`. Values above 1
 *    are read as 0-255, values at or below 1 as fractions.
 *
 * 2. Transparency means OMITTING the option, not passing an empty string.
 *    `ketcher-standalone`'s worker only skips null/undefined when building the
 *    option map (`if (value == null) continue`), so '' would reach Indigo and
 *    fail the same way. Undefined leaves `render-background-color` unset, and
 *    the SVG then contains no background <rect> at all.
 */
const WHITE_RGB = '255, 255, 255'
export function toIndigoOptions(
  style: RenderStyle,
  outputFormat: 'svg' | 'png',
): Record<string, string | number | boolean | undefined> {
  return {
    outputFormat,
    backgroundColor: style.background === 'white' ? WHITE_RGB : undefined,
    'bond-length': style.bondLength,
    'bond-length-unit': 'px',
    'render-bond-thickness': style.bondThickness,
    'render-bond-thickness-unit': 'px',
    'render-bond-spacing': style.bondSpacing,
    // px, not pt: mixing units with bond-length (px) is what made labels render
    // oversized — 13pt is ~17px, i.e. 43% of a 40px bond.
    'render-font-size': style.fontSize,
    'render-font-size-unit': 'px',
    'render-font-size-sub': style.fontSizeSub,
    'render-font-size-sub-unit': 'px',
    'render-stereo-bond-width': style.stereoBondWidth,
    'render-stereo-bond-width-unit': 'px',
    'render-coloring': style.coloring,
    // Only meaningful for raster output; harmless on the SVG path.
    'image-resolution': outputFormat === 'png' ? style.resolution : undefined,
  }
}
