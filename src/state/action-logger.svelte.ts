import type { EncounterState } from "./encounter-state.svelte";
import type { DamageComponent, CombatAction, ActionEffect } from "../types/encounter";
import type { AttackTargetResult } from "../types/actions";
import { applyOutcome, totalDamage, concentrationDC } from "../utils/damage-calc";
import { findLibraryAction, addToLibrary } from "./library-loader";
import { updatePartyMember } from "./party-loader";
import { nowTimestamp } from "../utils/time";
import { createObligation } from "./obligation-engine.svelte";

export interface AttackParams {
  by: string;
  via: string;
  verb?: string;
  baseDmg: DamageComponent[];
  save?: { stat: string; dc: number; on_pass?: string };
  targets: { who: string; outcome: "full" | "half" | "zero" }[];
  spellKey?: string;
  slot?: number;
  conc?: boolean;
  isSpell?: boolean;
  /** This is a resolved deferred effect, not a new action. */
  resolved?: boolean;
  /** Effects applied during this action, for saving to the library. */
  actionEffects?: ActionEffect[];
}

export function commitAttack(state: EncounterState, params: AttackParams): void {
  const hasDamage = params.baseDmg.some((d) => d.n > 0);

  const tgt: AttackTargetResult[] = params.targets.map((t) => {
    if (!hasDamage && !params.isSpell && !params.verb) {
      // No damage on a plain weapon attack = miss
      return { who: t.who, hit: "zero" as const };
    }
    const dmg = applyOutcome(params.baseDmg, t.outcome);
    return {
      who: t.who,
      hit: t.outcome,
      dmg: dmg.length > 0 ? dmg : undefined,
    };
  });

  const entry: any = {
    attack: {
      by: params.by,
      via: params.via,
      tgt,
    },
  };
  if (params.verb) entry.attack.verb = params.verb;
  if (params.isSpell) entry.attack.spell = true;
  if (params.resolved) entry.attack.resolved = true;
  if (params.save) entry.attack.save = params.save;
  state.logInsert(entry);

  // Apply damage to targets
  for (const t of tgt) {
    if (!t.dmg || t.dmg.length === 0) continue;
    const dmgTotal = totalDamage(t.dmg);
    applyDamage(state, t.who, dmgTotal);
  }

  // Handle spell slot and concentration
  if (params.slot && params.by) {
    decrementSpellSlot(state, params.by, params.slot);
  }
  if (params.conc && params.spellKey) {
    setConcentration(state, params.by, params.spellKey, state.log.length - 1);
  }

  // Create obligation if the spell has one
  const spellDef = params.spellKey ? state.findSpellDef(params.spellKey) : undefined;
  if (spellDef?.obligation) {
    createObligation(
      state,
      params.spellKey!,
      params.targets.map((t) => t.who),
      state.log.length - 1,
    );
  }

  // Persist new via+type as an action on the actor for future autocomplete
  if (!params.spellKey && !params.resolved) {
    learnAction(state, params.by, params.via, params.baseDmg, params.isSpell, params.conc, params.actionEffects);
  }

  state.flush();
}

export interface HealParams {
  by: string;
  via?: string;
  resolved?: boolean;
  targets: { who: string; hp: number }[];
}

export function commitHeal(state: EncounterState, params: HealParams): void {
  const entry: any = {
    heal: {
      by: params.by,
      via: params.via,
      tgt: params.targets,
    },
  };
  if (params.resolved) entry.heal.resolved = true;
  state.logInsert(entry);

  for (const t of params.targets) {
    const combatant = state.getCombatant(t.who);
    if (!combatant) continue;
    if (combatant.type === "npc" && combatant.hp) {
      combatant.hp.current = Math.min(
        combatant.hp.current + t.hp,
        combatant.hp.max,
      );
      // Remove dead condition if healed above 0
      if (combatant.hp.current > 0) {
        combatant.conditions = combatant.conditions.filter(
          (c) => c !== "dead",
        );
      }
    } else if (combatant.type === "pc") {
      combatant.damage_taken = Math.max(
        0,
        (combatant.damage_taken ?? 0) - t.hp,
      );
    }
  }

  state.flush();
}

export interface NoteParams {
  by: string;
  text: string;
}

export function commitNote(state: EncounterState, params: NoteParams): void {
  state.logInsert({
    note: {
      by: params.by,
      text: params.text,
    },
  });
  state.flush();
}

/** Apply damage to a combatant, handling temp HP, death, and concentration. */
/**
 * If the via isn't already known to the actor, learn it for future autocomplete.
 * SRD spells are stored as a name string in the actor's `spells` list.
 * Non-spell actions are stored as full objects in `actions`.
 */
function learnAction(
  state: EncounterState,
  actorId: string,
  via: string,
  dmgComponents: DamageComponent[],
  isSpellAction?: boolean,
  concentration?: boolean,
  actionEffects?: ActionEffect[],
): void {
  const actor = state.getCombatant(actorId);
  if (!actor || !via) return;

  const lower = via.toLowerCase();

  // Already known as an action or spell (string or object)?
  const knownAction = (actor.actions ?? []).some((a) => {
    const name = typeof a === "string" ? a : a?.name;
    return name?.toLowerCase() === lower;
  });
  const knownSpell = (actor.spells ?? []).some((s) => {
    const name = typeof s === "string" ? s : s?.name;
    return name?.toLowerCase() === lower;
  });
  if (knownAction || knownSpell) return;

  // Already in the library? Just add a string reference
  const libMatch = findLibraryAction(via);
  if (libMatch) {
    if (isSpellAction) {
      if (!actor.spells) actor.spells = [];
      actor.spells.push(libMatch.name);
    } else {
      if (!actor.actions) actor.actions = [];
      actor.actions.push(libMatch.name);
    }
    if (actor.type === "pc") {
      updatePartyMember(state.app, state.partyNotePath, actor.id,
        isSpellAction ? undefined : [libMatch.name],
        isSpellAction ? [libMatch.name] : undefined,
      );
    }
    return;
  }

  // For PCs: add full action to the library, then string reference on the actor
  if (actor.type === "pc") {
    const types = dmgComponents.filter((d) => d.type);
    const libAction: CombatAction = {
      name: via,
      type: isSpellAction ? "spell" : "attack",
    };
    if (types.length > 0) {
      libAction.dmg = types.map((d) => ({ dice: "", type: d.type }));
    }
    if (concentration) libAction.concentration = true;
    if (actionEffects && actionEffects.length > 0) {
      libAction.effects = actionEffects;
    }

    addToLibrary(state.app, state.libraryPaths, libAction);

    // Add string reference to actor and party file
    if (isSpellAction) {
      if (!actor.spells) actor.spells = [];
      actor.spells.push(via);
      updatePartyMember(state.app, state.partyNotePath, actor.id, undefined, [via]);
    } else {
      if (!actor.actions) actor.actions = [];
      actor.actions.push(via);
      updatePartyMember(state.app, state.partyNotePath, actor.id, [via]);
    }
    return;
  }

  // For NPCs: store inline on the combatant (NPC-specific)
  const types = dmgComponents
    .filter((d) => d.type)
    .map((d) => ({ dice: "", type: d.type }));

  const newAction: CombatAction = {
    name: via,
    type: isSpellAction ? "spell" : "attack",
    dmg: types.length > 0 ? types : undefined,
    concentration: concentration || undefined,
    effects: actionEffects && actionEffects.length > 0 ? actionEffects : undefined,
  };

  if (isSpellAction) {
    if (!actor.spells) actor.spells = [];
    actor.spells.push(newAction as any);
  } else {
    if (!actor.actions) actor.actions = [];
    actor.actions.push(newAction);
  }
}

function applyDamage(state: EncounterState, targetId: string, amount: number): void {
  const combatant = state.getCombatant(targetId);
  if (!combatant) return;

  let remaining = amount;

  // Absorb with temp HP first
  if (combatant.temp_hp > 0) {
    const absorbed = Math.min(combatant.temp_hp, remaining);
    combatant.temp_hp -= absorbed;
    remaining -= absorbed;
  }

  if (combatant.type === "npc" && combatant.hp) {
    combatant.hp.current = Math.max(0, combatant.hp.current - remaining);

    // Auto-death at 0 HP for NPCs
    if (combatant.hp.current === 0 && !combatant.conditions.includes("dead")) {
      combatant.conditions.push("dead");
      state.logInsert({ death: { who: targetId, at: nowTimestamp() } });

      // Drop concentration on death
      if (combatant.concentration) {
        dropConcentration(state, targetId);
      }
    }
  } else if (combatant.type === "pc") {
    combatant.damage_taken = (combatant.damage_taken ?? 0) + remaining;
  }

  // Concentration save if damaged and concentrating (and still alive)
  const isConcentrating = combatant.concentration ||
    (combatant.tags ?? []).some((t) => t.name.startsWith("Concentrating:"));
  if (isConcentrating && !(combatant.conditions ?? []).includes("dead") && remaining > 0) {
    triggerConcentrationSave(state, targetId, remaining);
  }
}

function triggerConcentrationSave(
  state: EncounterState,
  targetId: string,
  damage: number,
): void {
  const combatant = state.getCombatant(targetId);
  if (!combatant) return;

  // Find the concentration tag
  const concTag = (combatant.tags ?? []).find((t) => t.name.startsWith("Concentrating:"));
  if (!concTag) return;

  const dc = concentrationDC(damage);
  const spellName = concTag.name.replace("Concentrating: ", "");

  // Add a concentration save tag that surfaces as a banner immediately
  combatant.tags.push({
    id: `conc-save-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: `Concentration: ${spellName}`,
    source: targetId,
    note: `CON DC ${dc} to maintain ${spellName}`,
    trigger: "when_damaged",
    onTrigger: `CON save DC ${dc} for ${spellName}`,
    autoRemove: "manual",
    save: { stat: "con", onSave: "maintain" },
  });
}

export function dropConcentration(state: EncounterState, casterId: string): void {
  const combatant = state.getCombatant(casterId);
  if (!combatant) return;

  // Find the concentration tag
  const concTag = (combatant.tags ?? []).find((t) => t.name.startsWith("Concentrating:"));
  const spellName = concTag?.name.replace("Concentrating: ", "") ?? combatant.concentration?.spell;

  // Remove concentration tag from the caster
  if (concTag) {
    combatant.tags = combatant.tags.filter((t) => t.id !== concTag.id);
  }

  // Also remove any pending concentration save tags
  combatant.tags = combatant.tags.filter((t) => !t.name.startsWith("Concentration:"));

  // Clear the legacy concentration field
  combatant.concentration = null;

  if (spellName) {
    state.logInsert({
      effect_ends: {
        what: spellName,
        on: casterId,
        reason: "concentration_dropped",
      },
    });

    // Cascade: remove all tags sharing the same castId as the concentration tag.
    // This precisely targets only the tags created by this specific spell cast,
    // leaving tags from other actions by the same caster untouched.
    const castId = concTag?.castId;
    for (const c of state.combatants ?? []) {
      const removedNames: string[] = [];
      c.tags = (c.tags ?? []).filter((t) => {
        // Match by castId if available (precise); fall back to source + spell name
        if (castId && t.castId === castId) {
          removedNames.push(t.name);
          return false;
        }
        if (!castId && t.source === casterId && t.name === spellName) {
          removedNames.push(t.name);
          return false;
        }
        return true;
      });
      if (c.id !== casterId && removedNames.length > 0) {
        for (const name of removedNames) {
          state.logInsert({
            effect_ends: {
              what: name,
              on: c.id,
              reason: "source_concentration_lost",
            },
          });
        }
      }
    }
  }

  // Clean up old obligations
  state.activeObligations = (state.activeObligations ?? []).filter(
    (ob) => !(ob.spell === spellName),
  );
}

function setConcentration(
  state: EncounterState,
  casterId: string,
  spellKey: string,
  logLine: number,
): void {
  const combatant = state.getCombatant(casterId);
  if (!combatant) return;

  // Drop existing concentration if any
  if (combatant.concentration) {
    dropConcentration(state, casterId);
  }

  combatant.concentration = { spell: spellKey, line_ref: logLine };
}

function decrementSpellSlot(
  state: EncounterState,
  casterId: string,
  level: number,
): void {
  const combatant = state.getCombatant(casterId);
  if (!combatant?.spell_slots || combatant.type !== "npc") return;

  const slot = combatant.spell_slots[level];
  if (slot && slot.current > 0) {
    slot.current--;
  }
}
