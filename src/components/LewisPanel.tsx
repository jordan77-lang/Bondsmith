import { useId } from 'react'
import type { LewisAtomReport, LewisStyle } from '../lib/lewis'

type LewisPanelProps = {
  style: LewisStyle
  disabled: boolean
  format: 'svg' | 'png'
  live: boolean
  /** Electron bookkeeping from the last render, or null before one. */
  report: LewisAtomReport[] | null
  onChange: (patch: Partial<LewisStyle>) => void
  onFormat: (f: 'svg' | 'png') => void
  onRender: () => void
  /** Download the student (charges hidden) and key (charges shown) pair. */
  onWorksheet: () => void
}

type SliderDef = {
  key: 'bondLength' | 'fontSize' | 'bondThickness' | 'dotRadius' | 'pngScale'
  label: string
  min: number
  max: number
  step: number
  suffix?: string
}

const SLIDERS: SliderDef[] = [
  { key: 'bondLength', label: 'Bond length', min: 40, max: 120, step: 1, suffix: 'px' },
  { key: 'fontSize', label: 'Label size', min: 10, max: 40, step: 0.5, suffix: 'px' },
  { key: 'bondThickness', label: 'Bond weight', min: 0.5, max: 5, step: 0.1, suffix: 'px' },
  { key: 'dotRadius', label: 'Dot size', min: 1, max: 5, step: 0.1, suffix: 'px' },
]

const PNG_SLIDER: SliderDef = {
  key: 'pngScale',
  label: 'PNG scale',
  min: 1,
  max: 8,
  step: 1,
  suffix: '×',
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

/**
 * Lewis structure controls.
 *
 * The dots are never set by hand: they're computed from the structure's
 * charges and bonds (see lib/lewis). That makes the worksheet pair trustworthy
 * — the student version is the key with only the charges removed.
 */
export function LewisPanel({
  style,
  disabled,
  format,
  live,
  report,
  onChange,
  onFormat,
  onRender,
  onWorksheet,
}: LewisPanelProps) {
  const id = useId()
  const sliders = format === 'png' ? [...SLIDERS, PNG_SLIDER] : SLIDERS
  // Hydrogens only clutter the table unless they carry a charge (H⁺, H⁻).
  const rows = report?.filter((a) => a.symbol !== 'H' || a.formalCharge !== 0) ?? []
  const notes = rows.flatMap((a) => a.notes.map((n) => `${a.name}: ${n}`))

  return (
    <section className="panel style-panel" aria-labelledby={`${id}-h`}>
      <div className="panel-head">
        <h2 id={`${id}-h`}>Lewis structure</h2>
        <p className="panel-hint">Dots computed from charges &amp; bonds.</p>
      </div>

      <fieldset className="seg" disabled={disabled}>
        <legend>Bonds</legend>
        <label className={style.bondStyle === 'lines' ? 'seg-on' : undefined}>
          <input
            type="radio"
            name={`${id}-bonds`}
            checked={style.bondStyle === 'lines'}
            onChange={() => onChange({ bondStyle: 'lines' })}
          />
          Lines
        </label>
        <label className={style.bondStyle === 'dots' ? 'seg-on' : undefined}>
          <input
            type="radio"
            name={`${id}-bonds`}
            checked={style.bondStyle === 'dots'}
            onChange={() => onChange({ bondStyle: 'dots' })}
          />
          Electron dots
        </label>
      </fieldset>

      <div className="toggle-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.showCharges}
            disabled={disabled}
            onChange={(e) => onChange({ showCharges: e.target.checked })}
          />
          <span>Show formal charges</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.circleCharges}
            disabled={disabled || !style.showCharges}
            onChange={(e) => onChange({ circleCharges: e.target.checked })}
          />
          <span>Circle charges (⊕ ⊖)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.highlightElectrons}
            disabled={disabled}
            onChange={(e) => onChange({ highlightElectrons: e.target.checked })}
          />
          <span>Electrons in blue</span>
        </label>
      </div>

      <div className="slider-grid">
        {sliders.map((s) => (
          <label key={s.key} className="slider-row">
            <span className="slider-label">
              {s.label}
              <output>
                {style[s.key]}
                {s.suffix ?? ''}
              </output>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={style[s.key]}
              disabled={disabled}
              onChange={(e) =>
                onChange({ [s.key]: Number(e.target.value) } as Partial<LewisStyle>)
              }
            />
          </label>
        ))}
      </div>

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
        <fieldset className="seg format-seg" disabled={disabled}>
          <legend>Format</legend>
          <label className={format === 'svg' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${id}-fmt`}
              checked={format === 'svg'}
              onChange={() => onFormat('svg')}
            />
            SVG
          </label>
          <label className={format === 'png' ? 'seg-on' : undefined}>
            <input
              type="radio"
              name={`${id}-fmt`}
              checked={format === 'png'}
              onChange={() => onFormat('png')}
            />
            PNG
          </label>
        </fieldset>
        <button type="button" className="btn btn-accent" disabled={disabled} onClick={onRender}>
          {live ? 'Re-render' : 'Render preview'}
        </button>
      </div>

      <div className="lewis-worksheet">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={onWorksheet}
          title="Two files: charges hidden for students, charges shown for the key"
        >
          Download student + key
        </button>
        <p className="panel-note">
          The student copy hides formal charges so they can be worked out from the
          dots and bonds. Both copies have identical dot positions.
        </p>
      </div>

      {rows.length > 0 && (
        <details className="lewis-report" open>
          <summary>Electron bookkeeping</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Atom</th>
                <th scope="col" title="Valence electrons of the neutral atom">V</th>
                <th scope="col" title="Bonds, counted by bond order (incl. H)">B</th>
                <th scope="col" title="Nonbonding electrons (dots)">N</th>
                <th scope="col" title="Formal charge = V − N − B">FC</th>
                <th scope="col" title="Electrons around the atom: 2B + N">e⁻</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.name}>
                  <th scope="row">{a.name}</th>
                  <td>{a.valence ?? '—'}</td>
                  <td>{a.bonds}</td>
                  <td>{a.valence === null ? '—' : a.nonbonding}</td>
                  <td>{signed(a.formalCharge)}</td>
                  <td>{a.valence === null ? '—' : a.shell}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="panel-note">FC = V − N − B. Each row should match the drawing.</p>
          {notes.length > 0 && (
            <ul className="lewis-notes">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </section>
  )
}
