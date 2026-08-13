import { useId, useRef } from 'react'
import {
  ATOM_WARN_THRESHOLD,
  CRYSTAL_PRESETS,
  STRUCTURE_LIBRARY,
  type CrystalPresetKey,
  type CrystalStyle,
} from '../lib/crystal'

type CrystalPanelProps = {
  style: CrystalStyle
  preset: CrystalPresetKey | 'custom'
  disabled: boolean
  /** Currently loaded structure file, or null. */
  currentFile: string | null
  stats: { cellAtoms: number; totalAtoms: number } | null
  onPreset: (key: CrystalPresetKey) => void
  onChange: (patch: Partial<CrystalStyle>) => void
  onPickStructure: (file: string) => void
  onUploadCif: (text: string, name: string) => void
  onRecenter: () => void
  onRender: () => void
}

export function CrystalPanel({
  style,
  preset,
  disabled,
  currentFile,
  stats,
  onPreset,
  onChange,
  onPickStructure,
  onUploadCif,
  onRecenter,
  onRender,
}: CrystalPanelProps) {
  const id = useId()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const heavy = (stats?.totalAtoms ?? 0) > ATOM_WARN_THRESHOLD
  const showsSpheres = style.mode === 'ball-stick' || style.mode === 'spacefill'
  const showsSticks = style.mode === 'ball-stick' || style.mode === 'stick'

  return (
    <section className="panel style-panel" aria-labelledby={`${id}-h`}>
      <div className="panel-head">
        <h2 id={`${id}-h`}>Crystal &amp; export</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRecenter}
          disabled={disabled}
        >
          Recenter
        </button>
      </div>

      <label className="select-row">
        <span>Structure</span>
        <select
          value={currentFile ?? ''}
          onChange={(e) => e.target.value && onPickStructure(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {STRUCTURE_LIBRARY.map((s) => (
            <option key={s.file} value={s.file}>
              {s.label} — {s.formula}
            </option>
          ))}
          {currentFile?.startsWith('upload:') && (
            <option value={currentFile}>
              {currentFile.replace('upload:', '')} (uploaded)
            </option>
          )}
        </select>
      </label>

      <div className="upload-row">
        <input
          ref={fileRef}
          type="file"
          accept=".cif,chemical/x-cif,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            void file.text().then((text) => onUploadCif(text, file.name))
            // Reset so re-picking the same file fires onChange again.
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileRef.current?.click()}
        >
          Upload CIF…
        </button>
        <span className="panel-hint">
          Any CIF from COD, ICSD, or CCDC.
        </span>
      </div>

      <div className="preset-row" role="group" aria-label="Crystal presets">
        {(Object.keys(CRYSTAL_PRESETS) as CrystalPresetKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`chip${preset === key ? ' chip-active' : ''}`}
            aria-pressed={preset === key}
            disabled={disabled}
            title={CRYSTAL_PRESETS[key].hint}
            onClick={() => onPreset(key)}
          >
            {CRYSTAL_PRESETS[key].label}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="chip chip-static">Custom</span>
        )}
      </div>

      {/* Lattice size — the core feature: how many unit cells to draw. */}
      <fieldset className="lattice-fields" disabled={disabled}>
        <legend>Lattice size (unit cells)</legend>
        <div className="lattice-row">
          {(['na', 'nb', 'nc'] as const).map((axis, i) => (
            <label key={axis}>
              <span>{'abc'[i]}</span>
              <input
                type="number"
                min={1}
                max={12}
                value={style[axis]}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(12, Number(e.target.value) || 1))
                  onChange({ [axis]: n } as Partial<CrystalStyle>)
                }}
              />
            </label>
          ))}
        </div>
        {stats && (
          <p className={`panel-note${heavy ? ' note-warn' : ''}`}>
            {stats.cellAtoms.toLocaleString()} atoms per cell ·{' '}
            <strong>{stats.totalAtoms.toLocaleString()} total</strong>
            {heavy && ' — large lattices render slowly'}
          </p>
        )}
      </fieldset>

      <div className="slider-grid">
        {showsSpheres && (
          <label className="slider-row">
            <span className="slider-label">
              Atom size
              <output>{style.sphereScale.toFixed(2)}× VDW</output>
            </span>
            <input
              type="range"
              min={0.08}
              max={1}
              step={0.02}
              value={style.sphereScale}
              disabled={disabled}
              onChange={(e) => onChange({ sphereScale: Number(e.target.value) })}
            />
          </label>
        )}
        {showsSticks && (
          <label className="slider-row">
            <span className="slider-label">
              Bond radius
              <output>{style.stickRadius.toFixed(2)} Å</output>
            </span>
            <input
              type="range"
              min={0.02}
              max={0.4}
              step={0.01}
              value={style.stickRadius}
              disabled={disabled}
              onChange={(e) => onChange({ stickRadius: Number(e.target.value) })}
            />
          </label>
        )}
      </div>

      <div className="mode-row" role="group" aria-label="Display mode">
        {(
          [
            ['ball-stick', 'Ball & stick'],
            ['stick', 'Stick'],
            ['spacefill', 'Spacefill'],
            ['wireframe', 'Wireframe'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`chip${style.mode === mode ? ' chip-active' : ''}`}
            aria-pressed={style.mode === mode}
            disabled={disabled}
            onClick={() => onChange({ mode })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toggle-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.showCell}
            disabled={disabled}
            onChange={(e) => onChange({ showCell: e.target.checked })}
          />
          <span>Unit cell outline</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.hideSolvent}
            disabled={disabled}
            onChange={(e) => onChange({ hideSolvent: e.target.checked })}
          />
          <span>Hide lattice water</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.hideHydrogen}
            disabled={disabled}
            onChange={(e) => onChange({ hideHydrogen: e.target.checked })}
          />
          <span>Hide hydrogens</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.orthographic}
            disabled={disabled}
            onChange={(e) => onChange({ orthographic: e.target.checked })}
          />
          <span>Orthographic</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.spin}
            disabled={disabled}
            onChange={(e) => onChange({ spin: e.target.checked })}
          />
          <span>Auto-rotate</span>
        </label>
      </div>

      <label className="select-row">
        <span>Export quality</span>
        <select
          value={style.exportScale}
          disabled={disabled}
          onChange={(e) => onChange({ exportScale: Number(e.target.value) })}
        >
          <option value={1}>1× — screen size</option>
          <option value={2}>2× — web / slides</option>
          <option value={3}>3× — print (recommended)</option>
          <option value={4}>4× — large print</option>
          <option value={6}>6× — poster</option>
        </select>
      </label>

      <fieldset className="seg" disabled={disabled}>
        <legend>Background</legend>
        <label className={style.background === 'transparent' ? 'seg-on' : undefined}>
          <input
            type="radio"
            name={`${id}-bg`}
            checked={style.background === 'transparent'}
            onChange={() => onChange({ background: 'transparent' })}
          />
          Transparent
        </label>
        <label className={style.background === 'white' ? 'seg-on' : undefined}>
          <input
            type="radio"
            name={`${id}-bg`}
            checked={style.background === 'white'}
            onChange={() => onChange({ background: 'white' })}
          />
          White
        </label>
      </fieldset>

      <div className="render-row">
        <button
          type="button"
          className="btn btn-accent"
          disabled={disabled}
          onClick={onRender}
        >
          Render preview
        </button>
      </div>
    </section>
  )
}
