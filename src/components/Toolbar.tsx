import { useEffect, useId, useRef, useState } from 'react'
import { suggestCompounds } from '../lib/pubchem'

type ToolbarProps = {
  ready: boolean
  busy: boolean
  message: string | null
  error: string | null
  warnings: string[]
  moleculeLabel: string
  /** The persisted preference, which is what the control reflects (Auto stays Auto). */
  themePref: 'light' | 'dark' | 'system'
  view: '2d' | '3d'
  onTheme: (t: 'light' | 'dark' | 'system') => void
  onView: (v: '2d' | '3d') => void
  onSearch: (query: string) => void
  onLoad3D: (query: string) => void
  onLoadSmiles: (smiles: string) => void
  onCopySmiles: () => void
  onDismissError: () => void
  onDismissWarnings: () => void
}

export function Toolbar({
  ready,
  busy,
  message,
  error,
  warnings,
  moleculeLabel,
  themePref,
  view,
  onTheme,
  onView,
  onSearch,
  onLoad3D,
  onLoadSmiles,
  onCopySmiles,
  onDismissError,
  onDismissWarnings,
}: ToolbarProps) {
  const searchId = useId()
  const smilesId = useId()
  const listId = `${searchId}-list`
  const [query, setQuery] = useState('')
  const [smiles, setSmiles] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [openSuggest, setOpenSuggest] = useState(false)
  // -1 means "no suggestion highlighted"; Enter then submits the raw query.
  const [active, setActive] = useState(-1)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (query.trim().length < 2) {
      setSuggestions([])
      setActive(-1)
      return
    }
    suggestTimer.current = setTimeout(() => {
      void suggestCompounds(query).then((s) => {
        setSuggestions(s)
        setActive(-1)
      })
    }, 280)
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current)
    }
  }, [query])

  function submitSearch(value = query) {
    const q = value.trim()
    if (!q || busy) return
    setOpenSuggest(false)
    setActive(-1)
    setQuery(q)
    onSearch(q)
  }

  const showList = openSuggest && suggestions.length > 0

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && showList) {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
      return
    }
    if (e.key === 'ArrowUp' && showList) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
      return
    }
    if (e.key === 'Home' && showList) {
      e.preventDefault()
      setActive(0)
      return
    }
    if (e.key === 'End' && showList) {
      e.preventDefault()
      setActive(suggestions.length - 1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      submitSearch(active >= 0 ? suggestions[active] : query)
      return
    }
    if (e.key === 'Escape') {
      setOpenSuggest(false)
      setActive(-1)
    }
  }

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand-block">
          <h1 className="brand-title">Mol Forge</h1>
        </div>

        <div className="header-controls">
          <fieldset className="seg view-seg">
            <legend className="sr-only">View</legend>
            {(['2d', '3d'] as const).map((v) => (
              <label key={v} className={view === v ? 'seg-on' : undefined}>
                <input
                  type="radio"
                  name="view"
                  checked={view === v}
                  onChange={() => onView(v)}
                />
                {v === '2d' ? '2D editor' : '3D viewer'}
              </label>
            ))}
          </fieldset>

          <fieldset className="seg theme-seg">
            <legend className="sr-only">Theme</legend>
            {(['light', 'system', 'dark'] as const).map((t) => (
              <label key={t} className={themePref === t ? 'seg-on' : undefined}>
                <input
                  type="radio"
                  name="theme"
                  checked={themePref === t}
                  onChange={() => onTheme(t)}
                />
                {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'Auto'}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="toolbar-controls">
        <div className="field search-field">
          <label htmlFor={searchId}>Search PubChem</label>
          <div className="input-row">
            <input
              id={searchId}
              type="search"
              placeholder="e.g. caffeine, benzene, aspirin"
              value={query}
              disabled={!ready}
              autoComplete="off"
              role="combobox"
              aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                active >= 0 ? `${listId}-opt-${active}` : undefined
              }
              onChange={(e) => {
                setQuery(e.target.value)
                setOpenSuggest(true)
              }}
              onKeyDown={onSearchKeyDown}
              onFocus={() => setOpenSuggest(true)}
              onBlur={() => setOpenSuggest(false)}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready || busy || !query.trim()}
              onClick={() => submitSearch()}
            >
              Load
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !query.trim()}
              title="Load a PubChem 3D conformer for this compound"
              onClick={() => {
                const q = query.trim()
                if (q) {
                  setOpenSuggest(false)
                  onLoad3D(q)
                }
              }}
            >
              View 3D
            </button>
          </div>
          {showList && (
            <ul className="suggest-list" role="listbox" id={listId}>
              {suggestions.map((name, i) => (
                <li key={name} role="none">
                  <button
                    type="button"
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? 'suggest-active' : undefined}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => submitSearch(name)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field smiles-field">
          <label htmlFor={smilesId}>Or paste SMILES</label>
          <div className="input-row">
            <input
              id={smilesId}
              type="text"
              placeholder="CCO · ethanol"
              value={smiles}
              disabled={!ready}
              spellCheck={false}
              onChange={(e) => setSmiles(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && smiles.trim() && !busy) {
                  onLoadSmiles(smiles.trim())
                }
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!ready || busy || !smiles.trim()}
              onClick={() => onLoadSmiles(smiles.trim())}
            >
              Draw
            </button>
          </div>
        </div>

        {/*
          Rendering and downloading both live in the sidebar panels, next to the
          controls they act on. The header keeps only structure-level actions.
        */}
        {view === '2d' && (
          <div className="export-group" role="group" aria-label="Structure actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!ready || busy}
              onClick={onCopySmiles}
            >
              Copy SMILES
            </button>
          </div>
        )}
      </div>

      <div className="status-line" aria-live="polite">
        {!ready && <span className="status-loading">Starting editor…</span>}
        {ready && moleculeLabel && (
          <span>
            Current: <strong>{moleculeLabel}</strong>
          </span>
        )}
        {message && <span className="status-msg">{message}</span>}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="alert-dismiss"
            aria-label="Dismiss error"
            onClick={onDismissError}
          >
            ×
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="alert alert-warn">
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button
            type="button"
            className="alert-dismiss"
            aria-label="Dismiss notes"
            onClick={onDismissWarnings}
          >
            ×
          </button>
        </div>
      )}
    </header>
  )
}
