# Mol Forge

**Live: https://jordan77-lang.github.io/Molforge/**

Forge chemistry figures for curriculum work: search PubChem or draw a structure
with [Ketcher](https://github.com/epam/ketcher), tune how it's drawn, preview the
result, and export **Illustrator-ready SVG**, PNG, or a 3D render.

Built for ASU / Dreamscape Learn course materials.

## Features

- **Draw** molecules with Ketcher (bonds, rings, charges, templates)
- **Search** PubChem by common name (keyboard-navigable autocomplete) or by CID
- **Paste SMILES** to load a structure instantly
- **Live preview** — once rendered, the preview refreshes as you move the
  depiction sliders, so you see the actual export while you tune it
- **Depiction presets** (print, slide, color figure, compact) plus manual control
  over bond weight, label size, scale, and CPK coloring
- **3D viewer** — ball-and-stick, stick, spacefill, wireframe; rotatable, with
  supersampled PNG export up to 6×
- **Light / dark / auto** theming
- **Copy SMILES** for reuse in other tools

## The export flow

Rendering and downloading are two separate steps, on purpose:

1. Pick a **format** (SVG or PNG) and click **Render preview**.
2. The result appears in the **Preview** panel with its real dimensions and file
   size. From then on it's *live* — adjusting the depiction re-renders it
   automatically (debounced), so what you see is what you'll get.
3. Click **Download** when it looks right. The preview stays up so you can keep
   iterating and download again.

This exists because the expensive mistake in figure work is finding a wrong crop,
background, or label size *after* the file is already placed in Illustrator.

## Illustrator notes

- **Transparent by default.** No white rectangle to hunt down and delete. Switch
  to White in the Depiction panel when you want an opaque figure.
- **Cropped to the structure.** The `viewBox` is tightened to the drawn art plus
  a small pad, so the artboard lands on the molecule rather than on Indigo's full
  render sheet, and the art scales predictably.
- **Atom labels are live text** with a pinned `Arial / Helvetica / Liberation
  Sans` stack, which stops silent font substitution from shifting labels off
  their bonds on another machine. For archival art, run **Type ▸ Create
  Outlines** in Illustrator — the app flags this after each SVG export.
- **Depiction options are baked into the vector**, not applied afterwards, so a
  preset gives you identical weights across every figure in a set.
- **Label size is in px**, the same unit as bond length, so the two stay in
  proportion. Textbook depictions sit near 0.32 × bond length.

## 3D view

Switch to **3D viewer** in the header, or type a compound and hit **View 3D**.
Drag to rotate, scroll to zoom, then **Render 3D preview**.

- **3D output is raster, not vector.** A WebGL scene has no vector
  representation, so there's no SVG export here. For print figures the 2D path is
  still the right tool; 3D is for showing shape and stereochemistry.
- **Export quality** supersamples the canvas (1× to 6×) so resolution isn't
  limited by your window size — 4× on a typical display yields ~7400 px wide.
- **PNGs are cropped and transparent**, trimmed to the molecule so they drop onto
  any background. Choosing White composites a background during that crop.
- **Geometry comes from PubChem's precomputed conformers**, so 3D needs a real
  compound name or CID. A structure you drew by hand has no 3D coordinates —
  SMILES and 2D depictions carry none, and generating them would need a
  conformer-embedding step (RDKit/ETKDG) this app doesn't ship.
- **Not everything has a conformer.** Salts, ions, mixtures and polymers have no
  single meaningful geometry; the app says so explicitly rather than showing a
  broken view.
- Export captures the **current camera angle**, so rotate first.

## Requirements

- Node.js 22+ (Ketcher standalone WASM)
- Modern browser with WebAssembly and WebGL support

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Production build

```bash
npm run build
npm run preview
```

`dist/` can be hosted on any static host (GitHub Pages, Netlify, an ASU static
site, etc.).

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which type-checks,
lints, builds, and publishes to GitHub Pages. You can also run it by hand from
the Actions tab.

Because Pages serves from `https://<user>.github.io/<repo>/`, the workflow builds
with `BASE_PATH="/<repo>/"` so asset URLs carry that prefix; local dev falls back
to `/`. The repo name is read from `GITHUB_REPOSITORY`, so renaming or forking
doesn't break the build. If you move the app to a domain root, no change is
needed — `BASE_PATH` simply isn't set.

## Stack

| Piece | Role | License |
| --- | --- | --- |
| [Ketcher](https://github.com/epam/ketcher) (`ketcher-react` + `ketcher-standalone`) | 2D editor + structure ops (Indigo WASM) | Apache 2.0 |
| [3Dmol.js](https://3dmol.csb.pitt.edu/) | 3D molecular viewer (WebGL) | BSD-3-Clause |
| [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) | Name → 2D/3D structure lookup | Public data |
| Vite + React + TypeScript | App shell | MIT |
| Fraunces, Source Sans 3 | Self-hosted display/body type | SIL OFL 1.1 |

## Notes

- PubChem lookups need network access. SMILES input and all rendering are local.
- Fonts are self-hosted (`public/fonts`, `src/fonts.css`), so the app makes no
  third-party requests.
- React Strict Mode is off on purpose — Ketcher's WASM editor does not tolerate
  double-mounting. For the same reason the 2D and 3D panes are both kept mounted
  and toggled with CSS rather than conditionally rendered.
- The editor canvas and 3D viewer stay light in dark mode on purpose: they're the
  document surface, and inverting a figure would misrepresent it.
- `npm install` reports pre-existing advisories from `ketcher-react`'s
  `draft-js`/`immutable` dependencies. `npm audit fix` would force versions under
  Ketcher and risk breaking the editor; these are DoS/prototype-pollution issues
  in a local-first tool with no untrusted input.

### Indigo option gotchas

Two things cost real debugging time and are easy to reintroduce:

- Indigo parses colors as **comma-separated numeric triples** (`"255, 255, 255"`).
  Hex (`#ffffff`), bare hex, and CSS names are all rejected with
  `option manager: Cannot recognize "..." as a color value`.
- **Transparency means omitting** `render-background-color`, not passing `''`.
  `ketcher-standalone` only skips `null`/`undefined` when building the option
  map, so an empty string reaches Indigo and fails the same way.

## Layout

```
src/
  App.tsx                  state, render/preview/download orchestration
  components/
    Toolbar.tsx            search, SMILES, format + render, view/theme switches
    MoleculeEditor.tsx     Ketcher wrapper (2D)
    Viewer3D.tsx           3Dmol wrapper (WebGL, imperative, supersampling)
    StylePanel.tsx         2D depiction presets + sliders
    Style3DPanel.tsx       3D presets, atom/bond size, projection, quality
    PreviewPanel.tsx       live preview + download
  lib/
    render.ts              RenderStyle → Indigo option names
    render3d.ts            Style3D → 3Dmol spec, PNG cropping
    svg.ts                 viewBox tightening, font pinning
    export.ts              export orchestration
    pubchem.ts             PUG REST 2D + CID resolution
    pubchem3d.ts           PUG REST 3D conformers + dimensionality check
    storage.ts             localStorage state, theme
    download.ts            blob download
```
