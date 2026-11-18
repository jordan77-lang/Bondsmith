/**
 * Minimal MDL molfile reader (V2000 and V3000).
 *
 * The Lewis renderer needs exactly what a molfile carries and nothing more:
 * element, 2D position, formal charge, radical state, pinned valence, and bond
 * orders. Ketcher hands us a molfile via `getMolfile()`, so parsing the open,
 * documented format here keeps the Lewis path independent of Ketcher's internal
 * struct classes, which change between releases.
 */

export type MolAtom = {
  symbol: string
  x: number
  y: number
  charge: number
  /** MDL radical code: 0 none, 1 singlet, 2 doublet, 3 triplet. */
  radical: 0 | 1 | 2 | 3
  /** Valence the author pinned in the editor, if any. 0 means "zero valence". */
  valence?: number
}

export type MolBond = {
  /** Zero-based atom indices. */
  a: number
  b: number
  /** 1, 2, 3 = single/double/triple; 4 = aromatic; anything else is a query bond. */
  order: number
}

export type ParsedMol = {
  atoms: MolAtom[]
  bonds: MolBond[]
}

export function parseMolfile(text: string): ParsedMol {
  const lines = text.split(/\r?\n/)
  if (lines.some((l) => /^M {2}V30 BEGIN CTAB/.test(l))) return parseV3000(lines)
  return parseV2000(lines)
}

// --- V2000 -----------------------------------------------------------------

/** Atom-block charge codes. Code 4 is a doublet radical, not a charge. */
const V2000_CHARGE: Record<number, number> = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 }

function int(s: string | undefined): number {
  const n = Number.parseInt((s ?? '').trim(), 10)
  return Number.isFinite(n) ? n : 0
}

function num(s: string | undefined): number {
  const n = Number.parseFloat((s ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

function toRadical(n: number): MolAtom['radical'] {
  return n === 1 || n === 2 || n === 3 ? n : 0
}

function parseV2000(lines: string[]): ParsedMol {
  const counts = lines[3] ?? ''
  // Fixed-width columns: atom indices run together once they pass 99, so a
  // whitespace split is not safe for the counts or bond lines.
  const nAtoms = int(counts.slice(0, 3))
  const nBonds = int(counts.slice(3, 6))

  const atoms: MolAtom[] = []
  for (let i = 0; i < nAtoms; i++) {
    const l = lines[4 + i] ?? ''
    const code = int(l.slice(36, 39))
    const vvv = int(l.slice(48, 51))
    atoms.push({
      x: num(l.slice(0, 10)),
      y: num(l.slice(10, 20)),
      symbol: l.slice(31, 34).trim(),
      charge: V2000_CHARGE[code] ?? 0,
      radical: code === 4 ? 2 : 0,
      // 0 = default, 1-14 = explicit, 15 = zero valence.
      valence: vvv === 0 ? undefined : vvv === 15 ? 0 : vvv,
    })
  }

  const bonds: MolBond[] = []
  for (let i = 0; i < nBonds; i++) {
    const l = lines[4 + nAtoms + i] ?? ''
    bonds.push({
      a: int(l.slice(0, 3)) - 1,
      b: int(l.slice(3, 6)) - 1,
      order: int(l.slice(6, 9)),
    })
  }

  // Per the spec, the first M CHG or M RAD line supersedes every charge and
  // radical in the atom block.
  let reset = false
  for (const l of lines.slice(4 + nAtoms + nBonds)) {
    const m = /^M {2}(CHG|RAD)/.exec(l)
    if (!m) {
      if (l.startsWith('M  END')) break
      continue
    }
    if (!reset) {
      for (const a of atoms) {
        a.charge = 0
        a.radical = 0
      }
      reset = true
    }
    const parts = l.slice(6).trim().split(/\s+/).map(Number)
    const n = parts[0] ?? 0
    for (let k = 0; k < n; k++) {
      const atom = atoms[(parts[1 + k * 2] ?? 0) - 1]
      const value = parts[2 + k * 2] ?? 0
      if (!atom) continue
      if (m[1] === 'CHG') atom.charge = value
      else atom.radical = toRadical(value)
    }
  }

  return { atoms, bonds }
}

// --- V3000 -----------------------------------------------------------------

/** Split on whitespace, but keep quoted strings and parenthesised lists whole. */
function tokenize(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '(') depth++
    else if (!quoted && ch === ')') depth--
    if (/\s/.test(ch) && !quoted && depth === 0) {
      if (cur) out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur) out.push(cur)
  return out
}

function parseV3000(lines: string[]): ParsedMol {
  // Gather V30 lines, joining continuations (a trailing '-').
  const v30: string[] = []
  let pending = ''
  for (const raw of lines) {
    if (!raw.startsWith('M  V30 ')) continue
    const body = raw.slice(7)
    if (body.endsWith('-')) {
      pending += body.slice(0, -1)
      continue
    }
    v30.push(pending + body)
    pending = ''
  }

  const atoms: MolAtom[] = []
  const bonds: MolBond[] = []
  const indexById = new Map<string, number>()
  let section: 'atom' | 'bond' | null = null

  for (const line of v30) {
    const t = line.trim()
    if (t === 'BEGIN ATOM') section = 'atom'
    else if (t === 'BEGIN BOND') section = 'bond'
    else if (t.startsWith('END ')) section = null
    else if (section === 'atom') {
      const [id, symbol, x, y, , , ...props] = tokenize(t)
      const kv = keyValues(props)
      const val = kv.VAL === undefined ? undefined : int(kv.VAL)
      indexById.set(id, atoms.length)
      atoms.push({
        symbol: symbol ?? '',
        x: num(x),
        y: num(y),
        charge: int(kv.CHG),
        radical: toRadical(int(kv.RAD)),
        // VAL=-1 is the V3000 spelling of "zero valence".
        valence: val === undefined || val === 0 ? undefined : val === -1 ? 0 : val,
      })
    } else if (section === 'bond') {
      const [, type, a1, a2] = tokenize(t)
      bonds.push({
        a: indexById.get(a1) ?? -1,
        b: indexById.get(a2) ?? -1,
        order: int(type),
      })
    }
  }

  return { atoms, bonds }
}

function keyValues(tokens: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const tok of tokens) {
    const eq = tok.indexOf('=')
    if (eq > 0) out[tok.slice(0, eq).toUpperCase()] = tok.slice(eq + 1)
  }
  return out
}

/** True when the structure still has aromatic (type 4) bonds to kekulize. */
export function hasAromaticBonds(mol: ParsedMol): boolean {
  return mol.bonds.some((b) => b.order === 4)
}
