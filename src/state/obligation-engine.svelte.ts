import type { EncounterState } from "./encounter-state.svelte";
import type { ActiveObligation } from "../types/obligations";
import type { SpellObligation } from "../types/encounter";
import { nowTimestamp } from "../utils/time";

export interface ObligationBannerData {
  obligation: ActiveObligation;
  spellName: string;
  targetId: string;
  targetName: string;
  trigger: string;
  kind: string;
  stat?: string | string[];
  dc?: number;
  onFail?: string;
  onSuccess?: string;
  dmg?: { n: number; type: string }[];
  isConcentration: boolean;
}

/**
 * Create an active obligation from a spell cast.
 */
export function createObligation(
  state: EncounterState,
  spellKey: string,
  targets: string[],
  castLogLine: number,
): void {
  const spell = state.spells[spellKey];
  if (!spell?.obligation) return;

  const id = `ob-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const ob: ActiveObligation = {
    id,
    spell: spellKey,
    cast_line: castLogLine,
    tgt: targets,
    last_triggered: null,
  };

  if (spell.duration_rounds) {
    ob.expires = { round: state.round + spell.duration_rounds };
  }

  state.activeObligations.push(ob);
}

/**
 * Check for obligations that should fire at a given trigger moment.
 * Returns banner data for each obligation that matches.
 */
export function checkObligations(
  state: EncounterState,
  trigger: "start_of_turn" | "end_of_turn" | "start_of_round" | "init_20" | "when_damaged",
  who?: string,
): ObligationBannerData[] {
  const banners: ObligationBannerData[] = [];

  for (const ob of state.activeObligations) {
    const spell = state.spells[ob.spell];
    if (!spell?.obligation) continue;
    if (spell.obligation.trigger !== trigger) continue;

    // Check if this obligation applies to the current combatant
    const relevantTargets = who ? ob.tgt.filter((t) => t === who) : ob.tgt;
    if (relevantTargets.length === 0) continue;

    // Check expiry
    if (ob.expires && state.round > ob.expires.round) continue;

    for (const targetId of relevantTargets) {
      const combatant = state.getCombatant(targetId);
      if (!combatant || combatant.conditions.includes("dead")) continue;

      banners.push({
        obligation: ob,
        spellName: spell.name,
        targetId,
        targetName: combatant.name,
        trigger: spell.obligation.trigger,
        kind: spell.obligation.kind,
        stat: spell.obligation.stat,
        dc: spell.obligation.dc,
        onFail: spell.obligation.on_fail,
        onSuccess: spell.obligation.on_success,
        dmg: spell.obligation.dmg,
        isConcentration: false,
      });
    }
  }

  // Also check concentration save obligations (special: no spell.obligation, tagged by id prefix)
  const concObs = state.activeObligations.filter(
    (ob) => ob.id.startsWith("conc-") && trigger === "when_damaged",
  );
  for (const ob of concObs) {
    for (const targetId of ob.tgt) {
      const combatant = state.getCombatant(targetId);
      if (!combatant) continue;

      banners.push({
        obligation: ob,
        spellName: ob.spell,
        targetId,
        targetName: combatant.name,
        trigger: "when_damaged",
        kind: "save",
        stat: "con",
        dc: 10, // Will be overridden by actual damage-based DC in the banner
        onFail: "Concentration lost",
        onSuccess: "Concentration maintained",
        isConcentration: true,
      });
    }
  }

  return banners;
}

/**
 * Resolve an obligation. Returns whether the obligation should be removed.
 */
export function resolveObligation(
  state: EncounterState,
  obligationId: string,
  result: "pass" | "fail",
  disposition: "dismiss" | "recur",
): void {
  const obIdx = state.activeObligations.findIndex((o) => o.id === obligationId);
  if (obIdx < 0) return;

  const ob = state.activeObligations[obIdx];
  const isConc = ob.id.startsWith("conc-");

  if (isConc) {
    // Concentration save resolution
    if (result === "fail") {
      // Drop concentration
      for (const targetId of ob.tgt) {
        const { dropConcentration } = require("./action-logger.svelte");
        dropConcentration(state, targetId);
      }
    }
    // Always remove concentration save obligations after resolution
    state.activeObligations.splice(obIdx, 1);
  } else {
    // Regular obligation
    const spell = state.spells[ob.spell];
    const spellOb = spell?.obligation;

    // Determine smart default for disposition if not explicit
    let effectiveDisposition = disposition;
    if (spellOb) {
      if (result === "pass" && spellOb.on_success === "ends") {
        effectiveDisposition = "dismiss";
      } else if (result === "pass" && spellOb.on_success === "continues") {
        effectiveDisposition = "recur";
      }
    }

    if (effectiveDisposition === "dismiss") {
      state.activeObligations.splice(obIdx, 1);
      state.log.push({
        effect_ends: {
          what: ob.spell,
          on: ob.tgt[0] ?? "unknown",
          reason: result === "pass" ? "save_succeeded" : "dismissed",
        },
      });
    } else {
      ob.last_triggered = state.log.length;
    }
  }

  state.flush();
}

/** Clean up expired or invalid obligations. */
export function cleanupObligations(state: EncounterState): void {
  state.activeObligations = state.activeObligations.filter((ob) => {
    // Remove expired
    if (ob.expires && state.round > ob.expires.round) return false;

    // Remove if all targets are dead (conservative: keep if any alive)
    const anyAlive = ob.tgt.some((t) => {
      const c = state.getCombatant(t);
      return c && !c.conditions.includes("dead");
    });
    if (!anyAlive) return false;

    return true;
  });
}
