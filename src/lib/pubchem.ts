export type PubChemHit = {
  cid: number
  name: string
  formula?: string
}

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'
const AUTOCOMPLETE =
  'https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound'

/** Suggest compound names from PubChem's autocomplete API. */
export async function suggestCompounds(
  query: string,
  limit = 8,
): Promise<string[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const url = `${AUTOCOMPLETE}/${encodeURIComponent(trimmed)}/json?limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = (await res.json()) as {
    status?: { code?: number }
    dictionary_terms?: { compound?: string[] }
  }
  return data.dictionary_terms?.compound ?? []
}

/**
 * Fetch a 2D SDF for a compound name, or for a bare PubChem CID.
 *
 * CIDs are worth supporting because a common name can map to several records
 * (tautomers, salts, stereoisomers) and PubChem picks one for you; a CID says
 * exactly which structure you meant. `cid:2519` forces the CID path for the
 * rare compound whose name is all digits.
 */
export async function fetchStructureByName(name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Enter a compound name to search.')

  const explicitCid = /^cid:\s*(\d+)$/i.exec(trimmed)
  const bareCid = /^\d+$/.test(trimmed) ? trimmed : null
  const cid = explicitCid?.[1] ?? bareCid
  if (cid) return fetchStructureByCid(Number(cid))

  const url = `${PUG}/compound/name/${encodeURIComponent(trimmed)}/SDF?record_type=2d`
  const res = await fetch(url)

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No PubChem structure found for “${trimmed}”.`)
    }
    throw new Error(`PubChem request failed (${res.status}).`)
  }

  const sdf = await res.text()
  if (!sdf.trim()) throw new Error('PubChem returned an empty structure.')
  return sdf
}

/** Fetch 2D SDF by PubChem CID. */
export async function fetchStructureByCid(cid: number): Promise<string> {
  const url = `${PUG}/compound/cid/${cid}/SDF?record_type=2d`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 404) throw new Error(`No PubChem record for CID ${cid}.`)
    throw new Error(`PubChem request failed (${res.status}).`)
  }
  const sdf = await res.text()
  if (!sdf.trim()) throw new Error(`PubChem returned an empty structure for CID ${cid}.`)
  return sdf
}

/** Resolve a name to a short display label for filenames. */
export function slugifyName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'molecule'
  )
}
