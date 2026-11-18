import { useCallback, useEffect, useRef, useState } from 'react'
import { ChemicalMimeType, type Ketcher } from 'ketcher-core'
import { MoleculeEditor } from './components/MoleculeEditor'
import { LewisPanel } from './components/LewisPanel'
import { Toolbar } from './components/Toolbar'
import { StylePanel } from './components/StylePanel'
import { Style3DPanel } from './components/Style3DPanel'
import { Viewer3D, type Viewer3DHandle } from './components/Viewer3D'
import { CrystalViewer, type CrystalViewerHandle } from './components/CrystalViewer'
import { CrystalPanel } from './components/CrystalPanel'
import { PreviewPanel, type PreviewData } from './components/PreviewPanel'
import {
  CRYSTAL_PRESETS,
  DEFAULT_CRYSTAL_STYLE,
  STRUCTURE_LIBRARY,
  type CrystalPresetKey,
  type CrystalStyle,
} from './lib/crystal'
import { downloadBlob } from './lib/download'
import { fetchStructureByName, slugifyName } from './lib/pubchem'
import { fetch3DStructure } from './lib/pubchem3d'
import { DEFAULT_STYLE, STYLE_PRESETS, type PresetKey, type RenderStyle } from './lib/render'
import {
  cropPngDataUri,
  DEFAULT_STYLE_3D,
  PRESETS_3D,
  type Preset3DKey,
  type Style3D,
} from './lib/render3d'
import { exportStructure } from './lib/export'
import {
  buildLewis,
  DEFAULT_LEWIS_STYLE,
  lewisSvgToPng,
  type LewisAtomReport,
  type LewisStyle,
} from './lib/lewis'
import { hasAromaticBonds, parseMolfile, type ParsedMol } from './lib/molfile'
import { usePersistentState, useTheme } from './lib/storage'
import './App.css'

/** Which preset a style matches, or 'custom' once a slider is touched. */
function matchPreset(style: RenderStyle): PresetKey | 'custom' {
  const keys = Object.keys(STYLE_PRESETS) as PresetKey[]
  const found = keys.find(
    (k) => JSON.stringify(STYLE_PRESETS[k].style) === JSON.stringify(style),
  )
  return found ?? 'custom'
}

function matchPreset3D(style: Style3D): Preset3DKey | 'custom' {
  const keys = Object.keys(PRESETS_3D) as Preset3DKey[]
  const found = keys.find(
    (k) => JSON.stringify(PRESETS_3D[k].style) === JSON.stringify(style),
  )
  return found ?? 'custom'
}

function matchCrystalPreset(style: CrystalStyle): CrystalPresetKey | 'custom' {
  const keys = Object.keys(CRYSTAL_PRESETS) as CrystalPresetKey[]
  const found = keys.find(
    (k) => JSON.stringify(CRYSTAL_PRESETS[k].style) === JSON.stringify(style),
  )
  return found ?? 'custom'
}

/** Convert a PNG data URI to a Blob for download. */
function dataUriToBlob(uri: string): Blob {
  const [header, data] = uri.split(',')
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/png'
  const bytes = atob(data)
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  return new Blob([buf], { type: mime })
}

export default function App() {
  const [ketcher, setKetcher] = useState<Ketcher | null>(null)
  const [busy, setBusy] = useState(false)
  // Split from errors on purpose: a failure and a "downloaded!" used to render
  // identically in one span.
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [moleculeLabel, setMoleculeLabel] = useState('empty canvas')

  const [style, setStyle] = usePersistentState<RenderStyle>('style', DEFAULT_STYLE)
  const [, setTheme, themePref] = useTheme()

  // --- 3D view (kept entirely separate from the 2D SVG pipeline) ---
  const [view, setView] = useState<'2d' | 'lewis' | '3d' | 'crystal'>('2d')
  const [sdf3d, setSdf3d] = useState<string | null>(null)
  const [label3d, setLabel3d] = useState<string | null>(null)
  const [style3d, setStyle3d] = usePersistentState<Style3D>('style3d', DEFAULT_STYLE_3D)
  const viewer3dRef = useRef<Viewer3DHandle | null>(null)

  // --- crystal view ---
  const [cif, setCif] = useState<string | null>(null)
  const [cifFile, setCifFile] = useState<string | null>(null)
  const [cifLabel, setCifLabel] = useState<string | null>(null)
  const [crystalStats, setCrystalStats] = useState<{
    cellAtoms: number
    totalAtoms: number
  } | null>(null)
  const [crystalStyle, setCrystalStyle] = usePersistentState<CrystalStyle>(
    'crystal',
    DEFAULT_CRYSTAL_STYLE,
  )
  const crystalRef = useRef<CrystalViewerHandle | null>(null)

  // --- Lewis view (draws from the same Ketcher canvas as 2D) ---
  const [lewisStyle, setLewisStyle] = usePersistentState<LewisStyle>(
    'lewis',
    DEFAULT_LEWIS_STYLE,
  )
  const [lewisReport, setLewisReport] = useState<LewisAtomReport[] | null>(null)
  // Same role as liveFormat, kept separate so a 2D live preview doesn't start
  // re-rendering Lewis output (or vice versa) after a view switch.
  const [liveLewis, setLiveLewis] = useState<'svg' | 'png' | null>(null)

  // Pending export awaiting confirmation in the preview panel. The blob is held
  // alongside the object URL so Download doesn't have to re-render.
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const pendingBlobRef = useRef<{ blob: Blob; filename: string } | null>(null)
  // Which format the live preview re-renders as. Null = live preview is off,
  // which is the state before the first export.
  const [liveFormat, setLiveFormat] = useState<'svg' | 'png' | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  // The format the Render button will produce. SVG default: it's the one that
  // actually matters for Illustrator.
  const [renderFormat, setRenderFormat] = usePersistentState<'svg' | 'png'>(
    'renderFormat',
    'svg',
  )

  const withBusy = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true)
      setMessage(label)
      setError(null)
      try {
        await fn()
      } catch (err) {
        setMessage(null)
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        console.error(err)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  /**
   * Stage a finished export for confirmation instead of downloading it directly.
   *
   * Measures the image so the modal can report real dimensions: SVG carries them
   * in the markup, PNG needs a decode.
   */
  const stagePreview = useCallback(
    async (
      blob: Blob,
      filename: string,
      format: 'svg' | 'png',
      transparent: boolean,
      warns: string[] = [],
    ) => {
      const url = URL.createObjectURL(blob)
      let width: number | undefined
      let height: number | undefined

      if (format === 'svg') {
        const text = await blob.text()
        const vb = /viewBox\s*=\s*"([^"]+)"/.exec(text)?.[1]
        const parts = vb?.trim().split(/[\s,]+/).map(Number)
        if (parts?.length === 4 && parts.every(Number.isFinite)) {
          width = parts[2]
          height = parts[3]
        }
      } else {
        try {
          const img = new Image()
          img.src = url
          await img.decode()
          width = img.naturalWidth
          height = img.naturalHeight
        } catch {
          // Dimensions are informational; a failed decode shouldn't block preview.
        }
      }

      pendingBlobRef.current = { blob, filename }
      setPreview((prev) => {
        // Replacing a live preview: release the previous URL or every slider
        // tick leaks one.
        if (prev) URL.revokeObjectURL(prev.url)
        return {
          url,
          filename,
          format,
          bytes: blob.size,
          width,
          height,
          transparent,
          warnings: warns,
        }
      })
    },
    [],
  )

  /**
   * Download the staged blob. The preview deliberately stays on screen — figure
   * work is iterative, and clearing it would hide the controls' effect right
   * when you want to compare against the next attempt.
   */
  const confirmDownload = useCallback(() => {
    const pending = pendingBlobRef.current
    if (!pending) return
    downloadBlob(pending.blob, pending.filename)
    setMessage(`Downloaded ${pending.filename}.`)
  }, [])

  const cancelPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    pendingBlobRef.current = null
    setLiveFormat(null)
    setLiveLewis(null)
    setMessage(null)
  }, [])

  const handleSearch = useCallback(
    (query: string) => {
      if (!ketcher) return
      void withBusy(`Searching PubChem for “${query}”…`, async () => {
        const sdf = await fetchStructureByName(query)
        await ketcher.setMolecule(sdf)
        setMoleculeLabel(query)
        setMessage(`Loaded “${query}” from PubChem.`)
      })
    },
    [ketcher, withBusy],
  )

  const handleLoadSmiles = useCallback(
    (smiles: string) => {
      if (!ketcher) return
      void withBusy('Drawing structure…', async () => {
        await ketcher.setMolecule(smiles)
        const label = smiles.length > 40 ? `${smiles.slice(0, 40)}…` : smiles
        setMoleculeLabel(label)
        setMessage('Structure loaded from SMILES.')
      })
    },
    [ketcher, withBusy],
  )

  /** Render the 2D canvas and stage the result. Shared by the buttons and the
   *  live-preview effect, so both paths always produce an identical file. */
  const render2D = useCallback(
    async (format: 'svg' | 'png') => {
      if (!ketcher) return
      const struct = await ketcher.getKet()
      const smiles = await ketcher.getSmiles()
      if (!smiles) {
        throw new Error('Canvas is empty — draw or search a molecule first.')
      }
      const { blob, warnings: warns } = await exportStructure(
        ketcher,
        struct,
        format,
        style,
        undefined,
        moleculeLabel,
      )
      await stagePreview(
        blob,
        `${slugifyName(moleculeLabel)}.${format}`,
        format,
        style.background === 'transparent',
        warns,
      )
    },
    [ketcher, moleculeLabel, style, stagePreview],
  )

  const handleExport = useCallback(
    (format: 'svg' | 'png') => {
      if (!ketcher) return
      // Turning on live preview means later slider moves re-render on their own.
      setLiveFormat(format)
      void withBusy(`Rendering ${format.toUpperCase()}…`, async () => {
        await render2D(format)
        setMessage(null)
      })
    },
    [ketcher, withBusy, render2D],
  )

  /**
   * Live preview: re-render when the depiction changes.
   *
   * Debounced because a slider drag fires continuously and each render is a
   * round-trip to the Indigo worker. 180ms keeps dragging responsive without
   * queueing dozens of renders. Only runs once an export has established which
   * format to preview.
   */
  useEffect(() => {
    if (!liveFormat || !ketcher || view !== '2d') return
    let cancelled = false
    const timer = setTimeout(() => {
      setPreviewBusy(true)
      void render2D(liveFormat)
        .catch(() => {
          // A transient failure (e.g. cleared canvas) shouldn't surface as an
          // error banner during live editing — the button path still reports.
        })
        .finally(() => {
          if (!cancelled) setPreviewBusy(false)
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [liveFormat, ketcher, view, style, render2D])

  /**
   * Read the canvas as a molfile for the Lewis renderer.
   *
   * Lewis structures need explicit single/double bonds, so aromatic rings (from
   * aromatic SMILES like c1ccccc1) are kekulized through Indigo first.
   */
  const loadLewisMol = useCallback(async (): Promise<ParsedMol> => {
    if (!ketcher) throw new Error('The editor is still starting.')
    const molfile = await ketcher.getMolfile('v2000')
    const mol = parseMolfile(molfile)
    if (!hasAromaticBonds(mol)) return mol
    const kekule = await ketcher.indigo.dearomatize(molfile)
    const { struct } = await ketcher.indigo.convert(kekule, {
      outputFormat: ChemicalMimeType.Mol,
    })
    const converted = parseMolfile(struct)
    if (hasAromaticBonds(converted)) {
      throw new Error(
        'Could not convert the aromatic ring to single/double bonds. Draw it with alternating bonds instead.',
      )
    }
    return converted
  }, [ketcher])

  const buildLewisBlob = useCallback(
    async (s: LewisStyle, format: 'svg' | 'png') => {
      const mol = await loadLewisMol()
      const result = buildLewis(mol, s, moleculeLabel)
      const blob =
        format === 'svg'
          ? new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' })
          : await lewisSvgToPng(result.svg, result.width, result.height, s.pngScale)
      return { blob, result }
    },
    [loadLewisMol, moleculeLabel],
  )

  const renderLewis = useCallback(
    async (format: 'svg' | 'png') => {
      const { blob, result } = await buildLewisBlob(lewisStyle, format)
      setLewisReport(result.atoms)
      const notes = [...result.warnings]
      if (format === 'svg') {
        notes.push(
          'Labels are live text in a pinned Arial/Helvetica stack; dots are vector circles on their own layer.',
        )
      }
      await stagePreview(
        blob,
        `${slugifyName(moleculeLabel)}-lewis.${format}`,
        format,
        lewisStyle.background === 'transparent',
        notes,
      )
    },
    [buildLewisBlob, lewisStyle, moleculeLabel, stagePreview],
  )

  const handleRenderLewis = useCallback(() => {
    if (!ketcher) return
    setLiveLewis(renderFormat)
    void withBusy('Drawing Lewis structure…', async () => {
      await renderLewis(renderFormat)
      setMessage(null)
    })
  }, [ketcher, renderFormat, renderLewis, withBusy])

  /** Student copy (charges hidden) plus answer key (charges shown). */
  const handleLewisWorksheet = useCallback(() => {
    if (!ketcher) return
    void withBusy('Rendering student and key versions…', async () => {
      const slug = slugifyName(moleculeLabel)
      const student = await buildLewisBlob({ ...lewisStyle, showCharges: false }, renderFormat)
      const key = await buildLewisBlob({ ...lewisStyle, showCharges: true }, renderFormat)
      setLewisReport(key.result.atoms)
      downloadBlob(student.blob, `${slug}-lewis-student.${renderFormat}`)
      // A beat between downloads: some browsers drop a second download that
      // starts in the same tick.
      await new Promise((r) => setTimeout(r, 300))
      downloadBlob(key.blob, `${slug}-lewis-key.${renderFormat}`)
      setMessage(`Downloaded ${slug}-lewis-student and ${slug}-lewis-key.`)
    })
  }, [ketcher, moleculeLabel, lewisStyle, renderFormat, buildLewisBlob, withBusy])

  // Live Lewis preview: same debounce and rules as the 2D one above.
  useEffect(() => {
    if (!liveLewis || !ketcher || view !== 'lewis') return
    let cancelled = false
    const timer = setTimeout(() => {
      setPreviewBusy(true)
      void renderLewis(liveLewis)
        .catch(() => {
          // Transient failures stay quiet during live editing; the button reports.
        })
        .finally(() => {
          if (!cancelled) setPreviewBusy(false)
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [liveLewis, ketcher, view, renderLewis])

  const handleCopySmiles = useCallback(() => {
    if (!ketcher) return
    void withBusy('Copying SMILES…', async () => {
      const smiles = await ketcher.getSmiles()
      if (!smiles) throw new Error('Canvas is empty — draw or search a molecule first.')
      await navigator.clipboard.writeText(smiles)
      setMessage(`Copied SMILES: ${smiles}`)
    })
  }, [ketcher, withBusy])

  /**
   * Load a 3D conformer.
   *
   * This goes to PubChem by name/CID rather than converting what's on the 2D
   * canvas: SMILES and 2D coordinates carry no geometry, so generating a
   * conformer locally would need an embedding step (RDKit/ETKDG) we don't ship.
   * PubChem's precomputed conformers cover real compounds, which is the case
   * that matters here.
   */
  const handleLoad3D = useCallback(
    (query: string) => {
      void withBusy(`Fetching 3D conformer for “${query}”…`, async () => {
        const { sdf, label } = await fetch3DStructure(query)
        setSdf3d(sdf)
        setLabel3d(label)
        setView('3d')
        setMessage(`Loaded 3D conformer for “${label}”.`)
      })
    },
    [withBusy],
  )

  const handleExport3DPng = useCallback(() => {
    const handle = viewer3dRef.current
    if (!handle) return
    void withBusy('Exporting PNG…', async () => {
      if (!sdf3d) throw new Error('Load a molecule in 3D first.')
      // Supersample at the chosen factor, then crop to the molecule (the raw
      // canvas is viewport-shaped and mostly empty).
      const raw = await handle.pngUri(style3d.exportScale)
      if (!raw || raw === 'data:,') {
        throw new Error('The 3D viewer produced an empty image.')
      }
      const cropped = await cropPngDataUri(raw, {
        padding: 24 * Math.max(1, style3d.exportScale),
        background: style3d.background,
      })
      await stagePreview(
        dataUriToBlob(cropped),
        `${slugifyName(label3d ?? 'molecule')}-3d.png`,
        'png',
        style3d.background === 'transparent',
        ['3D export is raster. For vector figures, use the 2D editor.'],
      )
      setMessage(null)
    })
  }, [sdf3d, label3d, style3d.background, style3d.exportScale, withBusy, stagePreview])

  /** Load a bundled CIF from public/structures. */
  const handlePickStructure = useCallback(
    (file: string) => {
      const entry = STRUCTURE_LIBRARY.find((s) => s.file === file)
      void withBusy(`Loading ${entry?.label ?? file}…`, async () => {
        // BASE_URL keeps this correct under the GitHub Pages subpath.
        const res = await fetch(`${import.meta.env.BASE_URL}structures/${file}`)
        if (!res.ok) throw new Error(`Could not load ${file} (${res.status}).`)
        const text = await res.text()
        setCif(text)
        setCifFile(file)
        setCifLabel(entry?.label ?? file.replace(/\.cif$/, ''))
        setView('crystal')
        setMessage(
          entry
            ? `${entry.label} — ${entry.formula}, ${entry.spaceGroup}. ${entry.note}`
            : `Loaded ${file}.`,
        )
      })
    },
    [withBusy],
  )

  const handleUploadCif = useCallback(
    (text: string, name: string) => {
      if (!text.includes('_atom_site') && !text.includes('_cell_length')) {
        setError(`${name} doesn't look like a CIF — no cell or atom-site data found.`)
        return
      }
      setCif(text)
      setCifFile(`upload:${name}`)
      setCifLabel(name.replace(/\.cif$/i, ''))
      setView('crystal')
      setError(null)
      setMessage(`Loaded ${name}.`)
    },
    [],
  )

  const handleRenderCrystal = useCallback(() => {
    const handle = crystalRef.current
    if (!handle) return
    void withBusy('Rendering lattice…', async () => {
      if (!cif) throw new Error('Choose a structure first.')
      const raw = await handle.pngUri(crystalStyle.exportScale)
      if (!raw || raw === 'data:,') {
        throw new Error('The viewer produced an empty image.')
      }
      const cropped = await cropPngDataUri(raw, {
        padding: 24 * Math.max(1, crystalStyle.exportScale),
        background: crystalStyle.background,
      })
      const { na, nb, nc } = crystalStyle
      await stagePreview(
        dataUriToBlob(cropped),
        `${slugifyName(cifLabel ?? 'crystal')}-${na}x${nb}x${nc}.png`,
        'png',
        crystalStyle.background === 'transparent',
        ['Lattice export is raster. For vector figures, use the 2D editor.'],
      )
      setMessage(null)
    })
  }, [cif, cifLabel, crystalStyle, withBusy, stagePreview])

  const preset = matchPreset(style)
  const preset3d = matchPreset3D(style3d)
  const crystalPreset = matchCrystalPreset(crystalStyle)

  return (
    <div className="app">
      <Toolbar
        ready={Boolean(ketcher)}
        busy={busy}
        message={message}
        error={error}
        warnings={warnings}
        moleculeLabel={moleculeLabel}
        themePref={themePref}
        view={view}
        onTheme={setTheme}
        onView={setView}
        onSearch={handleSearch}
        onLoad3D={handleLoad3D}
        onLoadSmiles={handleLoadSmiles}
        onCopySmiles={handleCopySmiles}
        onDismissError={() => setError(null)}
        onDismissWarnings={() => setWarnings([])}
      />

      <main className="workspace">
        <div className="editor-pane">
          {/*
            Both surfaces stay mounted and are toggled with CSS. Ketcher's WASM
            editor does not survive unmount/remount (the same reason StrictMode
            is off), and rebuilding the WebGL context on every toggle would be
            wasteful, so neither one is conditionally rendered.
          */}
          <div className={view === '2d' || view === 'lewis' ? 'pane-live' : 'pane-hidden'}>
            <MoleculeEditor onReady={setKetcher} />
          </div>
          <div className={view === 'crystal' ? 'pane-live' : 'pane-hidden'}>
            {cif ? (
              <div
                className="viewer3d-shell"
              >
                <CrystalViewer
                  cif={cif}
                  style={crystalStyle}
                  onReady={(h) => {
                    crystalRef.current = h
                  }}
                  onStats={setCrystalStats}
                  onError={setError}
                />
              </div>
            ) : (
              <div className="viewer3d-shell viewer3d-empty">
                <p>
                  Pick a structure in <strong>Crystal &amp; export</strong>, or
                  upload your own CIF.
                </p>
                <p className="panel-note">
                  Set the lattice size in unit cells, then render. Structures come
                  from the Crystallography Open Database.
                </p>
              </div>
            )}
          </div>

          <div className={view === '3d' ? 'pane-live' : 'pane-hidden'}>
            {sdf3d ? (
              <div
                className="viewer3d-shell"
              >
                <Viewer3D
                  sdf={sdf3d}
                  style={style3d}
                  onReady={(h) => {
                    viewer3dRef.current = h
                  }}
                />
              </div>
            ) : (
              <div className="viewer3d-shell viewer3d-empty">
                <p>
                  Search a compound and choose <strong>View 3D</strong> to load a
                  PubChem conformer.
                </p>
                <p className="panel-note">
                  3D geometry comes from PubChem's precomputed conformers, so it
                  needs a real compound name or CID — a structure you drew by
                  hand has no 3D coordinates to show.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="preview-column">
          <PreviewPanel
            preview={preview}
            busy={busy}
            rendering={previewBusy}
            live={
              (view === '2d' && liveFormat !== null) ||
              (view === 'lewis' && liveLewis !== null)
            }
            onConfirm={confirmDownload}
            onDiscard={cancelPreview}
          />
        </div>

        <aside className="side-panels">
          {view === 'crystal' ? (
            <CrystalPanel
              style={crystalStyle}
              preset={crystalPreset}
              disabled={!cif || busy}
              currentFile={cifFile}
              stats={crystalStats}
              onPreset={(key) => setCrystalStyle(CRYSTAL_PRESETS[key].style)}
              onChange={(patch) =>
                setCrystalStyle((prev) => ({ ...prev, ...patch }))
              }
              onPickStructure={handlePickStructure}
              onUploadCif={handleUploadCif}
              onRecenter={() => crystalRef.current?.recenter()}
              onRender={handleRenderCrystal}
            />
          ) : view === 'lewis' ? (
            <LewisPanel
              style={lewisStyle}
              disabled={!ketcher || busy}
              format={renderFormat}
              live={liveLewis !== null}
              report={lewisReport}
              onChange={(patch) => setLewisStyle((prev) => ({ ...prev, ...patch }))}
              onFormat={setRenderFormat}
              onRender={handleRenderLewis}
              onWorksheet={handleLewisWorksheet}
            />
          ) : view === '2d' ? (
            <StylePanel
              style={style}
              preset={preset}
              disabled={!ketcher || busy}
              format={renderFormat}
              live={liveFormat !== null}
              onPreset={(key) => setStyle(STYLE_PRESETS[key].style)}
              onChange={(patch) => setStyle((prev) => ({ ...prev, ...patch }))}
              onFormat={setRenderFormat}
              onRender={() => handleExport(renderFormat)}
            />
          ) : (
            <Style3DPanel
              style={style3d}
              preset={preset3d}
              disabled={!sdf3d || busy}
              onPreset={(key) => setStyle3d(PRESETS_3D[key].style)}
              onChange={(patch) => setStyle3d((prev) => ({ ...prev, ...patch }))}
              onRecenter={() => viewer3dRef.current?.recenter()}
              onRender={handleExport3DPng}
            />
          )}
        </aside>
      </main>

      <footer className="app-footer">
        <p>
          Draw with Ketcher or search PubChem, then export SVG for Illustrator.
          Structures via{' '}
          <a
            href="https://pubchem.ncbi.nlm.nih.gov/"
            target="_blank"
            rel="noreferrer"
          >
            PubChem
          </a>
          ; editor by{' '}
          <a href="https://github.com/epam/ketcher" target="_blank" rel="noreferrer">
            EPAM Ketcher
          </a>{' '}
          (Apache 2.0).
        </p>
      </footer>
    </div>
  )
}
