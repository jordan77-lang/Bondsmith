import { useEffect, useRef } from 'react'
import * as $3Dmol from '3dmol'
import {
  CIF_PARSE_OPTIONS,
  isSolventAtom,
  normalizeCifSymmetryTags,
  normalizeElement,
  type CrystalStyle,
} from '../lib/crystal'

type CrystalViewerProps = {
  /** CIF text, or null for an empty viewer. */
  cif: string | null
  style: CrystalStyle
  onReady: (handle: CrystalViewerHandle | null) => void
  /** Reports the rendered atom count so the UI can show it. */
  onStats: (stats: { cellAtoms: number; totalAtoms: number } | null) => void
  /** Reports a load failure (malformed CIF, unsupported symmetry). */
  onError: (message: string) => void
}

export type CrystalViewerHandle = {
  pngUri: (scale?: number) => Promise<string>
  recenter: () => void
}

/**
 * Crystal lattice viewer.
 *
 * Kept separate from Viewer3D rather than adding a mode flag: the lifecycle is
 * genuinely different. A molecular view reloads only when the molecule changes,
 * but a lattice has to rebuild whenever the repeat counts change, since
 * `replicateUnitCell` mutates the model in place and cannot be undone. So any
 * change to na/nb/nc means a full reparse from the CIF.
 */
export function CrystalViewer({
  cif,
  style,
  onReady,
  onStats,
  onError,
}: CrystalViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<ReturnType<typeof $3Dmol.createViewer> | null>(null)
  // Whether the camera has been framed for the current structure. Repeat-count
  // changes reframe; pure style changes must not, or the view jumps while you
  // drag a slider.
  const framedForRef = useRef<string | null>(null)

  // --- create the viewer once ---
  useEffect(() => {
    const host = hostRef.current
    if (!host || viewerRef.current) return

    const viewer = $3Dmol.createViewer(host, {
      backgroundAlpha: 0,
      antialias: true,
      upscale: true,
    })
    // Keep the WebGL buffer transparent: the export path finds the lattice
    // bounds from the alpha channel, and a white background would make every
    // pixel opaque. The on-screen backdrop comes from CSS instead.
    viewer.setBackgroundColor('#ffffff', 0)
    viewerRef.current = viewer

    const handle: CrystalViewerHandle = {
      pngUri: async (scale = 1) => {
        if (scale <= 1) return viewer.pngURI()
        const prevW = host.style.width
        const prevH = host.style.height
        const { width, height } = host.getBoundingClientRect()
        try {
          host.style.width = `${Math.round(width * scale)}px`
          host.style.height = `${Math.round(height * scale)}px`
          viewer.resize()
          viewer.render()
          // Two frames: one for layout to settle, one for the GPU to finish.
          await new Promise((r) => requestAnimationFrame(() => r(null)))
          await new Promise((r) => requestAnimationFrame(() => r(null)))
          return viewer.pngURI()
        } finally {
          host.style.width = prevW
          host.style.height = prevH
          viewer.resize()
          viewer.render()
        }
      },
      recenter: () => {
        viewer.zoomTo()
        viewer.render()
      },
    }
    onReady(handle)

    return () => {
      try {
        viewer.spin(false)
        viewer.removeAllModels()
        viewer.clear()
      } catch {
        // Cleanup is best-effort; never throw from teardown.
      }
      viewerRef.current = null
      framedForRef.current = null
      onReady(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- build the lattice ---
  // Reruns on CIF or repeat-count change. Style-only changes are handled by the
  // restyle effect below so dragging a slider doesn't rebuild the whole lattice.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    viewer.removeAllModels()
    viewer.clear()

    if (!cif) {
      onStats(null)
      viewer.render()
      return
    }

    try {
      // Alias modern symmetry tags first, or most real-world CIFs expand to
      // just their asymmetric unit.
      const model = viewer.addModel(normalizeCifSymmetryTags(cif), 'cif', {
        ...CIF_PARSE_OPTIONS,
      })
      const cellAtoms = model.selectedAtoms({}).length
      if (cellAtoms === 0) {
        onError(
          'No atoms found in that CIF. It may be missing coordinates or use an unsupported format.',
        )
        onStats(null)
        return
      }

      // Normalize element symbols before anything reads them: the parser keeps
      // oxidation-state suffixes ("N-", "Fe+3") which miss 3Dmol's colour and
      // radius tables, so nitrogen would draw grey instead of blue.
      const atoms = model.selectedAtoms({}) as Array<Record<string, unknown>>
      for (const atom of atoms) {
        atom.elem = normalizeElement(atom.elem as string)
      }

      if (style.showCell) {
        viewer.addUnitCell(model, { box: { color: style.cellColor } })
      }

      const { na, nb, nc } = style
      if (na > 1 || nb > 1 || nc > 1) {
        // addBonds=true so the framework connects across cell boundaries rather
        // than rendering as isolated cells.
        viewer.replicateUnitCell(na, nb, nc, model, true)
      }

      const totalAtoms = model.selectedAtoms({}).length
      onStats({ cellAtoms, totalAtoms })

      // Re-normalize: replicated atoms are fresh copies of the originals.
      const all = model.selectedAtoms({}) as Array<Record<string, unknown>>
      for (const atom of all) {
        atom.elem = normalizeElement(atom.elem as string)
      }

      applyStyle(viewer, style)

      const key = `${cif.length}:${na}x${nb}x${nc}`
      if (framedForRef.current !== key) {
        viewer.zoomTo()
        framedForRef.current = key
      }
      viewer.render()
    } catch (err) {
      onError(
        err instanceof Error
          ? `Could not read that CIF: ${err.message}`
          : 'Could not read that CIF.',
      )
      onStats(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cif, style.na, style.nb, style.nc, style.showCell, style.cellColor])

  // --- restyle without rebuilding ---
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !cif) return
    applyStyle(viewer, style)
    viewer.render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    style.mode,
    style.sphereScale,
    style.stickRadius,
    style.colorscheme,
    style.hideSolvent,
    style.hideHydrogen,
  ])

  // --- projection ---
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.setProjection(style.orthographic ? 'orthographic' : 'perspective')
    viewer.render()
  }, [style.orthographic])

  // --- spin ---
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.spin(style.spin ? 'y' : false)
    return () => {
      viewerRef.current?.spin(false)
    }
  }, [style.spin])

  // --- keep canvas sized to container ---
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const obs = new ResizeObserver(() => viewerRef.current?.resize())
    obs.observe(host)
    return () => obs.disconnect()
  }, [])

  return <div ref={hostRef} className="viewer3d-host" />
}

/** Apply the visible style, including which species are hidden. */
function applyStyle(
  viewer: ReturnType<typeof $3Dmol.createViewer>,
  style: CrystalStyle,
): void {
  const atoms = viewer.selectedAtoms({}) as Array<{ elem?: string }>
  const present = new Set<string>()
  for (const a of atoms) if (a.elem) present.add(a.elem)

  // Start from nothing so previously-hidden species don't linger.
  viewer.setStyle({}, {})

  const hidden = new Set<string>()
  if (style.hideHydrogen) hidden.add('H')
  if (style.hideSolvent) {
    for (const el of present) {
      if (isSolventAtom(el, present)) hidden.add(el)
    }
  }

  const { colorscheme } = style
  const spec: Record<string, unknown> = {}
  switch (style.mode) {
    case 'spacefill':
      spec.sphere = { scale: style.sphereScale, colorscheme }
      break
    case 'stick':
      spec.stick = { radius: style.stickRadius, colorscheme }
      break
    case 'wireframe':
      spec.line = { colorscheme }
      break
    default:
      spec.sphere = { scale: style.sphereScale, colorscheme }
      spec.stick = { radius: style.stickRadius, colorscheme }
  }

  // Style everything, then blank out the hidden species one element at a time.
  // Selecting by a list of elements would be terser, but AtomSpec.elem is typed
  // as a single string, and per-element calls are cheap at this scale.
  viewer.setStyle({}, spec)
  for (const el of hidden) {
    if (present.has(el)) viewer.setStyle({ elem: el }, {})
  }
}
