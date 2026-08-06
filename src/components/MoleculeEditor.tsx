import { useMemo, useRef } from 'react'
import { Editor } from 'ketcher-react'
import { StandaloneStructServiceProvider } from 'ketcher-standalone'
import type { Ketcher } from 'ketcher-core'
import 'ketcher-react/dist/index.css'

type MoleculeEditorProps = {
  onReady: (ketcher: Ketcher) => void
}

export function MoleculeEditor({ onReady }: MoleculeEditorProps) {
  // Provider must be stable across renders; Ketcher init is expensive.
  const provider = useMemo(() => new StandaloneStructServiceProvider(), [])
  const readyRef = useRef(false)

  return (
    <div className="editor-shell">
      <Editor
        staticResourcesUrl={import.meta.env.BASE_URL}
        structServiceProvider={provider}
        errorHandler={(message) => {
          console.error('[Ketcher]', message)
        }}
        onInit={(ketcher) => {
          if (readyRef.current) return
          readyRef.current = true
          // Expose for console debugging during curriculum image work
          ;(window as unknown as { ketcher?: Ketcher }).ketcher = ketcher
          onReady(ketcher)
        }}
      />
    </div>
  )
}
