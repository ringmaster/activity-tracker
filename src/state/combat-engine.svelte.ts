import type { EncounterState } from "./encounter-state.svelte";
import type { Combatant, CombatAction } from "../types/encounter";
import type { PartyMember } from "../types/party";
import { rollInitiative } from "../utils/dice";
import { nowTimestamp } from "../utils/time";
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

  const now = nowTimestamp();
  state.log.push({ start_combat: { at: now } });
  state.log.push({ start_round: { n: 1, at: now } });

  // Advance to first living combatant
  const first = state.sortedCombatants.find(
    (c) => !c.conditions.includes("dead"),
  );
  if (first) {
    state.currentTurn = first.id;
    state.log.push({
      start_turn: { who: first.id, init: first.init ?? 0, at: now },
    });
  }
}

/** Advance to the next turn. If we're navigating forward through
 *  already-recorded history, just move the cursor without appending
 *  new log entries. Only appends when advancing past the end of history. */
export function nextTurn(state: EncounterState): void {
  const sorted = state.sortedCombatants;
  const living = sorted.filter((c) => !c.conditions.includes("dead"));
  if (living.length === 0) return;

  // Clear any actor swap
  state.swappedActor = null;

  // Check if there's a later start_turn in the log we can navigate to
  const currentTurnLogIdx = findLastStartTurn(state.log, state.currentTurn!);
  if (currentTurnLogIdx >= 0) {
    // Look for the next start_turn after the current one
    for (let i = currentTurnLogIdx + 1; i < state.log.length; i++) {
      const entry = state.log[i] as any;
      if (entry.start_turn) {
        // Replaying history; just move the cursor
        state.currentTurn = entry.start_turn.who;
        state.flush();
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
    if (!sorted[nextIdx].conditions.includes("dead")) break;
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

  // Reset legendary actions for NPCs at the start of their turn
  const actor = sorted[nextIdx];
  if (actor.legendary_actions) {
    actor.legendary_actions.current = actor.legendary_actions.max;
  }

  state.flush();
}

/** Find the index of the last start_turn entry for a given combatant. */
function findLastStartTurn(log: any[], who: string): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i] as any;
    if (entry.start_turn && entry.start_turn.who === who) return i;
  }
  return -1;
}

/** Go back to the previous turn (navigation only, does not undo actions). */
export function prevTurn(state: EncounterState): void {
  const sorted = state.sortedCombatants;
  const currentIdx = sorted.findIndex((c) => c.id === state.currentTurn);
  if (currentIdx < 0) return;

  // Clear any actor swap
  state.swappedActor = null;

  let prevIdx = currentIdx - 1;

  // Find previous living combatant, wrapping around
  let wrapped = false;
  while (true) {
    if (prevIdx < 0) {
      prevIdx = sorted.length - 1;
      wrapped = true;
    }
    if (!sorted[prevIdx].conditions.includes("dead")) break;
    prevIdx--;
    if (prevIdx < 0) {
      prevIdx = sorted.length - 1;
      wrapped = true;
    }
    if (prevIdx === currentIdx) break;
  }

  if (wrapped && prevIdx >= currentIdx && state.round > 1) {
    state.round--;
  }

  state.currentTurn = sorted[prevIdx].id;
  state.flush();
}

/** End the encounter. */
export function endEncounter(state: EncounterState): void {
  state.active = false;
  state.log.push({ end_combat: { at: nowTimestamp() } });
  state.activeObligations = [];
  state.swappedActor = null;
  state.activeAction = null;
  state.flushNow();
  state.onDeactivate?.();
}

/** Reset the encounter to a fresh state: restore NPC HP, remove PCs,
 *  clear conditions/concentration/obligations, reset round, clear log. */
export function resetEncounter(state: EncounterState): void {
  state.active = false;
  state.round = 0;
  state.currentTurn = null;
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

  state.flushNow();
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
