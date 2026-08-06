import { useEffect, useRef } from 'react'
import * as $3Dmol from '3dmol'
import { toMolStyle, type Style3D } from '../lib/render3d'

type Viewer3DProps = {
  /** SDF text with 3D coordinates, or null for an empty viewer. */
  sdf: string | null
  style: Style3D
  /** Called once the viewer exists, so the parent can trigger PNG export. */
  onReady: (viewer: Viewer3DHandle | null) => void
}

export type Viewer3DHandle = {
  /**
   * Render a PNG data URI at the current camera angle.
   *
   * `scale` supersamples by temporarily enlarging the canvas, so export
   * resolution is independent of the window size.
   */
  pngUri: (scale?: number) => Promise<string>
  /** Reset the camera to fit the molecule. */
  recenter: () => void
}

/**
 * 3Dmol.js viewer.
 *
 * 3Dmol is imperative and owns a WebGL context, so it lives entirely in refs
 * rather than React state: React manages *when* we call into it, never what it
 * holds. The viewer is created once and then mutated, because tearing down a
 * WebGL context per prop change is both slow and a reliable way to hit context
 * limits after a dozen toggles.
 */
export function Viewer3D({ sdf, style, onReady }: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<ReturnType<typeof $3Dmol.createViewer> | null>(null)
  // Tracks the SDF currently loaded so style-only changes skip a reload.
  const loadedRef = useRef<string | null>(null)

  // --- create once ---
  useEffect(() => {
    const host = hostRef.current
    if (!host || viewerRef.current) return

    const viewer = $3Dmol.createViewer(host, {
      backgroundAlpha: 0,
      antialias: true,
      // 2x internal resolution so exported PNGs aren't soft on non-Retina
      // displays, which is where curriculum work usually happens.
      upscale: true,
    })
    viewerRef.current = viewer

    const handle: Viewer3DHandle = {
      /**
       * Supersample by inflating the host element, letting 3Dmol resize its
       * canvas to match, then capturing. 3Dmol derives canvas size from the
       * container, so there is no direct "render at N×" API — we drive it
       * through layout and restore the original size in a finally block.
       */
      pngUri: async (scale = 1) => {
        if (scale <= 1) return viewer.pngURI()

        const prevWidth = host.style.width
        const prevHeight = host.style.height
        const { width, height } = host.getBoundingClientRect()

        try {
          host.style.width = `${Math.round(width * scale)}px`
          host.style.height = `${Math.round(height * scale)}px`
          viewer.resize()
          viewer.render()
          // Let the browser flush layout and the GPU finish the frame before
          // reading pixels back, or the capture can catch a half-drawn buffer.
          await new Promise((r) => requestAnimationFrame(() => r(null)))
          await new Promise((r) => requestAnimationFrame(() => r(null)))
          return viewer.pngURI()
        } finally {
          host.style.width = prevWidth
          host.style.height = prevHeight
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
      // Release the WebGL context on unmount; without this, repeated 2D/3D
      // toggling leaks contexts until the browser starts dropping the oldest.
      try {
        viewer.spin(false)
        viewer.removeAllModels()
        viewer.clear()
      } catch {
        // Teardown is best-effort — never throw from a cleanup path.
      }
      viewerRef.current = null
      loadedRef.current = null
      onReady(null)
    }
    // onReady is stable (useCallback in the parent); re-running would recreate
    // the context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- load structure ---
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (loadedRef.current === sdf) return

    viewer.clear()
    loadedRef.current = sdf

    if (!sdf) {
      viewer.render()
      return
    }

    viewer.addModel(sdf, 'sdf')
    viewer.setStyle({}, toMolStyle(style))
    viewer.zoomTo()
    viewer.render()
    // `style` is applied here on load and by the effect below on change; adding
    // it as a dep would reload the model on every slider tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdf])

  // --- restyle without reloading ---
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !loadedRef.current) return
    viewer.setStyle({}, toMolStyle(style))
    viewer.render()
  }, [style])

  // Background is deliberately NOT bound to style.background: the WebGL canvas
  // always renders transparent so the export path can find the molecule's bounds
  // from the alpha channel. A white background is composited during cropping
  // instead. On screen, the CSS checkerboard shows through.

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

  // --- keep the canvas sized to its container ---
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(() => {
      viewerRef.current?.resize()
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  return (
    // Sizing lives in CSS (.viewer3d-host) rather than inline styles, so the
    // export path can temporarily override width/height for supersampling.
    <div ref={hostRef} className="viewer3d-host" />
  )
}
