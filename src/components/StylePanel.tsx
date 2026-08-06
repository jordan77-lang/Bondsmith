import { useId } from 'react'
import {
  STYLE_PRESETS,
  type PresetKey,
  type RenderStyle,
} from '../lib/render'

type StylePanelProps = {
  style: RenderStyle
  preset: PresetKey | 'custom'
  disabled: boolean
  /** Output format the render button will produce. */
  format: 'svg' | 'png'
  /** Live preview already active, so the button re-renders rather than starts. */
  live: boolean
  onPreset: (key: PresetKey) => void
  onChange: (patch: Partial<RenderStyle>) => void
  onFormat: (f: 'svg' | 'png') => void
  onRender: () => void
}

type SliderDef = {
  key: keyof RenderStyle
  label: string
  min: number
  max: number
  step: number
  suffix?: string
}

/**
 * Depiction controls. These map to real Indigo render options (see lib/render),
 * so what you set here is baked into the exported vector rather than applied
 * afterwards in Illustrator.
 */
const SLIDERS: SliderDef[] = [
  { key: 'bondLength', label: 'Bond length', min: 15, max: 80, step: 1, suffix: 'px' },
  { key: 'bondThickness', label: 'Bond weight', min: 0.5, max: 6, step: 0.1, suffix: 'px' },
  { key: 'bondSpacing', label: 'Double-bond gap', min: 0.05, max: 0.4, step: 0.01 },
  { key: 'fontSize', label: 'Label size', min: 4, max: 24, step: 0.5, suffix: 'px' },
  { key: 'fontSizeSub', label: 'Subscript size', min: 3, max: 18, step: 0.5, suffix: 'px' },
  { key: 'stereoBondWidth', label: 'Stereo wedge', min: 2, max: 14, step: 0.5, suffix: 'px' },
]

export function StylePanel({
  style,
  preset,
  disabled,
  format,
  live,
  onPreset,
  onChange,
  onFormat,
  onRender,
}: StylePanelProps) {
  const groupId = useId()

  return (
    <section className="panel style-panel" aria-labelledby={`${groupId}-h`}>
      <div className="panel-head">
        <h2 id={`${groupId}-h`}>Depiction &amp; export</h2>
        <p className="panel-hint">Baked into the exported vector.</p>
      </div>

      <div className="preset-row" role="group" aria-label="Style presets">
        {(Object.keys(STYLE_PRESETS) as PresetKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`chip${preset === key ? ' chip-active' : ''}`}
            aria-pressed={preset === key}
            disabled={disabled}
            title={STYLE_PRESETS[key].hint}
            onClick={() => onPreset(key)}
          >
            {STYLE_PRESETS[key].label}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="chip chip-static" aria-live="polite">
            Custom
          </span>
        )}
      </div>

      <div className="slider-grid">
        {SLIDERS.map((s) => {
          const value = style[s.key] as number
          return (
            <label key={s.key} className="slider-row">
              <span className="slider-label">
                {s.label}
                <output>
                  {value}
                  {s.suffix ?? ''}
                </output>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={value}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ [s.key]: Number(e.target.value) } as Partial<RenderStyle>)
                }
              />
            </label>
          )
        })}
      </div>

      <div className="toggle-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.coloring}
            disabled={disabled}
            onChange={(e) => onChange({ coloring: e.target.checked })}
          />
          <span>CPK element colors</span>
        </label>

        <fieldset className="seg" disabled={disabled}>
          <legend>Background</legend>
          <label className={style.background === 'transparent' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${groupId}-bg`}
              checked={style.background === 'transparent'}
              onChange={() => onChange({ background: 'transparent' })}
            />
            Transparent
          </label>
          <label className={style.background === 'white' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${groupId}-bg`}
              checked={style.background === 'white'}
              onChange={() => onChange({ background: 'white' })}
            />
            White
          </label>
        </fieldset>
      </div>

      <p className="panel-note">
        Transparent is the default so there’s no white rectangle to delete in
        Illustrator.
      </p>

      {/* Render lives here rather than in the header: it acts on these controls,
          and the preview it feeds sits directly below. */}
      <div className="render-row">
        <fieldset className="seg format-seg" disabled={disabled}>
          <legend>Format</legend>
          <label className={format === 'svg' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${groupId}-fmt`}
              checked={format === 'svg'}
              onChange={() => onFormat('svg')}
            />
            SVG
          </label>
          <label className={format === 'png' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${groupId}-fmt`}
              checked={format === 'png'}
              onChange={() => onFormat('png')}
            />
            PNG
          </label>
        </fieldset>
        <button
          type="button"
          className="btn btn-accent"
          disabled={disabled}
          onClick={onRender}
          title={
            format === 'svg'
              ? 'Render a cropped, transparent vector into the preview'
              : 'Render a raster image into the preview'
          }
        >
          {live ? 'Re-render' : 'Render preview'}
        </button>
      </div>
    </section>
  )
}
