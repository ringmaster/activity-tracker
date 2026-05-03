import type { EncounterState } from "./encounter-state.svelte";
import type { Combatant, CombatAction, ActionEffect } from "../types/encounter";
import type { PartyMember } from "../types/party";
import { rollInitiative } from "../utils/dice";
import { nowTimestamp } from "../utils/time";

/** Check if a combatant should be skipped in turn order. */
function isOutOfCombat(c: Combatant): boolean {
  return c.conditions.includes("dead") || c.conditions.includes("fled");
}
import { getCreature } from "./statblocks-api";
import type { App } from "obsidian";

export interface RosterEntry {
  id: string;
  name: string;
  type: "npc" | "pc";
  init: number | null;
  hp?: { current: number; max: number };
  statblock?: string;
  actions?: CombatAction[];
}

/** Prepare the roster for the encounter start screen. */
export function prepareRoster(
  state: EncounterState,
  party: PartyMember[],
  app: App,
): { npcs: RosterEntry[]; pcs: RosterEntry[] } {
  const npcs: RosterEntry[] = state.combatants
    .filter((c) => c.type === "npc")
    .map((c) => {
      let init = c.init;
      if (init === null && c.statblock) {
        const creature = getCreature(app, c.statblock);
        if (creature?.dexMod !== undefined) {
          init = rollInitiative(creature.dexMod);
        }
      }
      if (init === null) {
        init = rollInitiative(0);
      }

      // Auto-populate HP from statblock if not set
      if (c.type === "npc" && c.hp && c.hp.max === 0 && c.statblock) {
        const creature = getCreature(app, c.statblock);
        if (creature?.hp) {
          c.hp = { current: creature.hp, max: creature.hp };
        }
      }

      return {
        id: c.id,
        name: c.name,
        type: c.type,
        init,
        hp: c.hp,
        statblock: c.statblock,
      };
    });

  const pcs: RosterEntry[] = party.map((p) => ({
    id: p.id,
    name: p.name,
    type: "pc" as const,
    init: null,
    actions: p.actions?.map((a) => ({
      name: a.name,
      type: a.type,
      dmg: a.dmg?.map((d) => ({ dice: "", type: d.type })),
      save: a.save,
      note: a.note,
      slot: a.slot,
    })),
  }));

  return { npcs, pcs };
}

export interface PCToAdd {
  id: string;
  name: string;
  init: number;
  actions?: CombatAction[];
}

/** Start the encounter with the given roster and initiative values. */
export function startEncounter(
  state: EncounterState,
  rosterInits: Map<string, number>,
  pcsToAdd: PCToAdd[],
): void {
  // Add PCs to combatants
  for (const pc of pcsToAdd) {
    if (!state.combatants.find((c) => c.id === pc.id)) {
      state.combatants.push({
        id: pc.id,
        name: pc.name,
        type: "pc",
        init: pc.init,
        damage_taken: 0,
        temp_hp: 0,
        conditions: [],
        tags: [],
        concentration: null,
        actions: pc.actions,
      });
    }
  }

  // Apply initiative overrides from roster
  for (const [id, init] of rosterInits) {
    const combatant = state.getCombatant(id);
    if (combatant) combatant.init = init;
  }

  // Set active
  state.active = true;
  state.round = 1;

  // Apply active_at_start effects as tags on their combatants
  applyStartEffects(state);

  const now = nowTimestamp();
  state.log.push({ start_combat: { at: now } });
  state.log.push({ start_round: { n: 1, at: now } });

  // Advance to first living combatant
  const first = state.sortedCombatants.find(
    (c) => !isOutOfCombat(c),
  );
  if (first) {
    state.currentTurn = first.id;
    state.log.push({
      start_turn: { who: first.id, init: first.init ?? 0, at: now },
    });
  }
}

/** Scan all combatants for actions with active_at_start effects and apply them as tags.
 *  Skips effects that already have a matching tag (for resume after pause). */
function applyStartEffects(state: EncounterState): void {
  for (const combatant of state.combatants) {
    const actions = combatant.actions ?? [];
    for (const action of actions) {
      if (typeof action === "string") continue;
      const effects = action.effects ?? [];
      for (const effect of effects) {
        if (!effect.active_at_start) continue;
        if (effect.type !== "tag" && effect.type !== "heal" && effect.type !== "damage") continue;
        const tagName = effect.name ?? action.name;
        // Don't duplicate if the tag already exists
        if (combatant.tags.some((t) => t.name === tagName)) continue;
        combatant.tags.push({
          id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: tagName,
          source: combatant.id,
          note: effect.note,
          trigger: effect.trigger,
          onTrigger: effect.note,
          autoRemove: "manual",
          damageType: effect.type === "heal" ? undefined : effect.damageType,
          dice: effect.dice,
          save: effect.save,
          isHeal: effect.type === "heal" || undefined,
          uses: effect.uses ? { current: effect.uses, max: effect.uses } : undefined,
          resetOn: effect.resetOn,
        });
      }
    }
  }
}

/** Advance to the next turn. If we're navigating forward through
 *  already-recorded history, just move the cursor without appending
 *  new log entries. Only appends when advancing past the end of history. */
export function nextTurn(state: EncounterState): void {
  const sorted = state.sortedCombatants;
  const living = sorted.filter((c) => !isOutOfCombat(c));
  if (living.length === 0) return;

  // Clear transient state
  state.swappedActor = null;
  state.lastTargetIds = [];

  // Find our current position in the log
  const currentLogIdx = resolveCurrentTurnLogIndex(state);

  // Check if there's a later start_turn in the log we can navigate to
  if (currentLogIdx >= 0) {
    for (let i = currentLogIdx + 1; i < state.log.length; i++) {
      const entry = state.log[i] as any;
      if (entry.start_turn) {
        // Replaying history; just move the cursor
        state.currentTurn = entry.start_turn.who;
        state.currentTurnLogIndex = i;
        state.flushNow();
        return;
      }
    }
  }

  // No future start_turn found; we're advancing to a genuinely new turn
  const currentIdx = sorted.findIndex((c) => c.id === state.currentTurn);
  let nextIdx = currentIdx + 1;

  // Find next living combatant, wrapping around
  let wrapped = false;
  while (true) {
    if (nextIdx >= sorted.length) {
      nextIdx = 0;
      wrapped = true;
    }
    if (!isOutOfCombat(sorted[nextIdx])) break;
    nextIdx++;
    if (nextIdx >= sorted.length) {
      nextIdx = 0;
      wrapped = true;
    }
    if (nextIdx === currentIdx) break;
  }

  // If we wrapped, increment round
  if (wrapped && nextIdx <= currentIdx) {
    state.round++;
    state.log.push({
      start_round: { n: state.round, at: nowTimestamp() },
    });
  }

  state.currentTurn = sorted[nextIdx].id;
  state.log.push({
    start_turn: {
      who: sorted[nextIdx].id,
      init: sorted[nextIdx].init ?? 0,
      at: nowTimestamp(),
    },
  });
  state.currentTurnLogIndex = state.log.length - 1;

  // Reset legendary actions for NPCs at the start of their turn
  const actor = sorted[nextIdx];
  if (actor.legendary_actions) {
    actor.legendary_actions.current = actor.legendary_actions.max;
  }

  // Reset tag uses that refresh on turn start
  for (const tag of actor.tags) {
    if (tag.uses && tag.resetOn === "turn") {
      tag.uses.current = tag.uses.max;
    }
  }

  state.flushNow();
}

/**
 * Resolve the current log index. If currentTurnLogIndex is set and valid, use it.
 * Otherwise fall back to finding the last start_turn for the current actor.
 */
function resolveCurrentTurnLogIndex(state: EncounterState): number {
  // Check if the stored index is still valid
  if (state.currentTurnLogIndex >= 0 && state.currentTurnLogIndex < state.log.length) {
    const entry = state.log[state.currentTurnLogIndex] as any;
    if (entry.start_turn && entry.start_turn.who === state.currentTurn) {
      return state.currentTurnLogIndex;
    }
  }
  // Fall back: find the last start_turn for the current actor
  const idx = findLastStartTurn(state.log, state.currentTurn!);
  state.currentTurnLogIndex = idx;
  return idx;
}

/** Find the index of the last start_turn entry for a given combatant. */
function findLastStartTurn(log: any[], who: string): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i] as any;
    if (entry.start_turn && entry.start_turn.who === who) return i;
  }
  return -1;
}

/** Go back to the previous turn by walking the log history. */
export function prevTurn(state: EncounterState): void {
  state.swappedActor = null;
  state.lastTargetIds = [];

  const currentLogIdx = resolveCurrentTurnLogIndex(state);
  if (currentLogIdx < 0) return;

  // Find the start_turn immediately before our current position
  for (let i = currentLogIdx - 1; i >= 0; i--) {
    const entry = state.log[i] as any;
    if (entry.start_turn) {
      state.currentTurn = entry.start_turn.who;
      state.currentTurnLogIndex = i;
      state.flushNow();
      return;
    }
  }
}

/** End the encounter. */
export async function endEncounter(state: EncounterState): Promise<void> {
  state.active = false;
  state.log.push({ end_combat: { at: nowTimestamp() } });
  state.activeObligations = [];
  state.swappedActor = null;
  state.activeAction = null;
  await state.flushNow();
  state.onDeactivate?.();
}

/** Reset the encounter to a fresh state: restore NPC HP, remove PCs,
 *  clear conditions/concentration/obligations, reset round, clear log. */
export async function resetEncounter(state: EncounterState): Promise<void> {
  state.active = false;
  state.round = 0;
  state.currentTurn = null;
  state.currentTurnLogIndex = -1;
  state.lastTargetIds = [];
  state.log = [];
  state.activeObligations = [];
  state.swappedActor = null;
  state.activeAction = null;

  // Keep only NPCs; remove PCs (they get re-added at encounter start)
  state.combatants = state.combatants
    .filter((c) => c.type === "npc")
    .map((c) => ({
      ...c,
      init: null,
      hp: c.hp ? { current: c.hp.max, max: c.hp.max } : undefined,
      temp_hp: 0,
      conditions: [],
      tags: [],
      concentration: null,
      legendary_actions: c.legendary_actions
        ? { max: c.legendary_actions.max, current: c.legendary_actions.max }
        : null,
      spell_slots: c.spell_slots
        ? Object.fromEntries(
            Object.entries(c.spell_slots).map(([k, v]) => [k, { current: v.max, max: v.max }]),
          )
        : undefined,
    }));

  await state.flushNow();
  state.onDeactivate?.();
}

/** Add a combatant mid-encounter. */
export function addCombatant(
  state: EncounterState,
  combatant: Combatant,
): void {
  state.combatants.push(combatant);
  state.log.push({
    add_combatant: {
      who: combatant.id,
      name: combatant.name,
      init: combatant.init ?? 0,
      at: nowTimestamp(),
    },
  });
  state.flush();
}

/** Remove a combatant from the encounter (not death; gone entirely). */
export function removeCombatant(
  state: EncounterState,
  id: string,
  reason?: string,
): void {
  const idx = state.combatants.findIndex((c) => c.id === id);
  if (idx < 0) return;

  // If removing the current turn holder, advance first
  if (state.currentTurn === id) {
    nextTurn(state);
  }

  state.combatants.splice(idx, 1);
  state.log.push({
    remove_combatant: {
      who: id,
      reason,
      at: nowTimestamp(),
    },
  });
  state.flush();
}
