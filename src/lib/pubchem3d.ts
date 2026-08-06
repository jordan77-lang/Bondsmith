const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'

export type Structure3D = {
  /** SDF text with real 3D coordinates. */
  sdf: string
  /** What we resolved it from, for labels and filenames. */
  label: string
}

/**
 * Fetch a precomputed 3D conformer from PubChem.
 *
 * PubChem computes conformers for most small organic molecules but not for
 * everything: ionic solids, polymers and mixtures have no single meaningful
 * geometry, and those return 404 even though the compound record exists. The
 * two 404 flavors are distinguishable by message ("No records found for the
 * given CID(s)" = exists but no 3D; "No CID found" = unknown name), which is
 * worth telling apart so the error actually explains the problem.
 */
export async function fetch3DStructure(query: string): Promise<Structure3D> {
  const trimmed = query.trim()
  if (!trimmed) throw new Error('Enter a compound name to view in 3D.')

  const explicitCid = /^cid:\s*(\d+)$/i.exec(trimmed)
  const bareCid = /^\d+$/.test(trimmed) ? trimmed : null
  const cid = explicitCid?.[1] ?? bareCid

  const url = cid
    ? `${PUG}/compound/cid/${cid}/SDF?record_type=3d`
    : `${PUG}/compound/name/${encodeURIComponent(trimmed)}/SDF?record_type=3d`

  const res = await fetch(url)

  if (!res.ok) {
    if (res.status === 404) {
      const body = await res.text().catch(() => '')
      // "No CID found" means the name didn't resolve at all.
      if (/No CID found/i.test(body)) {
        throw new Error(`PubChem has no compound named “${trimmed}”.`)
      }
      // Otherwise the compound exists but has no computed conformer.
      throw new Error(
        `“${trimmed}” has no 3D conformer in PubChem — this is normal for ` +
          `salts, ions and polymers. Try a neutral molecule, or draw it in 2D.`,
      )
    }
    throw new Error(`PubChem request failed (${res.status}).`)
  }

  const sdf = await res.text()
  if (!sdf.trim()) throw new Error('PubChem returned an empty structure.')
  if (!declares3D(sdf)) {
    throw new Error(
      `PubChem returned a 2D record for “${trimmed}” — no 3D conformer available.`,
    )
  }

  return { sdf, label: trimmed }
}

/**
 * Check that an SDF declares 3D geometry.
 *
 * Read from the molfile header, NOT from the coordinates. Inspecting z-values
 * cannot work: benzene's genuine 3D conformer is planar to within 0.0001 Å, so
 * "all z ≈ 0" is indistinguishable from a 2D record for any flat molecule, and
 * rejecting benzene from a chemistry tool is not acceptable.
 *
 * The MDL molfile spec puts a dimensionality field on line 2 (the program/
 * timestamp line), where the characters at columns 20-22 are "2D" or "3D".
 * PubChem writes e.g. "  -OEChem-08062616183D". We match the suffix rather than
 * a fixed column since the program name's length is not guaranteed.
 */
export function declares3D(sdf: string): boolean {
  const line = sdf.split(/\r?\n/)[1]
  if (!line) return false
  return /3D\s*$/.test(line)
}
