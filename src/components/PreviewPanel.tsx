import { useId } from 'react'

export type PreviewData = {
  /** Object URL for the rendered image. */
  url: string
  /** Suggested download filename. */
  filename: string
  /** 'svg' | 'png' — drives the format badge. */
  format: string
  /** Byte size of the blob. */
  bytes: number
  /** Pixel or user-unit dimensions, when known. */
  width?: number
  height?: number
  /** Whether the image has a transparent background. */
  transparent: boolean
  /** Non-fatal notes from the export (e.g. font advice). */
  warnings?: string[]
}

type PreviewPanelProps = {
  preview: PreviewData | null
  busy: boolean
  /** A live re-render is in flight — dim the image rather than removing it. */
  rendering: boolean
  /** Live preview is active, so depiction changes refresh this automatically. */
  live: boolean
  onConfirm: () => void
  onDiscard: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Export preview, shown in the sidebar rather than as a modal.
 *
 * A panel beats a dialog here because figure work is iterative: you export,
 * look, adjust a slider, export again. A modal would force a dismiss on every
 * cycle and would cover the depiction controls you're trying to adjust. Living
 * beside those controls means the preview and the sliders are visible together.
 */
export function PreviewPanel({
  preview,
  busy,
  rendering,
  live,
  onConfirm,
  onDiscard,
}: PreviewPanelProps) {
  const id = useId()

  const dims =
    preview?.width && preview?.height
      ? `${Math.round(preview.width)} × ${Math.round(preview.height)}`
      : null

  return (
    <section className="panel preview-panel" aria-labelledby={`${id}-h`}>
      <div className="panel-head">
        <h2 id={`${id}-h`}>Preview</h2>
        <span className="preview-flags">
          {live && (
            <span className="preview-badge preview-live" title="Updates as you adjust the depiction">
              Live
            </span>
          )}
          {preview && (
            <span className="preview-badge">{preview.format.toUpperCase()}</span>
          )}
        </span>
      </div>

      {!preview ? (
        <p className="panel-note">
          {busy
            ? 'Rendering…'
            : 'Export SVG or PNG to preview it here. After that it updates live as you adjust the depiction.'}
        </p>
      ) : (
        <>
          <div
            className={`preview-stage${preview.transparent ? ' preview-checker' : ''}${
              rendering ? ' preview-rendering' : ''
            }`}
            aria-busy={rendering}
          >
            <img src={preview.url} alt="Export preview" />
          </div>

          <dl className="preview-meta">
            {dims && (
              <div>
                <dt>Size</dt>
                <dd>{dims}</dd>
              </div>
            )}
            <div>
              <dt>File</dt>
              <dd>{formatBytes(preview.bytes)}</dd>
            </div>
            <div>
              <dt>Background</dt>
              <dd>{preview.transparent ? 'Transparent' : 'White'}</dd>
            </div>
          </dl>

          {preview.warnings && preview.warnings.length > 0 && (
            <div className="alert alert-warn preview-warn">
              <ul>
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="preview-filename" title={preview.filename}>
            {preview.filename}
          </p>

          <div className="preview-actions">
            <button
              type="button"
              className="btn btn-accent"
              onClick={onConfirm}
              disabled={busy}
            >
              Download
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onDiscard}
              disabled={busy}
            >
              Discard
            </button>
          </div>
        </>
      )}
    </section>
  )
}
