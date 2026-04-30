import type { EncounterState } from "./encounter-state.svelte";
import type { DamageComponent, CombatAction } from "../types/encounter";
import type { AttackTargetResult } from "../types/actions";
import { applyOutcome, totalDamage, concentrationDC } from "../utils/damage-calc";
import { nowTimestamp } from "../utils/time";
import { createObligation } from "./obligation-engine.svelte";

export interface AttackParams {
  by: string;
  via: string;
  baseDmg: DamageComponent[];
  save?: { stat: string; dc: number; on_pass?: string };
  targets: { who: string; outcome: "full" | "half" | "zero" }[];
  spellKey?: string;
  slot?: number;
  conc?: boolean;
}

export function commitAttack(state: EncounterState, params: AttackParams): void {
  const hasDamage = params.baseDmg.some((d) => d.n > 0);

  const tgt: AttackTargetResult[] = params.targets.map((t) => {
    if (!hasDamage) {
      // No damage entered; this is a miss
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
  if (params.save) entry.attack.save = params.save;
  state.log.push(entry);

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
  if (params.spellKey && state.spells[params.spellKey]?.obligation) {
    createObligation(
      state,
      params.spellKey,
      params.targets.map((t) => t.who),
      state.log.length - 1,
    );
  }

  // Persist new via+type as an action on the actor for future autocomplete
  if (!params.spellKey) {
    learnAction(state, params.by, params.via, params.baseDmg);
  }

  state.flush();
}

export interface HealParams {
  by: string;
  via?: string;
  targets: { who: string; hp: number }[];
}

export function commitHeal(state: EncounterState, params: HealParams): void {
  state.log.push({
    heal: {
      by: params.by,
      via: params.via,
      tgt: params.targets,
    },
  });

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

export interface BuffParams {
  by: string;
  via: string;
  targets: string[];
  spellKey?: string;
  slot?: number;
  conc?: boolean;
}

export function commitBuff(state: EncounterState, params: BuffParams): void {
  const entry: any = {
    buff: {
      by: params.by,
      via: params.via,
      tgt: params.targets,
    },
  };
  if (params.slot) entry.buff.slot = params.slot;
  if (params.conc) entry.buff.conc = true;
  state.log.push(entry);

  if (params.slot) {
    decrementSpellSlot(state, params.by, params.slot);
  }
  if (params.conc && params.spellKey) {
    setConcentration(state, params.by, params.spellKey, state.log.length - 1);
  }
  if (params.spellKey && state.spells[params.spellKey]?.obligation) {
    createObligation(state, params.spellKey, params.targets, state.log.length - 1);
  }

  state.flush();
}

export interface DebuffParams {
  by: string;
  via: string;
  targets: string[];
  conditions?: string[];
  spellKey?: string;
  slot?: number;
  conc?: boolean;
}

export function commitDebuff(state: EncounterState, params: DebuffParams): void {
  const entry: any = {
    debuff: {
      by: params.by,
      via: params.via,
      tgt: params.targets,
    },
  };
  if (params.slot) entry.debuff.slot = params.slot;
  if (params.conc) entry.debuff.conc = true;
  state.log.push(entry);

  // Apply conditions to targets
  if (params.conditions) {
    for (const targetId of params.targets) {
      const combatant = state.getCombatant(targetId);
      if (!combatant) continue;
      for (const condition of params.conditions) {
        if (!combatant.conditions.includes(condition)) {
          combatant.conditions.push(condition);
        }
        if (condition === "dead" && combatant.type === "npc" && combatant.hp) {
          combatant.hp.current = 0;
        }
      }
    }
  }

  if (params.slot) {
    decrementSpellSlot(state, params.by, params.slot);
  }
  if (params.conc && params.spellKey) {
    setConcentration(state, params.by, params.spellKey, state.log.length - 1);
  }
  if (params.spellKey && state.spells[params.spellKey]?.obligation) {
    createObligation(state, params.spellKey, params.targets, state.log.length - 1);
  }

  state.flush();
}

export interface SaveParams {
  who: string;
  stat: string;
  dc: number;
  result: "pass" | "fail";
  forSpell?: string;
}

export function commitSave(state: EncounterState, params: SaveParams): void {
  state.log.push({
    save: {
      who: params.who,
      stat: params.stat,
      dc: params.dc,
      result: params.result,
      for: params.forSpell,
    },
  });
  state.flush();
}

export interface NoteParams {
  by: string;
  text: string;
}

export function commitNote(state: EncounterState, params: NoteParams): void {
  state.log.push({
    note: {
      by: params.by,
      text: params.text,
    },
  });
  state.flush();
}

/** Apply damage to a combatant, handling temp HP, death, and concentration. */
/**
 * If the via+type combination isn't already in the actor's actions list,
 * add it so it autocompletes next time.
 */
function learnAction(
  state: EncounterState,
  actorId: string,
  via: string,
  dmgComponents: DamageComponent[],
): void {
  const actor = state.getCombatant(actorId);
  if (!actor || !via) return;

  // Check if this action name already exists
  if (!actor.actions) actor.actions = [];
  const existing = actor.actions.find(
    (a) => a.name.toLowerCase() === via.toLowerCase(),
  );
  if (existing) return;

  // Build the new action with damage types (no amounts; those are rolled live)
  const types = dmgComponents
    .filter((d) => d.type)
    .map((d) => ({ dice: "", type: d.type }));

  actor.actions.push({
    name: via,
    type: "attack",
    dmg: types.length > 0 ? types : undefined,
  });
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
      state.log.push({ death: { who: targetId, at: nowTimestamp() } });

      // Drop concentration on death
      if (combatant.concentration) {
        dropConcentration(state, targetId);
      }
    }
  } else if (combatant.type === "pc") {
    combatant.damage_taken = (combatant.damage_taken ?? 0) + remaining;
  }

  // Concentration save if damaged and concentrating (and still alive)
  if (combatant.concentration && !combatant.conditions.includes("dead") && remaining > 0) {
    triggerConcentrationSave(state, targetId, remaining);
  }
}

function triggerConcentrationSave(
  state: EncounterState,
  targetId: string,
  damage: number,
): void {
  const combatant = state.getCombatant(targetId);
  if (!combatant?.concentration) return;

  const dc = concentrationDC(damage);
  const spell = combatant.concentration.spell;

  // Add a concentration save obligation that surfaces immediately
  const obId = `conc-${targetId}-${state.log.length}`;
  state.activeObligations.push({
    id: obId,
    spell,
    cast_line: combatant.concentration.line_ref,
    tgt: [targetId],
    last_triggered: null,
  });
}

export function dropConcentration(state: EncounterState, casterId: string): void {
  const combatant = state.getCombatant(casterId);
  if (!combatant?.concentration) return;

  const spellKey = combatant.concentration.spell;
  combatant.concentration = null;

  state.log.push({
    effect_ends: {
      what: spellKey,
      on: casterId,
      reason: "concentration_dropped",
    },
  });

  // Remove obligations tied to this spell by this caster
  state.activeObligations = state.activeObligations.filter(
    (ob) => !(ob.spell === spellKey && ob.cast_line >= 0),
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
