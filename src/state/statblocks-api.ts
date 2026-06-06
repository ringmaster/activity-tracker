import type { App } from "obsidian";
import type { CombatAction } from "../types/encounter";
import { parseStatblockAction } from "./statblock-action-parser";

/** Check if Fantasy Statblocks plugin is available. */
export function isStatblocksAvailable(app: App): boolean {
  return getBestiaryAccess(app) !== null;
}

export interface CreatureData {
  name: string;
  hp?: number;
  ac?: number;
  dexMod?: number;
  /** Parsed action shapes derived from the bestiary's action descriptions.
   *  Whatever fields the parser could extract (toHit, dmg, range, save) are
   *  populated; the original text always lives in `desc` so the DM sees the
   *  prose under the bar and can compose chits manually for whatever the
   *  parser missed. */
  actions?: CombatAction[];
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
}

/** A unified "how to read the bestiary" handle. Different Fantasy
 *  Statblocks builds expose the bestiary in different places; this resolver
 *  tries the known paths and returns the first one that yields a non-empty
 *  iterable. The two operations the rest of this file needs are: list all
 *  names, and fetch a single creature by name. */
interface BestiaryAccess {
  /** Path label for diagnostics ("window.FantasyStatblocks", "plugin.bestiary", ...). */
  path: string;
  getNames(): string[];
  getCreature(name: string): any | null;
}

let cachedAccess: BestiaryAccess | null = null;
let lastLookupKey: string | null = null;

function getBestiaryAccess(app: App): BestiaryAccess | null {
  // Recompute when the global identity changes (plugin load/unload during a
  // session) but otherwise cache so we don't re-walk every call.
  const key = (globalThis as any).FantasyStatblocks
    ? "global"
    : (app as any).plugins?.plugins?.["obsidian-5e-statblocks"]
      ? "plugin"
      : "none";
  if (cachedAccess && key === lastLookupKey) return cachedAccess;
  cachedAccess = resolveAccess(app);
  lastLookupKey = key;
  if (cachedAccess) {
    console.log(`[activity-tracker] bestiary access via: ${cachedAccess.path}`);
  } else {
    console.log("[activity-tracker] no bestiary access found");
  }
  return cachedAccess;
}

function resolveAccess(app: App): BestiaryAccess | null {
  // 1. Modern public API: Fantasy Statblocks exposes itself as a global on
  //    plugin load. Methods used here are `getBestiaryNames()` (or
  //    `getBestiary().keys()`) and `getCreatureFromBestiary(name)`.
  const global = (globalThis as any).FantasyStatblocks;
  if (global) {
    // Prefer the explicit methods if present.
    if (typeof global.getBestiaryNames === "function") {
      return {
        path: "window.FantasyStatblocks.getBestiaryNames",
        getNames: () => {
          try { return global.getBestiaryNames(); } catch { return []; }
        },
        getCreature: (name) => {
          try {
            if (typeof global.getCreatureFromBestiary === "function") {
              return global.getCreatureFromBestiary(name);
            }
            if (typeof global.getCreature === "function") {
              return global.getCreature(name);
            }
          } catch { /* ignore */ }
          return null;
        },
      };
    }
    if (typeof global.getBestiary === "function") {
      return {
        path: "window.FantasyStatblocks.getBestiary",
        getNames: () => {
          try {
            const bestiary = global.getBestiary();
            return bestiary instanceof Map ? [...bestiary.keys()] : Object.keys(bestiary ?? {});
          } catch { return []; }
        },
        getCreature: (name) => {
          try {
            const bestiary = global.getBestiary();
            if (bestiary instanceof Map) return bestiary.get(name) ?? caseInsensitiveGet(bestiary, name);
            return bestiary?.[name] ?? caseInsensitiveGet(bestiary, name);
          } catch { return null; }
        },
      };
    }
  }

  // 2. Plugin-instance fallback. Older builds (and some sideloads) keep the
  //    bestiary on the plugin object directly.
  const plugin = (app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
  if (plugin) {
    const bestiary =
      plugin.bestiary ??
      plugin.data?.bestiary ??
      plugin.settings?.bestiary ??
      plugin.api?.bestiary;
    if (bestiary) {
      const label = plugin.bestiary ? "plugin.bestiary"
        : plugin.data?.bestiary ? "plugin.data.bestiary"
        : plugin.settings?.bestiary ? "plugin.settings.bestiary"
        : "plugin.api.bestiary";
      return {
        path: label,
        getNames: () => bestiary instanceof Map ? [...bestiary.keys()] : Object.keys(bestiary),
        getCreature: (name) => {
          if (bestiary instanceof Map) return bestiary.get(name) ?? caseInsensitiveGet(bestiary, name);
          return bestiary[name] ?? caseInsensitiveGet(bestiary, name);
        },
      };
    }
  }

  return null;
}

function caseInsensitiveGet(bestiary: any, name: string): any | null {
  if (!bestiary) return null;
  const lower = name.toLowerCase();
  if (bestiary instanceof Map) {
    for (const [key, val] of bestiary) {
      if (key.toLowerCase() === lower) return val;
    }
    return null;
  }
  for (const key of Object.keys(bestiary)) {
    if (key.toLowerCase() === lower) return bestiary[key];
  }
  return null;
}

/** Look up a creature by name from the Fantasy Statblocks bestiary. */
export function getCreature(app: App, name: string): CreatureData | null {
  const access = getBestiaryAccess(app);
  if (!access) return null;
  const creature = access.getCreature(name);
  if (!creature) return null;

  const dexMod =
    typeof creature.dex === "number"
      ? Math.floor((creature.dex - 10) / 2)
      : undefined;

  return {
    name: creature.name ?? name,
    hp: creature.hp ?? creature.hit_points,
    ac: creature.ac ?? creature.armor_class,
    dexMod,
    actions: parseRawActions(creature.actions),
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
}

/** Resolve the attack bonus for a named attack from a creature's statblock,
 *  matching the action name against the bestiary's parsed attacks. Lets a
 *  library-string action like "Glaive" on an NPC borrow the to-hit the
 *  bestiary already provides, instead of forcing an authored `toHit:` on the
 *  combatant. Returns null when the statblock is unavailable or no attack with
 *  a parsed to-hit matches. */
export function getStatblockActionToHit(
  app: App,
  statblock: string | undefined,
  actionName: string,
): number | null {
  if (!statblock || !actionName) return null;
  const creature = getCreature(app, statblock);
  if (!creature?.actions) return null;
  const want = actionName.trim().toLowerCase();
  // Exact (normalized) match first; then a contains match in either direction
  // so "Glaive" pairs with a "Glaive (Reach)" entry and vice versa.
  const exact = creature.actions.find(
    (a) => a.toHit != null && a.name.trim().toLowerCase() === want,
  );
  if (exact) return exact.toHit ?? null;
  const loose = creature.actions.find((a) => {
    if (a.toHit == null) return false;
    const have = a.name.trim().toLowerCase();
    return have.includes(want) || want.includes(have);
  });
  return loose?.toHit ?? null;
}

/** Run the per-action parser over the bestiary's raw actions array. The raw
 *  shape Fantasy Statblocks emits is `{ name, desc }` (or `description`);
 *  the parser handles either. Returns undefined for missing/empty input so
 *  the caller can distinguish "no actions" from "empty array." */
function parseRawActions(raw: any): CombatAction[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: CombatAction[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const aName = entry.name ?? "";
    const aDesc = entry.desc ?? entry.description ?? "";
    if (!aName) continue;
    out.push(parseStatblockAction(aName, aDesc));
  }
  return out.length > 0 ? out : undefined;
}

/** Get all creature names for autocomplete. */
export function getCreatureNames(app: App): string[] {
  const access = getBestiaryAccess(app);
  if (!access) return [];
  return access.getNames();
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string")
    return value.split(",").map((s: string) => s.trim());
  return [];
}

/** Open a creature's statblock in the Fantasy Statblocks creature pane
 *  (right sidebar by default). The plugin exposes
 *  `openCreatureView()` -> Promise<view> on its instance; the returned
 *  view has a `.render(creature)` method that takes the parsed creature
 *  object from the bestiary. Returns true if anything fired. */
export function openStatblockView(app: App, name: string): boolean {
  const plugin = (app as any).plugins?.plugins?.["obsidian-5e-statblocks"];

  // The view's .render() expects the raw creature object that lives in
  // the bestiary, not our CreatureData projection. Pull it via the same
  // BestiaryAccess we resolved for autocomplete so we hit whichever path
  // is live (global vs plugin instance).
  const access = getBestiaryAccess(app);
  const rawCreature = access?.getCreature(name);
  if (!rawCreature) {
    console.warn(`[activity-tracker] bestiary has no entry for ${name}`);
    return false;
  }

  if (plugin && typeof plugin.openCreatureView === "function") {
    try {
      const result = plugin.openCreatureView();
      // FS's openCreatureView is async (returns a promise) but the view it
      // resolves to is the same Sn-typed leaf view; .render(creature)
      // displays the creature. Handle both promise and direct returns.
      Promise.resolve(result).then((view: any) => {
        if (view && typeof view.render === "function") {
          view.render(rawCreature);
        } else {
          console.warn(
            "[activity-tracker] openCreatureView returned a view without .render",
            view,
          );
        }
      }).catch((e: any) => {
        console.warn("[activity-tracker] openCreatureView.render failed:", e);
      });
      console.log(`[activity-tracker] opened ${name} via plugin.openCreatureView`);
      return true;
    } catch (e) {
      console.warn("[activity-tracker] openCreatureView call failed:", e);
    }
  }

  console.warn(`[activity-tracker] Fantasy Statblocks doesn't expose openCreatureView; can't open ${name}`);
  return false;
}
