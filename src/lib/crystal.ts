/**
 * Crystal lattice rendering.
 *
 * 3Dmol's CIF parser does more than its docs suggest: given only a space-group
 * symbol (no explicit `_symmetry_equiv_pos_as_xyz` list) it still derives the
 * full operation set — 48 for Pm-3m — and `duplicateAssemblyAtoms` expands the
 * asymmetric unit into the complete cell. Verified against the published
 * Prussian blue structure: 14 atoms in, 672 out.
 */

export type CrystalStyle = {
  mode: 'ball-stick' | 'stick' | 'spacefill' | 'wireframe'
  /** Lattice repeats along each cell axis. */
  na: number
  nb: number
  nc: number
  /** Draw the unit-cell outline. */
  showCell: boolean
  /** Cell outline color. */
  cellColor: string
  /** Hide lattice water / solvent so the framework reads clearly. */
  hideSolvent: boolean
  /** Hide hydrogens, which crowd a lattice view badly. */
  hideHydrogen: boolean
  sphereScale: number
  stickRadius: number
  colorscheme: 'Jmol' | 'greenCarbon' | 'cyanCarbon' | 'grayCarbon'
  background: 'transparent' | 'white'
  orthographic: boolean
  spin: boolean
  exportScale: number
}

export const DEFAULT_CRYSTAL_STYLE: CrystalStyle = {
  mode: 'ball-stick',
  na: 2,
  nb: 2,
  nc: 2,
  showCell: true,
  cellColor: '#666666',
  hideSolvent: true,
  hideHydrogen: true,
  sphereScale: 0.28,
  stickRadius: 0.12,
  colorscheme: 'Jmol',
  background: 'transparent',
  orthographic: true,
  spin: false,
  exportScale: 3,
}

export const CRYSTAL_PRESETS = {
  framework: {
    label: 'Framework',
    hint: 'Ball-and-stick, solvent hidden. Best for coordination frameworks like Prussian blue.',
    style: DEFAULT_CRYSTAL_STYLE,
  },
  packing: {
    label: 'Close packing',
    hint: 'Spacefill at true ionic size — shows how the ions actually pack.',
    style: {
      ...DEFAULT_CRYSTAL_STYLE,
      mode: 'spacefill' as const,
      sphereScale: 0.62,
    },
  },
  netOnly: {
    label: 'Net only',
    hint: 'Sticks alone. Clearest for large lattices where spheres crowd.',
    style: {
      ...DEFAULT_CRYSTAL_STYLE,
      mode: 'stick' as const,
      stickRadius: 0.14,
    },
  },
  single: {
    label: 'Single cell',
    hint: 'One unit cell with its outline — the standard textbook figure.',
    style: { ...DEFAULT_CRYSTAL_STYLE, na: 1, nb: 1, nc: 1, sphereScale: 0.32 },
  },
} as const

export type CrystalPresetKey = keyof typeof CRYSTAL_PRESETS

/** A bundled structure, served from public/structures. */
export type StructureEntry = {
  file: string
  label: string
  formula: string
  spaceGroup: string
  /** One-line teaching note: why this structure is worth showing. */
  note: string
}

/**
 * Starter library. Every entry was fetched from the Crystallography Open
 * Database (public domain) and its formula/space group verified against the file
 * — several plausible-looking COD ids turned out to be different compounds
 * entirely, so do not add entries without checking the CIF contents.
 */
export const STRUCTURE_LIBRARY: StructureEntry[] = [
  {
    file: 'prussian-blue.cif',
    label: 'Prussian blue',
    formula: 'Fe₄[Fe(CN)₆]₃·xH₂O',
    spaceGroup: 'Pm-3m',
    note: 'Cubic Fe–C≡N–Fe framework with open channels. Buser et al. 1977.',
  },
  {
    file: 'halite-nacl.cif',
    label: 'Halite (NaCl)',
    formula: 'NaCl',
    spaceGroup: 'Fm-3m',
    note: 'The rock-salt structure: two interpenetrating fcc lattices.',
  },
  {
    file: 'periclase-mgo.cif',
    label: 'Periclase (MgO)',
    formula: 'MgO',
    spaceGroup: 'Fm-3m',
    note: 'Rock-salt type with 2+/2− ions — compare ion sizes against NaCl.',
  },
  {
    file: 'fluorite.cif',
    label: 'Fluorite (CaF₂)',
    formula: 'CaF₂',
    spaceGroup: 'Fm-3m',
    note: '8:4 coordination — the classic AB₂ structure type.',
  },
  {
    file: 'diamond.cif',
    label: 'Diamond',
    formula: 'C',
    spaceGroup: 'Fd-3m',
    note: 'Tetrahedral carbon throughout. Contrast with graphite.',
  },
  {
    file: 'graphite.cif',
    label: 'Graphite',
    formula: 'C',
    spaceGroup: 'P6₃mc',
    note: 'Layered sp² sheets — same element as diamond, different everything.',
  },
  {
    file: 'quartz.cif',
    label: 'Quartz',
    formula: 'SiO₂',
    spaceGroup: 'P3₂21',
    note: 'Chiral framework of corner-sharing SiO₄ tetrahedra.',
  },
  {
    file: 'calcite.cif',
    label: 'Calcite',
    formula: 'CaCO₃',
    spaceGroup: 'R-3c',
    note: 'Rhombohedral carbonate — shows a non-cubic cell.',
  },
  {
    file: 'pyrite.cif',
    label: 'Pyrite',
    formula: 'FeS₂',
    spaceGroup: 'Pa-3',
    note: 'NaCl-like but with S–S dumbbells replacing single anions.',
  },
  {
    file: 'rutile.cif',
    label: 'Rutile (TiO₂)',
    formula: 'TiO₂',
    spaceGroup: 'P4₂/mnm',
    note: 'Tetragonal, edge-sharing TiO₆ octahedra in chains.',
  },
  {
    file: 'copper.cif',
    label: 'Copper',
    formula: 'Cu',
    spaceGroup: 'Fm-3m',
    note: 'Face-centred cubic metal — the simplest close packing.',
  },
]

/**
 * Parser options that produce a full unit cell.
 *
 * `doAssembly` reads the symmetry operations, `duplicateAssemblyAtoms` actually
 * applies them, and `normalizeAssembly` wraps the generated atoms back inside
 * the cell so the result is one clean cell rather than a cloud straddling the
 * boundary.
 */
/**
 * Rewrite modern CIF symmetry tags to the legacy spelling 3Dmol understands.
 *
 * The CIF dictionary has two names for the symmetry-operation loop:
 *
 *   _symmetry_equiv_pos_as_xyz         deprecated, but the only one 3Dmol reads
 *   _space_group_symop_operation_xyz   current, and what modern files write
 *
 * 3Dmol looks only for the first. A CIF written to the current dictionary — most
 * of what COD, ICSD and CCDC emit today — therefore parses with zero symmetry
 * operations, and the "unit cell" silently collapses to the asymmetric unit:
 * diamond renders as one carbon atom instead of eight. Aliasing the tag is
 * enough, since the loop bodies are identical in both spellings.
 *
 * Only the operation tag is aliased. Renaming the companion `_space_group_symop_id`
 * as well was tried and breaks the parser outright (it throws on an unexpected
 * loop column) — 3Dmol tolerates the id column under its original name, so leave
 * it alone.
 */
export function normalizeCifSymmetryTags(cif: string): string {
  return cif.replace(
    /_space_group_symop_operation_xyz/gi,
    '_symmetry_equiv_pos_as_xyz',
  )
}

export const CIF_PARSE_OPTIONS = {
  doAssembly: true,
  duplicateAssemblyAtoms: true,
  normalizeAssembly: true,
} as const

/**
 * Element symbols as 3Dmol reports them, normalized.
 *
 * The CIF parser preserves oxidation-state suffixes from `_atom_site_type_symbol`
 * ("N-", "O-", "Fe+3"), and those never match 3Dmol's colour and radius tables —
 * which is why nitrogen renders grey instead of blue in an untouched Prussian
 * blue render. Strip everything after the element letters.
 */
export function normalizeElement(elem: string | undefined): string {
  if (!elem) return ''
  const m = /^([A-Za-z]{1,2})/.exec(elem.trim())
  if (!m) return ''
  const raw = m[1]
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

/** Elements treated as solvent/guest species rather than framework. */
const SOLVENT_ELEMENTS = new Set(['O'])

/**
 * Decide whether an atom is lattice solvent.
 *
 * Deliberately narrow: only oxygen, and only when the structure also contains a
 * framework that oxygen isn't part of. In Prussian blue the O atoms are water;
 * in quartz, rutile and the carbonates oxygen IS the structure, so a blanket
 * "hide oxygen" rule would delete the compound. The caller passes the element
 * set so we can tell those cases apart.
 */
export function isSolventAtom(elem: string, allElements: Set<string>): boolean {
  if (!SOLVENT_ELEMENTS.has(elem)) return false
  // Oxygen is structural unless the framework is clearly built from something
  // else — a cyanide framework (C and N both present) is the case we care about.
  const cyanideFramework = allElements.has('C') && allElements.has('N')
  return cyanideFramework
}

/** Total atom count for a lattice, for warning before a slow render. */
export function estimateAtoms(cellAtoms: number, style: CrystalStyle): number {
  return cellAtoms * Math.max(1, style.na) * Math.max(1, style.nb) * Math.max(1, style.nc)
}

/** Above this, rendering gets slow enough to warn the user first. */
export const ATOM_WARN_THRESHOLD = 20000
