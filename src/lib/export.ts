import type { Ketcher } from 'ketcher-core'
import { toIndigoOptions, type RenderStyle } from './render'
import { cleanupSvg, DEFAULT_CLEANUP, type SvgCleanupOptions } from './svg'

export type ExportResult = {
  blob: Blob
  warnings: string[]
}

/**
 * Render the current structure to an export-ready blob.
 *
 * `generateImage` is typed to accept only outputFormat/backgroundColor, but its
 * options interface carries a string index signature, so the Indigo render keys
 * pass through. The cast documents that we are using that channel on purpose.
 */
export async function exportStructure(
  ketcher: Ketcher,
  struct: string,
  format: 'svg' | 'png',
  style: RenderStyle,
  cleanup: SvgCleanupOptions = DEFAULT_CLEANUP,
  title?: string,
): Promise<ExportResult> {
  const options = toIndigoOptions(style, format)
  const blob = await ketcher.generateImage(
    struct,
    options as unknown as Parameters<Ketcher['generateImage']>[1],
  )

  if (format !== 'svg') return { blob, warnings: [] }

  // SVG comes back as a blob of text; normalize it for Illustrator.
  const raw = await blob.text()
  const { svg, warnings } = cleanupSvg(raw, { ...cleanup, title })
  return {
    blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
    warnings,
  }
}
