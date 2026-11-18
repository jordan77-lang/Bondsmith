/**
 * Lewis structures: electron bookkeeping plus an SVG renderer.
 *
 * Nothing here guesses at chemistry. Every number comes from the structure as
 * drawn: element, formal charge, radical state and bond orders. Lone pairs then
 * follow from the definition of formal charge, run backwards:
 *
 *     FC = V − N − B          (V valence e⁻, N nonbonding e⁻, B bonds incl. H)
 *  ⇒  N  = V − FC − B
 *
 * So a structure that's correct for its charges always gets the right dots, and
 * the student exercise "count the dots and bonds, infer the charge" is exactly
 * the inverse of what the renderer did. The renderer draws whichever resonance
 * form it's given; it never picks one.
 *
 * Indigo is not used for drawing here. A Lewis depiction is a narrow style
 * (every atom labelled, plain bond lines, dots) and owning it outright keeps
 * the dots as real vector circles that land cleanly in Illustrator.
 */

import type { ParsedMol } from './molfile'
import { FONT_STACK } from './svg'

export type LewisStyle = {
  /** Centre-to-centre bond length, px. */
  bondLength: number
  /** Atom label size, px. */
  fontSize: number
  bondThickness: number
  /** Radius of an electron dot, px. */
  dotRadius: number
  /** Bonds as lines (Lewis) or as shared dot pairs (electron-dot style). */
  bondStyle: 'lines' | 'dots'
  /** Show formal charges. Off = the student version: infer them from dots. */
  showCharges: boolean
  /** Circle the charge signs (⊕ ⊖), the common formal-charge convention. */
  circleCharges: boolean
  /** Draw electrons in a contrasting colour so they read as their own layer. */
  highlightElectrons: boolean
  background: 'transparent' | 'white'
  /** PNG only: raster multiplier over the SVG's px size. */
  pngScale: number
}

export const DEFAULT_LEWIS_STYLE: LewisStyle = {
  bondLength: 64,
  fontSize: 20,
  bondThickness: 1.8,
  dotRadius: 2.2,
  bondStyle: 'lines',
  showCharges: true,
  circleCharges: false,
  highlightElectrons: false,
  background: 'transparent',
  pngScale: 4,
}

/** Colour for highlighted electrons. Blue reads against black ink in print. */
export const ELECTRON_HIGHLIGHT = '#1d5fc4'

// --- periodic data ---------------------------------------------------------

/** Main-group elements by period; position in the row = valence electrons. */
const MAIN_GROUP_ROWS = [
  ['H', 'He'],
  ['Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'],
  ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'],
  ['K', 'Ca', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr'],
  ['Rb', 'Sr', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe'],
  ['Cs', 'Ba', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'],
]

type ElementInfo = { valence: number; period: number }

const MAIN_GROUP = new Map<string, ElementInfo>()
MAIN_GROUP_ROWS.forEach((row, p) =>
  row.forEach((el, i) => MAIN_GROUP.set(el, { valence: i + 1, period: p + 1 })),
)
// Isotope symbols Ketcher may emit for hydrogen.
MAIN_GROUP.set('D', { valence: 1, period: 1 })
MAIN_GROUP.set('T', { valence: 1, period: 1 })

/**
 * Metals never get implicit hydrogens. In teaching figures they appear as
 * cations (Na⁺) or with explicitly drawn bonds, and "NaH" appearing because a
 * student typed Na would be wrong.
 */
const METALS = new Set([
  'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Ga', 'Rb', 'Sr', 'In', 'Sn',
  'Cs', 'Ba', 'Tl', 'Pb', 'Bi', 'Po',
])

/** Every symbol a molfile can carry that is a real element. */
const ALL_ELEMENTS = new Set(
  (
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
    'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba ' +
    'La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb ' +
    'Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr D T'
  ).split(' '),
)

/**
 * Bonding capacities for an atom with `veff` valence electrons after charge.
 *
 * Charge shifts an atom onto its isoelectronic neighbour: N⁺ bonds like C (4),
 * O⁻ like F (1), C⁻ like N (3), C⁺ like B (3). Second-row atoms cannot expand
 * their octet; heavier ones get the usual hypervalent steps (P 3/5, S 2/4/6).
 * This is the same valence model Ketcher uses for the implicit H it displays.
 */
function allowedValences(veff: number, period: number): number[] {
  if (veff <= 0) return [0]
  if (veff <= 4) return [veff]
  if (period <= 2) {
    return veff === 5 ? [3] : veff === 6 ? [2] : veff === 7 ? [1] : [0]
  }
  switch (veff) {
    case 5:
      return [3, 5]
    case 6:
      return [2, 4, 6]
    case 7:
      return [1, 3, 5, 7]
    case 8:
      return [0, 2, 4, 6]
    default:
      return [0]
  }
}

/** Electrons a radical flag accounts for (paired or not). */
function radicalElectrons(radical: number): number {
  return radical === 2 ? 1 : radical === 1 || radical === 3 ? 2 : 0
}

// --- electron bookkeeping --------------------------------------------------

export type LewisAtomReport = {
  /** Display name, e.g. "O", or "C2" when the element repeats. */
  name: string
  symbol: string
  /** Valence electrons of the neutral atom, or null outside the main group. */
  valence: number | null
  /** Bonds, counted by order, including hydrogens. */
  bonds: number
  /** Implicit hydrogens added for the drawing. */
  implicitH: number
  /** Nonbonding electrons, N = V − FC − B. */
  nonbonding: number
  lonePairs: number
  unpaired: number
  formalCharge: number
  /** Electrons around the atom: 2·bonds + nonbonding. */
  shell: number
  notes: string[]
}

type Analysed = LewisAtomReport & { mainGroup: boolean }

function bondOrderSums(mol: ParsedMol): number[] {
  const sums = mol.atoms.map(() => 0)
  for (const b of mol.bonds) {
    if (sums[b.a] !== undefined) sums[b.a] += b.order
    if (sums[b.b] !== undefined) sums[b.b] += b.order
  }
  return sums
}

function validate(mol: ParsedMol): void {
  if (mol.atoms.length === 0) {
    throw new Error('Canvas is empty — draw or search a molecule first.')
  }
  for (const a of mol.atoms) {
    if (!ALL_ELEMENTS.has(a.symbol)) {
      throw new Error(
        `“${a.symbol || '?'}” isn't an element. Lewis structures need real atoms — ` +
          'replace R-groups, query atoms and aliases first.',
      )
    }
  }
  for (const b of mol.bonds) {
    if (b.order === 4) {
      throw new Error('Aromatic bonds must be converted to single/double bonds first.')
    }
    if (b.order < 1 || b.order > 3) {
      throw new Error(
        'The structure has a query or special bond. Lewis structures need plain single, double or triple bonds.',
      )
    }
  }
}

/** Count electrons for every atom. Pure: no layout, no DOM. */
export function analyseLewis(mol: ParsedMol): LewisAtomReport[] {
  return analyse(mol).map(({ mainGroup: _mainGroup, ...rest }) => rest)
}

function analyse(mol: ParsedMol): Analysed[] {
  validate(mol)
  const sums = bondOrderSums(mol)

  const totals = new Map<string, number>()
  for (const a of mol.atoms) totals.set(a.symbol, (totals.get(a.symbol) ?? 0) + 1)
  const seen = new Map<string, number>()

  return mol.atoms.map((atom, i) => {
    const n = (seen.get(atom.symbol) ?? 0) + 1
    seen.set(atom.symbol, n)
    const name = (totals.get(atom.symbol) ?? 0) > 1 ? `${atom.symbol}${n}` : atom.symbol

    const info = MAIN_GROUP.get(atom.symbol)
    const explicit = sums[i] ?? 0
    const notes: string[] = []

    if (!info) {
      // d- and f-block: no single meaningful valence-electron count, so no dots.
      return {
        name,
        symbol: atom.symbol,
        valence: null,
        bonds: explicit,
        implicitH: 0,
        nonbonding: 0,
        lonePairs: 0,
        unpaired: 0,
        formalCharge: atom.charge,
        shell: 0,
        notes: ['Not a main-group element — electron dots skipped.'],
        mainGroup: false,
      }
    }

    const isH = info.period === 1
    let implicitH = 0
    if (atom.valence !== undefined) {
      implicitH = Math.max(0, atom.valence - explicit)
    } else if (!isH && !METALS.has(atom.symbol)) {
      const rad = radicalElectrons(atom.radical)
      for (const v of allowedValences(info.valence - atom.charge, info.period)) {
        if (v - rad >= explicit) {
          implicitH = v - rad - explicit
          break
        }
      }
    }

    const bonds = explicit + implicitH
    let nonbonding = info.valence - atom.charge - bonds
    let unpaired = 0
    let lonePairs = 0
    const impossible = nonbonding < 0

    if (impossible) {
      notes.push(
        `More bonds than ${atom.symbol} has valence electrons at charge ${signed(atom.charge)} — check the structure.`,
      )
      nonbonding = 0
    } else {
      const declared = atom.radical === 2 ? 1 : atom.radical === 3 ? 2 : 0
      unpaired = declared > 0 && declared <= nonbonding ? declared : nonbonding % 2
      if ((nonbonding - unpaired) % 2 !== 0) unpaired = nonbonding % 2
      lonePairs = (nonbonding - unpaired) / 2
      if (unpaired > 0) {
        notes.push(unpaired === 1 ? 'Unpaired electron (radical).' : 'Two unpaired electrons.')
      }
    }

    const shell = 2 * bonds + nonbonding
    const target = isH ? 2 : 8
    const bareCation = shell === 0 && atom.charge > 0
    if (impossible) {
      // Already flagged; an octet note on top would just repeat it.
    } else if (shell > target) {
      notes.push(
        info.period <= 2
          ? `${shell} electrons — a second-row atom can't exceed the octet. Check bond orders and charges.`
          : `Expanded octet (${shell} e⁻).`,
      )
    } else if (shell < target && !bareCation && !METALS.has(atom.symbol)) {
      notes.push(`Incomplete octet (${shell} e⁻).`)
    }

    return {
      name,
      symbol: atom.symbol,
      valence: info.valence,
      bonds,
      implicitH,
      nonbonding,
      lonePairs,
      unpaired,
      formalCharge: atom.charge,
      shell,
      notes,
      mainGroup: true,
    }
  })
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

// --- layout ----------------------------------------------------------------

type Pt = { x: number; y: number }

const TAU = Math.PI * 2
const STEPS = 72 // 5° candidate grid

function angDist(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU
  return d > Math.PI ? TAU - d : d
}

function angleOf(from: Pt, to: Pt): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) + TAU) % TAU
}

/**
 * Choose `count` directions around an atom, one at a time, each as far as
 * possible from everything already there.
 *
 * Ties go to the four textbook positions (right, down, left, up), which is why
 * an isolated Cl⁻ gets its four pairs on the axes. `prefer` replaces that with
 * a pull toward one angle — used to put charges at the upper right. Nearby
 * atoms that aren't bonded still crowd a slot, so dots and hydrogens avoid
 * landing on a neighbour in a tight zig-zag.
 */
function pickSlots(
  origin: Pt,
  occupied: number[],
  count: number,
  reach: number,
  obstacles: Pt[],
  avoid: number,
  prefer?: number,
): number[] {
  const occ = [...occupied]
  const picks: number[] = []
  for (let k = 0; k < count; k++) {
    let best = -Infinity
    let bestA = 0
    for (let s = 0; s < STEPS; s++) {
      const a = (s / STEPS) * TAU
      let sep = Math.PI
      for (const o of occ) sep = Math.min(sep, angDist(a, o))
      const bias =
        prefer === undefined
          ? s % (STEPS / 4) === 0
            ? 0.2
            : 0
          : 0.6 * (1 - angDist(a, prefer) / Math.PI)
      const p = { x: origin.x + Math.cos(a) * reach, y: origin.y + Math.sin(a) * reach }
      let crowd = 0
      for (const o of obstacles) {
        const d = Math.hypot(p.x - o.x, p.y - o.y)
        if (d < avoid) crowd += (avoid - d) / avoid
      }
      const score = sep + bias - 1.2 * crowd
      if (score > best + 1e-9) {
        best = score
        bestA = a
      }
    }
    picks.push(bestA)
    occ.push(bestA)
  }
  return picks
}

/** Arial advance widths (per 1000 em) for the letters element symbols use. */
const ARIAL: Record<string, number> = {
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, K: 667,
  L: 556, M: 833, N: 722, O: 778, P: 667, R: 722, S: 667, T: 611, U: 722, V: 667,
  W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, k: 500,
  l: 222, m: 833, n: 556, o: 556, r: 333, s: 500, t: 278, u: 556, y: 500,
}

function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) w += ARIAL[ch] ?? 600
  return (w / 1000) * size
}

/** Distance from a label's centre to the edge of its box along angle `a`. */
function boxReach(a: number, hw: number, hh: number): number {
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  return Math.min(c > 1e-6 ? hw / c : Infinity, s > 1e-6 ? hh / s : Infinity)
}

type DrawAtom = {
  symbol: string
  pos: Pt
  hw: number
  hh: number
  charge: number
}

type DrawBond = { a: number; b: number; order: number }

type Dot = { x: number; y: number; bonding: boolean }

type ChargeMark = { x: number; y: number; text: string; circled: boolean }

export type LewisResult = {
  svg: string
  width: number
  height: number
  atoms: LewisAtomReport[]
  warnings: string[]
}

/**
 * Build a Lewis structure SVG from a parsed molfile.
 *
 * Positions come from the editor's own 2D layout (y flipped to screen space),
 * scaled so the median heavy-atom bond is `bondLength`. Implicit hydrogens are
 * added at the most open angles; explicit terminal hydrogens are pulled out to
 * the same length so PubChem's short C–H bonds don't crowd the labels.
 *
 * Charges never claim a slot that dots could use: they're placed last, outside
 * the dots. That keeps the student (charges hidden) and key (charges shown)
 * versions dot-for-dot identical.
 */
export function buildLewis(
  mol: ParsedMol,
  style: LewisStyle,
  title?: string,
): LewisResult {
  const report = analyse(mol)
  const fs = style.fontSize
  const hh = fs * 0.36
  // Electron-dot notation (H:H) sits atoms closer than line bonds do; at full
  // bond length the shared pairs float in empty space between the labels.
  const L = style.bondStyle === 'dots' ? style.bondLength * 0.65 : style.bondLength
  const hReach = L * 0.9

  // --- scale the editor coordinates ---
  const heavy = mol.bonds.filter(
    (b) => !isHydrogen(mol.atoms[b.a]?.symbol) && !isHydrogen(mol.atoms[b.b]?.symbol),
  )
  const lengths = (heavy.length ? heavy : mol.bonds)
    .map((b) => {
      const p = mol.atoms[b.a]
      const q = mol.atoms[b.b]
      return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0
    })
    .filter((d) => d > 1e-6)
    .sort((x, y) => x - y)
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1
  const k = L / median

  const atoms: DrawAtom[] = mol.atoms.map((a) => ({
    symbol: a.symbol,
    pos: { x: a.x * k, y: -a.y * k },
    hw: textWidth(a.symbol, fs) / 2,
    hh,
    charge: a.charge,
  }))
  const bonds: DrawBond[] = mol.bonds.map((b) => ({ ...b }))

  const neighbours = atoms.map(() => [] as number[])
  for (const b of bonds) {
    neighbours[b.a].push(b.b)
    neighbours[b.b].push(b.a)
  }

  // Normalise explicit terminal H to the drawing's H length.
  atoms.forEach((a, i) => {
    if (!isHydrogen(a.symbol) || neighbours[i].length !== 1) return
    const host = atoms[neighbours[i][0]]
    if (isHydrogen(host.symbol)) return
    const ang = angleOf(host.pos, a.pos)
    a.pos = { x: host.pos.x + Math.cos(ang) * hReach, y: host.pos.y + Math.sin(ang) * hReach }
  })

  const bondAngles = (i: number): number[] =>
    neighbours[i].map((j) => angleOf(atoms[i].pos, atoms[j].pos))

  // --- implicit hydrogens ---
  const heavyCount = atoms.length
  for (let i = 0; i < heavyCount; i++) {
    const h = report[i].implicitH
    if (!h) continue
    const others = atoms.filter((_, j) => j !== i).map((a) => a.pos)
    const slots = pickSlots(atoms[i].pos, bondAngles(i), h, hReach, others, L * 0.75)
    for (const ang of slots) {
      const idx = atoms.length
      atoms.push({
        symbol: 'H',
        pos: {
          x: atoms[i].pos.x + Math.cos(ang) * hReach,
          y: atoms[i].pos.y + Math.sin(ang) * hReach,
        },
        hw: textWidth('H', fs) / 2,
        hh,
        charge: 0,
      })
      neighbours.push([i])
      neighbours[i].push(idx)
      bonds.push({ a: i, b: idx, order: 1 })
    }
  }

  // --- lone pairs and radicals ---
  const gap = fs * 0.3
  const pairSep = fs * 0.4
  const dots: Dot[] = []
  const dotAngles = atoms.map(() => [] as number[])

  const placeDot = (i: number, ang: number, n: 1 | 2) => {
    const a = atoms[i]
    const r = boxReach(ang, a.hw, a.hh) + gap
    const c = { x: a.pos.x + Math.cos(ang) * r, y: a.pos.y + Math.sin(ang) * r }
    if (n === 1) {
      dots.push({ ...c, bonding: false })
      return
    }
    const px = -Math.sin(ang) * (pairSep / 2)
    const py = Math.cos(ang) * (pairSep / 2)
    dots.push({ x: c.x + px, y: c.y + py, bonding: false })
    dots.push({ x: c.x - px, y: c.y - py, bonding: false })
  }

  for (let i = 0; i < heavyCount; i++) {
    const r = report[i]
    const slotsNeeded = r.lonePairs + r.unpaired
    if (!slotsNeeded) continue
    const others = atoms.filter((_, j) => j !== i).map((a) => a.pos)
    const slots = pickSlots(atoms[i].pos, bondAngles(i), slotsNeeded, fs * 0.9, others, L * 0.55)
    slots.forEach((ang, s) => placeDot(i, ang, s < r.lonePairs ? 2 : 1))
    dotAngles[i] = slots
  }

  // --- charges (placed last, outside the dots) ---
  const charges: ChargeMark[] = []
  if (style.showCharges) {
    atoms.forEach((a, i) => {
      if (!a.charge) return
      const others = atoms.filter((_, j) => j !== i).map((o) => o.pos)
      const occupied = [...bondAngles(i), ...dotAngles[i]]
      const [ang] = pickSlots(a.pos, occupied, 1, fs, others, L * 0.5, (7 * Math.PI) / 4)
      const hasDotThere = dotAngles[i].some((d) => angDist(d, ang) < Math.PI / 5)
      const r = boxReach(ang, a.hw, a.hh) + gap + (hasDotThere ? fs * 0.55 : fs * 0.3)
      const mag = Math.abs(a.charge)
      const sign = a.charge > 0 ? '+' : '−'
      charges.push({
        x: a.pos.x + Math.cos(ang) * r,
        y: a.pos.y + Math.sin(ang) * r,
        text: mag === 1 ? sign : `${mag}${sign}`,
        circled: style.circleCharges && mag === 1,
      })
    })
  }

  // --- bonds ---
  const lineGap = Math.max(3, fs * 0.22)
  const ends = fs * 0.15
  const lines: Array<[Pt, Pt]> = []
  for (const b of bonds) {
    const p = atoms[b.a]
    const q = atoms[b.b]
    const ang = angleOf(p.pos, q.pos)
    const back = ang + Math.PI
    const rp = boxReach(ang, p.hw, p.hh) + ends
    const rq = boxReach(back, q.hw, q.hh) + ends
    const s = { x: p.pos.x + Math.cos(ang) * rp, y: p.pos.y + Math.sin(ang) * rp }
    const e = { x: q.pos.x + Math.cos(back) * rq, y: q.pos.y + Math.sin(back) * rq }
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)

    if (style.bondStyle === 'dots') {
      // Shared pairs at the bond midpoint, one pair per bond order: H:H, O::C.
      const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }
      const along = pairSep * 1.05
      for (let m = 0; m < b.order; m++) {
        const off = (m - (b.order - 1) / 2) * along
        const cx = mid.x + Math.cos(ang) * off
        const cy = mid.y + Math.sin(ang) * off
        dots.push({ x: cx + nx * (pairSep / 2), y: cy + ny * (pairSep / 2), bonding: true })
        dots.push({ x: cx - nx * (pairSep / 2), y: cy - ny * (pairSep / 2), bonding: true })
      }
      continue
    }

    for (let m = 0; m < b.order; m++) {
      const off = (m - (b.order - 1) / 2) * lineGap
      lines.push([
        { x: s.x + nx * off, y: s.y + ny * off },
        { x: e.x + nx * off, y: e.y + ny * off },
      ])
    }
  }

  // --- bounds ---
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (x: number, y: number, r = 0) => {
    minX = Math.min(minX, x - r)
    minY = Math.min(minY, y - r)
    maxX = Math.max(maxX, x + r)
    maxY = Math.max(maxY, y + r)
  }
  for (const a of atoms) {
    grow(a.pos.x - a.hw, a.pos.y - fs * 0.5)
    grow(a.pos.x + a.hw, a.pos.y + fs * 0.5)
  }
  for (const d of dots) grow(d.x, d.y, style.dotRadius)
  for (const c of charges) grow(c.x, c.y, fs * 0.45)
  for (const [s, e] of lines) {
    grow(s.x, s.y, style.bondThickness)
    grow(e.x, e.y, style.bondThickness)
  }
  const pad = 10
  const x0 = minX - pad
  const y0 = minY - pad
  const w = maxX - minX + pad * 2
  const h = maxY - minY + pad * 2

  // --- serialise ---
  const ink = '#000000'
  const eColor = style.highlightElectrons ? ELECTRON_HIGHLIGHT : ink
  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x0)} ${r2(y0)} ${r2(w)} ${r2(h)}" width="${r2(w)}" height="${r2(h)}">`,
  )
  if (title) out.push(`<title>${escapeXml(title)}</title>`)
  if (style.background === 'white') {
    out.push(
      `<rect id="background" x="${r2(x0)}" y="${r2(y0)}" width="${r2(w)}" height="${r2(h)}" fill="#ffffff"/>`,
    )
  }
  // Named groups become Illustrator layers, so electrons can be recoloured or
  // hidden in one click.
  if (lines.length) {
    out.push(
      `<g id="bonds" stroke="${ink}" stroke-width="${r2(style.bondThickness)}" stroke-linecap="round" fill="none">`,
    )
    for (const [s, e] of lines) {
      out.push(`<line x1="${r2(s.x)}" y1="${r2(s.y)}" x2="${r2(e.x)}" y2="${r2(e.y)}"/>`)
    }
    out.push('</g>')
  }
  out.push(
    `<g id="atoms" font-family="${FONT_STACK}" font-size="${r2(fs)}" fill="${ink}" text-anchor="middle">`,
  )
  for (const a of atoms) {
    // Baseline at centre + ~half the cap height, so the glyph centres on the
    // atom without relying on dominant-baseline (Illustrator ignores it).
    out.push(`<text x="${r2(a.pos.x)}" y="${r2(a.pos.y + fs * 0.36)}">${escapeXml(a.symbol)}</text>`)
  }
  out.push('</g>')

  const bondingDots = dots.filter((d) => d.bonding)
  const loneDots = dots.filter((d) => !d.bonding)
  if (bondingDots.length) {
    out.push(`<g id="bonding-electrons" fill="${eColor}">`)
    for (const d of bondingDots) out.push(circle(d, style.dotRadius))
    out.push('</g>')
  }
  if (loneDots.length) {
    out.push(`<g id="lone-pairs" fill="${eColor}">`)
    for (const d of loneDots) out.push(circle(d, style.dotRadius))
    out.push('</g>')
  }

  if (charges.length) {
    const cs = fs * 0.7
    out.push(
      `<g id="formal-charges" font-family="${FONT_STACK}" font-size="${r2(cs)}" fill="${ink}" text-anchor="middle">`,
    )
    for (const c of charges) {
      if (c.circled) {
        out.push(
          `<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r2(cs * 0.55)}" fill="none" stroke="${ink}" stroke-width="${r2(Math.max(0.8, style.bondThickness * 0.6))}"/>`,
        )
      }
      out.push(`<text x="${r2(c.x)}" y="${r2(c.y + cs * 0.34)}">${c.text}</text>`)
    }
    out.push('</g>')
  }
  out.push('</svg>')

  // --- warnings worth surfacing on the preview ---
  const warnings: string[] = []
  const skipped = report.filter((r) => !r.mainGroup).map((r) => r.name)
  if (skipped.length) {
    warnings.push(`No dots on ${skipped.join(', ')}: transition metals have no single valence-electron count.`)
  }
  const broken = report.filter((r) => r.notes.some((n) => n.includes('check')))
  if (broken.length) {
    warnings.push(
      `Electron count doesn't work for ${broken.map((r) => r.name).join(', ')} — check charges and bond orders.`,
    )
  }

  return {
    svg: out.join('\n'),
    width: w,
    height: h,
    atoms: report.map(({ mainGroup: _mainGroup, ...rest }) => rest),
    warnings,
  }
}

function isHydrogen(symbol: string | undefined): boolean {
  return symbol === 'H' || symbol === 'D' || symbol === 'T'
}

function circle(p: Pt, r: number): string {
  return `<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="${r2(r)}"/>`
}

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Rasterise a Lewis SVG to PNG at `scale` × its px size. Browser only. */
export async function lewisSvgToPng(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create a canvas for PNG export.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
