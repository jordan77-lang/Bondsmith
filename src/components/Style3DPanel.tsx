import { useId } from 'react'
import {
  activeControls,
  PRESETS_3D,
  type Preset3DKey,
  type Style3D,
} from '../lib/render3d'

type Style3DPanelProps = {
  style: Style3D
  preset: Preset3DKey | 'custom'
  disabled: boolean
  onPreset: (key: Preset3DKey) => void
  onChange: (patch: Partial<Style3D>) => void
  onRecenter: () => void
  onRender: () => void
}

const COLORSCHEMES: Array<{ key: Style3D['colorscheme']; label: string }> = [
  { key: 'Jmol', label: 'CPK (Jmol)' },
  { key: 'greenCarbon', label: 'Green C' },
  { key: 'cyanCarbon', label: 'Cyan C' },
  { key: 'grayCarbon', label: 'Gray C' },
]

export function Style3DPanel({
  style,
  preset,
  disabled,
  onPreset,
  onChange,
  onRecenter,
  onRender,
}: Style3DPanelProps) {
  const id = useId()
  const shows = activeControls(style.mode)

  return (
    <section className="panel style-panel" aria-labelledby={`${id}-h`}>
      <div className="panel-head">
        <h2 id={`${id}-h`}>3D depiction &amp; export</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRecenter}
          disabled={disabled}
        >
          Recenter
        </button>
      </div>

      <div className="preset-row" role="group" aria-label="3D style presets">
        {(Object.keys(PRESETS_3D) as Preset3DKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`chip${preset === key ? ' chip-active' : ''}`}
            aria-pressed={preset === key}
            disabled={disabled}
            title={PRESETS_3D[key].hint}
            onClick={() => onPreset(key)}
          >
            {PRESETS_3D[key].label}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="chip chip-static" aria-live="polite">
            Custom
          </span>
        )}
      </div>

      <div className="slider-grid">
        {shows.sphere && (
          <label className="slider-row">
            <span className="slider-label">
              Atom size
              <output>{style.sphereScale.toFixed(2)}× VDW</output>
            </span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={style.sphereScale}
              disabled={disabled}
              onChange={(e) => onChange({ sphereScale: Number(e.target.value) })}
            />
          </label>
        )}

        {shows.stick && (
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

      <label className="select-row">
        <span>Coloring</span>
        <select
          value={style.colorscheme}
          disabled={disabled}
          onChange={(e) =>
            onChange({ colorscheme: e.target.value as Style3D['colorscheme'] })
          }
        >
          {COLORSCHEMES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="toggle-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.orthographic}
            disabled={disabled}
            onChange={(e) => onChange({ orthographic: e.target.checked })}
          />
          <span>Orthographic (no perspective)</span>
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

        <fieldset className="seg" disabled={disabled}>
          <legend>Background</legend>
          <label className={style.background === 'transparent' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${id}-bg3d`}
              checked={style.background === 'transparent'}
              onChange={() => onChange({ background: 'transparent' })}
            />
            Transparent
          </label>
          <label className={style.background === 'white' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${id}-bg3d`}
              checked={style.background === 'white'}
              onChange={() => onChange({ background: 'white' })}
            />
            White
          </label>
        </fieldset>
      </div>

      <p className="panel-note">
        Drag to rotate, scroll to zoom. Export captures the current camera angle
        — 3D output is raster, not vector.
      </p>

      <div className="render-row">
        <button
          type="button"
          className="btn btn-accent"
          disabled={disabled}
          onClick={onRender}
          title="Render the current view into the preview"
        >
          Render preview
        </button>
      </div>
    </section>
  )
}
