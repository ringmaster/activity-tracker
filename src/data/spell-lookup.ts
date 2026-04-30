import srdSpells from "./srd-spells.json";

export interface SrdSpell {
  name: string;
  level: number;
  desc: string;
  concentration?: boolean;
  range?: string;
  damageType?: string;
  dice?: string;
  saveStat?: string;
  saveOnSuccess?: string;
}

const spells: SrdSpell[] = srdSpells as SrdSpell[];

/** Search SRD spells by name prefix (minimum 3 characters). Returns up to 10 matches. */
export function searchSpells(query: string): SrdSpell[] {
  if (query.length < 3) return [];
  const lower = query.toLowerCase();
  return spells
    .filter((s) => s.name.toLowerCase().includes(lower))
    .slice(0, 10);
}

/** Find an exact spell by name (case-insensitive). */
export function findSpell(name: string): SrdSpell | undefined {
  const lower = name.toLowerCase();
  return spells.find((s) => s.name.toLowerCase() === lower);
}
