import type { App } from "obsidian";
import type { EncounterState } from "./encounter-state.svelte";
import type { Combatant, CombatAction } from "../types/encounter";
import { resolveActionRef } from "./library-loader";
import { getCreature, getStatblockActionToHit } from "./statblocks-api";

/** A single missing value surfaced by the pre-flight readiness check. The check
 *  is informational: it never blocks the encounter from starting, it just tells
 *  the DM which reference numbers aren't resolving so they can fix the source
 *  (YAML or statblock note) before play. */
export interface ReadinessIssue {
  combatantId: string;
  combatantName: string;
  message: string;
}

/** Resolve a combatant action reference (a library-name string or an inline
 *  object) to a CombatAction for inspection. An unmatched string becomes a
 *  minimal attack stub so it's still treated as an attack that needs a bonus. */
function resolveAction(a: string | CombatAction): CombatAction {
  return resolveActionRef(a) ?? { name: typeof a === "string" ? a : a.name, type: "attack" };
}

/** Whether an action resolves via an attack roll (so it wants a to-hit) rather
 *  than a saving throw or pure utility. Save-based and multiattack entries are
 *  not attack rolls; otherwise anything that deals damage or is typed as an
 *  attack counts. */
function isAttackRoll(action: CombatAction): boolean {
  if (action.save) return false;
  if (action.type === "multiattack") return false;
  const dealsDamage = (action.dmg?.length ?? 0) > 0 || !!action.damageType;
  return action.type === "attack" || action.toHit != null || dealsDamage;
}

/** Inspect a started/about-to-start roster for missing values the DM relies on
 *  to run the fight. Run AFTER prepareRoster has resolved statblock data, so it
 *  reflects everything the bestiary could fill. Returns one issue per problem;
 *  an empty array means the roster is ready. */
export function checkEncounterReadiness(state: EncounterState, app: App): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const push = (c: Combatant, message: string) =>
    issues.push({ combatantId: c.id, combatantName: c.name, message });

  for (const c of state.combatants) {
    const creature = c.statblock ? getCreature(app, c.statblock) : null;
    const statblockBroken = !!c.statblock && !creature;

    // No usable HP is the one true blocker; NPCs and objects both have pools.
    const needsHp = c.type === "npc" || c.type === "object";
    const noHp = needsHp && (!c.hp || c.hp.max <= 0);

    // An unresolved statblock is the root cause of missing AC/HP/attacks, so
    // report it once and skip the per-field noise it would otherwise produce.
    if (statblockBroken) {
      push(
        c,
        `statblock "${c.statblock}" not found in Fantasy Statblocks — AC, HP, and attack bonuses can't resolve`,
      );
      if (noHp) push(c, "no usable HP (max 0)");
      continue;
    }

    if (noHp) push(c, "no usable HP (max 0)");

    if (c.type === "npc" && c.ac == null) push(c, "no AC");

    if (c.type === "npc") {
      for (const ref of c.actions ?? []) {
        const action = resolveAction(ref);
        if (!isAttackRoll(action)) continue;
        const toHit =
          action.toHit ??
          getStatblockActionToHit(app, c.statblock, action.name) ??
          c.toHit ??
          (action.type === "spell" ? c.spellAttack : undefined);
        if (toHit == null) push(c, `"${action.name}" has no attack bonus`);
      }
    }
  }

  return issues;
}
