import type { App } from "obsidian";

/** Check if Fantasy Statblocks plugin is available. */
export function isStatblocksAvailable(app: App): boolean {
  return !!(app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
}

/** Get the Fantasy Statblocks plugin API, if available. */
function getApi(app: App): any | null {
  const plugin = (app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
  return plugin ?? null;
}

export interface CreatureData {
  name: string;
  hp?: number;
  ac?: number;
  dexMod?: number;
  actions?: { name: string; desc: string }[];
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
}

/** Look up a creature by name from the Fantasy Statblocks bestiary. */
export function getCreature(app: App, name: string): CreatureData | null {
  const api = getApi(app);
  if (!api) return null;

  try {
    // Fantasy Statblocks stores creatures in a bestiary map
    const bestiary =
      api.bestiary ?? api.data?.bestiary ?? api.settings?.bestiary;
    if (!bestiary) return null;

    // Try exact match first, then case-insensitive
    let creature = bestiary instanceof Map ? bestiary.get(name) : bestiary[name];
    if (!creature) {
      const lower = name.toLowerCase();
      if (bestiary instanceof Map) {
        for (const [key, val] of bestiary) {
          if (key.toLowerCase() === lower) {
            creature = val;
            break;
          }
        }
      } else {
        for (const key of Object.keys(bestiary)) {
          if (key.toLowerCase() === lower) {
            creature = bestiary[key];
            break;
          }
        }
      }
    }

    if (!creature) return null;

    const dexScore = creature.stats?.find(
      (s: any) => s === creature.stats?.[1],
    );
    const dexMod =
      typeof creature.dex === "number"
        ? Math.floor((creature.dex - 10) / 2)
        : undefined;

    return {
      name: creature.name ?? name,
      hp: creature.hp ?? creature.hit_points,
      ac: creature.ac ?? creature.armor_class,
      dexMod,
      actions: creature.actions,
      resistances: creature.damage_resistances
        ? parseList(creature.damage_resistances)
        : undefined,
      immunities: creature.damage_immunities
        ? parseList(creature.damage_immunities)
        : undefined,
      vulnerabilities: creature.damage_vulnerabilities
        ? parseList(creature.damage_vulnerabilities)
        : undefined,
    };
  } catch {
    return null;
  }
}

/** Get all creature names for autocomplete. */
export function getCreatureNames(app: App): string[] {
  const api = getApi(app);
  if (!api) return [];

  try {
    const bestiary =
      api.bestiary ?? api.data?.bestiary ?? api.settings?.bestiary;
    if (!bestiary) return [];
    if (bestiary instanceof Map) return [...bestiary.keys()];
    return Object.keys(bestiary);
  } catch {
    return [];
  }
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string")
    return value.split(",").map((s: string) => s.trim());
  return [];
}
