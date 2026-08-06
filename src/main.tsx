import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import App from './App.tsx'

// StrictMode disabled: Ketcher's WASM editor does not tolerate double-mount.
createRoot(document.getElementById('root')!).render(<App />)
