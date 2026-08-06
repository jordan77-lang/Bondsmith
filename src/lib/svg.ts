/**
 * Post-processing for Indigo's SVG output to make it behave in Illustrator.
 *
 * Indigo emits a correct but inconvenient SVG: the viewBox covers the whole
 * render sheet rather than the structure, and atom labels are live <text> that
 * re-flow if the font is missing on the opening machine. Both are annoying to
 * fix by hand once, and unacceptable across dozens of curriculum figures.
 */

/** Fonts Indigo may reference, mapped to a stack that degrades sanely. */
const FONT_STACK =
  "'Arial', 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif"

export type SvgCleanupOptions = {
  /** Crop the viewBox to the drawn art plus padding. */
  tightBounds: boolean
  /** Padding around the tightened box, in user units. */
  padding: number
  /** Pin an explicit font stack onto every text node. */
  pinFont: boolean
  /** Title for accessibility / Illustrator's layer name. */
  title?: string
}

export const DEFAULT_CLEANUP: SvgCleanupOptions = {
  tightBounds: true,
  padding: 8,
  pinFont: true,
}

/**
 * Measure the real ink bounds by mounting the SVG offscreen and asking the
 * browser. `getBBox()` accounts for stroke geometry and glyph metrics, which is
 * why this beats parsing coordinates out of the path data ourselves.
 *
 * Returns null when the SVG has no renderable content (empty canvas) or when
 * measurement fails, in which case callers should keep the original viewBox.
 */
function measureInkBounds(svgText: string): DOMRect | null {
  const holder = document.createElement('div')
  // Offscreen but still laid out — display:none would make getBBox() return 0s.
  holder.setAttribute(
    'style',
    'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;',
  )
  holder.innerHTML = svgText

  const svg = holder.querySelector('svg')
  if (!svg) return null

  document.body.appendChild(holder)
  try {
    const box = (svg as SVGGraphicsElement).getBBox()
    if (!box.width || !box.height) return null
    return box
  } catch {
    return null
  } finally {
    holder.remove()
  }
}

/**
 * Pin an explicit font stack onto every atom label.
 *
 * Deliberately NOT outlining: there is no DOM API that turns <text> into a
 * <path>, and faking it with measured glyph boxes produces wrong letterforms.
 * Pinning a widely-available stack stops the labels from substituting to
 * something metrically different on another machine. Real outlining stays a
 * one-click job in Illustrator (Type ▸ Create Outlines), which we surface as a
 * warning rather than pretending to have done it here.
 */
function pinFontStack(svg: SVGElement): void {
  const texts = svg.querySelectorAll('text, tspan')
  texts.forEach((node) => {
    const el = node as SVGElement
    el.setAttribute('font-family', FONT_STACK)
    // Indigo sometimes only sets font-family via a style attr; normalize both
    // so Illustrator reads a consistent value.
    const style = el.getAttribute('style')
    if (style && /font-family/i.test(style)) {
      el.setAttribute(
        'style',
        style.replace(/font-family\s*:[^;]+;?/gi, `font-family:${FONT_STACK};`),
      )
    }
  })
}

export type CleanupResult = {
  svg: string
  /** Non-fatal notes worth surfacing once in the UI. */
  warnings: string[]
}

/** Normalize an Indigo SVG for placement in Illustrator. */
export function cleanupSvg(
  svgText: string,
  options: SvgCleanupOptions = DEFAULT_CLEANUP,
): CleanupResult {
  const warnings: string[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')

  if (doc.querySelector('parsererror')) {
    return { svg: svgText, warnings: ['SVG could not be parsed; exported as-is.'] }
  }

  const svg = doc.documentElement as unknown as SVGSVGElement
  if (svg.tagName.toLowerCase() !== 'svg') {
    return { svg: svgText, warnings: ['Unexpected SVG root; exported as-is.'] }
  }

  if (options.pinFont) {
    pinFontStack(svg as unknown as SVGElement)
    if (svg.querySelector('text')) {
      warnings.push(
        'Atom labels are live text with a pinned Arial/Helvetica stack. ' +
          'For archival art, run Type ▸ Create Outlines in Illustrator.',
      )
    }
  }

  if (options.tightBounds) {
    const serialized = new XMLSerializer().serializeToString(svg)
    const box = measureInkBounds(serialized)
    if (box) {
      const pad = options.padding
      const x = box.x - pad
      const y = box.y - pad
      const w = box.width + pad * 2
      const h = box.height + pad * 2
      svg.setAttribute('viewBox', `${round(x)} ${round(y)} ${round(w)} ${round(h)}`)
      // Match intrinsic size to the crop so Illustrator's artboard lands on the
      // structure instead of Indigo's full sheet.
      svg.setAttribute('width', `${round(w)}`)
      svg.setAttribute('height', `${round(h)}`)
    } else {
      warnings.push('Could not measure structure bounds; kept original canvas size.')
    }
  }

  if (options.title) {
    // Illustrator surfaces <title> as the layer/object name.
    const existing = svg.querySelector(':scope > title')
    const titleEl = existing ?? doc.createElementNS(svg.namespaceURI, 'title')
    titleEl.textContent = options.title
    if (!existing) svg.insertBefore(titleEl, svg.firstChild)
  }

  return { svg: new XMLSerializer().serializeToString(svg), warnings }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
