import type { EncounterState } from "./encounter-state.svelte";
import type { Combatant, CombatAction, ActionEffect, Spell, ZonePosition } from "../types/encounter";
import type { PartyMember, Rider } from "../types/party";
import { rollInitiative } from "../utils/dice";
import { nowTimestamp } from "../utils/time";

/** Check if a combatant should be skipped in turn order. */
function isOutOfCombat(c: Combatant): boolean {
  return c.type === "object" || c.conditions.includes("dead") || c.conditions.includes("fled");
}
import { getCreature } from "./statblocks-api";
import { resolveActionRef } from "./library-loader";
import { rewindAll } from "./log-rewind.svelte";
import type { App } from "obsidian";

export interface RosterEntry {
  id: string;
  name: string;
  type: "npc" | "pc";
  init: number | null;
  hp?: { current: number; max: number };
  statblock?: string;
  /** Mirrors Combatant.actions: strings reference the library by name (e.g.
   *  "Grapple"); objects are inline authored actions. PCs author either
   *  form, so this needs to accept both. */
  actions?: (string | CombatAction)[];
  /** PCs only: spells known by this PC, threaded from PartyMember.spells so
   *  the action bar's via dropdown can surface them under the cast preset. */
  spells?: (string | Spell)[];
  riders?: Rider[];
  /** Current zone id for this actor; used to seed the roster's zone dropdown.
   *  NPCs carry their authored zone; PCs default to undefined (first zone is
   *  applied if the user doesn't override). */
  zone?: ZonePosition;
  /** PCs only: display-only class/level summary surfaced beside the name. */
  classLevel?: string;
  /** Ally party member (Whisper et al). When true, startEncounter pushes the
   *  combatant as type: "npc" with friendly: true and an hp pool from
   *  `maxHp`, instead of a PC with cumulative damage_taken. */
  isAlly?: boolean;
  maxHp?: number;
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
      // Resolve the bestiary creature once and reuse it for every auto-fill
      // below, rather than re-fetching per concern.
      const creature = c.statblock ? getCreature(app, c.statblock) : null;

      let init = c.init;
      if (init === null && creature?.dexMod !== undefined) {
        init = rollInitiative(creature.dexMod);
      }
      if (init === null) {
        init = rollInitiative(0);
      }

      // Auto-populate HP from statblock if not set
      if (c.type === "npc" && c.hp && c.hp.max === 0 && creature?.hp) {
        c.hp = { current: creature.hp, max: creature.hp };
      }

      // Auto-populate AC from the statblock when not authored. getCreature
      // already returns the bestiary AC; previously it was fetched and then
      // discarded, so a statblock-only NPC showed no AC.
      if (c.ac == null && creature?.ac != null) {
        c.ac = creature.ac;
      }

      // Auto-populate resistances/immunities/vulnerabilities from the
      // bestiary if not authored on the NPC. Authored lists win.
      if (creature && !c.resistances && !c.immunities && !c.vulnerabilities) {
        if (creature.resistances) c.resistances = creature.resistances;
        if (creature.immunities) c.immunities = creature.immunities;
        if (creature.vulnerabilities) c.vulnerabilities = creature.vulnerabilities;
      }

      // Auto-populate actions from the bestiary's parsed action list when
      // the YAML didn't author any of its own. The parser fills toHit, dmg,
      // range, save, and stashes the full prose in desc; whatever it misses,
      // the DM composes at the table via the + menu. Authored actions still
      // win wholesale so any hand-tuning isn't clobbered by the bestiary.
      if (creature?.actions && (!c.actions || c.actions.length === 0)) {
        c.actions = creature.actions;
      }

      return {
        id: c.id,
        name: c.name,
        type: c.type,
        init,
        hp: c.hp,
        statblock: c.statblock,
        zone: c.zone,
      };
    });

  const pcs: RosterEntry[] = party.map((p) => ({
    id: p.id,
    name: p.name,
    type: "pc" as const,
    init: null,
    classLevel: p.class_level,
    // Strings are library references ("Grapple", "Second Wind") and must pass
    // through untouched; spreading a string into an object produces character-
    // indexed keys and loses the name, which then surfaces as a blank "via"
    // entry. Objects get their authored fields spread (range, verb, toHit,
    // concentration, effects, ...) with dmg normalized to {dice, type}.
    actions: p.actions?.map((a) =>
      typeof a === "string"
        ? a
        : {
            ...a,
            dmg: a.dmg?.map((d) => ({
              dice: (d as any).dice ?? "",
              type: d.type,
            })),
          },
    ),
    spells: p.spells,
    riders: p.riders,
    isAlly: p.is_ally,
    maxHp: p.max_hp,
  }));

  return { npcs, pcs };
}

export interface PCToAdd {
  id: string;
  name: string;
  init: number;
  classLevel?: string;
  actions?: (string | CombatAction)[];
  spells?: (string | Spell)[];
  riders?: Rider[];
  /** Starting zone selected on the roster screen. If undefined, the first
   *  zone defined on the encounter (if any) is applied as a default. */
  zone?: ZonePosition;
  /** Push this as an ally (NPC + friendly: true with an hp pool) instead
   *  of a PC with cumulative damage_taken. Requires maxHp. */
  isAlly?: boolean;
  maxHp?: number;
}

/** Initialize the rider_uses map from rider.uses caps. */
function initRiderUses(riders: Rider[] | undefined): Record<string, { current: number; max: number }> | undefined {
  if (!riders || riders.length === 0) return undefined;
  const out: Record<string, { current: number; max: number }> = {};
  for (const r of riders) {
    if (r.uses?.count != null) {
      out[r.name] = { current: r.uses.count, max: r.uses.count };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Initialize the action_uses map from action.uses caps. String entries are
 *  library references; resolve them against the cached library to find the
 *  uses cap. Returns undefined when no action carries a use cap. */
function initActionUses(
  actions: (string | CombatAction)[] | undefined,
): Record<string, { current: number; max: number }> | undefined {
  if (!actions || actions.length === 0) return undefined;
  const out: Record<string, { current: number; max: number }> = {};
  for (const a of actions) {
    const resolved = resolveActionRef(a);
    if (resolved?.uses?.count != null) {
      out[resolved.name] = { current: resolved.uses.count, max: resolved.uses.count };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Start the encounter with the given roster and initiative values.
 *  `rosterZones` carries zone-id overrides keyed by combatant id; PCs added
 *  via `pcsToAdd` already carry their zone via PCToAdd.zone, but if a guest
 *  or NPC has a different zone selected on the roster screen this map
 *  applies it after combatants exist. */
export function startEncounter(
  state: EncounterState,
  rosterInits: Map<string, number>,
  pcsToAdd: PCToAdd[],
  rosterZones?: Map<string, string>,
): void {
  const defaultZoneId = state.zones[0]?.id;

  // Add PCs (and PC-authored allies) to combatants
  for (const pc of pcsToAdd) {
    if (!state.combatants.find((c) => c.id === pc.id)) {
      // Prefer the zone the user picked; otherwise fall back to the first
      // zone so the move/preposition flow has a starting point.
      const zone = pc.zone ?? (defaultZoneId ? { id: defaultZoneId } : undefined);
      if (pc.isAlly) {
        // Ally companions (Whisper, hirelings, persistent summons) are pushed
        // as friendly NPCs so they get an hp pool that drains with damage
        // rather than the PC death-save flow. maxHp falls back to 1 if the
        // YAML forgot it -- not great, but better than a crashy 0.
        const maxHp = pc.maxHp ?? 1;
        state.combatants.push({
          id: pc.id,
          name: pc.name,
          type: "npc",
          class_level: pc.classLevel,
          init: pc.init,
          zone,
          hp: { current: maxHp, max: maxHp },
          temp_hp: 0,
          conditions: [],
          tags: [],
          concentration: null,
          friendly: true,
          actions: pc.actions,
          spells: pc.spells,
          riders: pc.riders,
          rider_uses: initRiderUses(pc.riders),
          action_uses: initActionUses(pc.actions),
        });
      } else {
        state.combatants.push({
          id: pc.id,
          name: pc.name,
          type: "pc",
          class_level: pc.classLevel,
          init: pc.init,
          zone,
          damage_taken: 0,
          temp_hp: 0,
          conditions: [],
          tags: [],
          concentration: null,
          actions: pc.actions,
          spells: pc.spells,
          riders: pc.riders,
          rider_uses: initRiderUses(pc.riders),
          action_uses: initActionUses(pc.actions),
        });
      }
    }
  }

  // Seed action_uses for authored NPCs/objects too. They didn't go through
  // pcsToAdd, but their YAML actions can also carry `uses:` caps now.
  for (const c of state.combatants) {
    if (c.type === "pc") continue;
    if (c.action_uses) continue;
    const seeded = initActionUses(c.actions);
    if (seeded) c.action_uses = seeded;
  }

  // Apply initiative overrides from roster
  for (const [id, init] of rosterInits) {
    const combatant = state.getCombatant(id);
    if (combatant) combatant.init = init;
  }

  // Apply zone overrides from the roster screen (NPCs whose authored zone
  // changed, or PCs/guests via the same per-row select).
  if (rosterZones) {
    for (const [id, zoneId] of rosterZones) {
      const combatant = state.getCombatant(id);
      if (combatant) combatant.zone = { id: zoneId };
    }
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

  // Show the sticky bar. In normal mode the post-start file write re-renders
  // the block and triggers this anyway; in practice mode there's no write, so
  // this is what makes the bar appear.
  state.onActivate?.();
}

/** Scan all combatants for actions with active_at_start effects and apply them as tags.
 *  Skips effects that already have a matching tag (for resume after pause). */
function applyStartEffects(state: EncounterState): void {
  for (const combatant of state.combatants) {
    const actions = combatant.actions ?? [];
    for (const action of actions) {
      if (typeof action === "string") continue;
      // Resolve `parent` so an inline override inherits the library entry's
      // active_at_start effects too.
      const resolved = resolveActionRef(action) ?? action;
      const effects = resolved.effects ?? [];
      for (const effect of effects) {
        if (!effect.active_at_start) continue;
        if (effect.type !== "tag" && effect.type !== "heal" && effect.type !== "damage") continue;
        const tagName = effect.name ?? resolved.name;
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

  // Reset per-turn rider uses (Sneak Attack etc) at the start of the
  // carrier's turn so they're available for this turn's commit.
  if (actor.riders && actor.rider_uses) {
    for (const r of actor.riders) {
      if (r.uses?.per === "turn" && actor.rider_uses[r.name]) {
        actor.rider_uses[r.name].current = actor.rider_uses[r.name].max;
      }
    }
  }

  // Reset per-turn action uses (e.g. abilities that recharge each turn).
  // String action refs are resolved against the library to find the cap.
  if (actor.actions && actor.action_uses) {
    for (const a of actor.actions) {
      const resolved = resolveActionRef(a);
      if (!resolved) continue;
      if (resolved.uses?.per === "turn" && actor.action_uses[resolved.name]) {
        actor.action_uses[resolved.name].current = actor.action_uses[resolved.name].max;
      }
    }
  }

  // Expire any unfired readied action. RAW: the readied action is lost at the
  // start of the readier's next turn. The snapshot is preserved on the log
  // entry so a rewind can restore it.
  if (actor.readied_action) {
    const snapshot = actor.readied_action;
    state.log.push({
      readied_expired: {
        by: actor.id,
        via: snapshot.via || (snapshot.isSpell ? "a spell" : "an action"),
        snapshot,
      },
    });
    actor.readied_action = undefined;
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

/** Roll the encounter back to its authored starting state, in memory only, by
 *  rewinding the log in reverse order. Every state mutation made during the
 *  encounter is recorded in the log; replaying it backward returns the
 *  encounter to its pre-start shape. PCs (added at start time) are removed;
 *  NPCs/objects authored in the YAML remain. Does NOT flush or touch practice
 *  mode; shared by the user-facing reset and by practice-mode entry (which
 *  needs a clean roster without writing or leaving practice). */
export function rewindToAuthored(state: EncounterState): void {
  // Rewind the log in reverse order. This handles damage restoration, tag
  // removal, counter decrement, ack un-fire, spawn removal, etc.
  rewindAll(state);

  state.active = false;
  state.round = 0;
  state.currentTurn = null;
  state.currentTurnLogIndex = -1;
  state.lastTargetIds = [];
  state.log = [];
  state.activeObligations = [];
  state.swappedActor = null;
  state.activeAction = null;

  // PCs are added at encounter start; they should not survive a reset.
  // NPCs and objects that survived rewind keep their (now authored) state.
  state.combatants = state.combatants.filter(
    (c) => c.type === "npc" || c.type === "object",
  );

  // Belt-and-suspenders: rewind handles each ack_rung and counter entry, but
  // an encounter that was never run still has fresh counters to ensure.
  for (const counter of state.counters) {
    counter.current = 0;
    for (const rung of counter.ladder ?? []) {
      rung.fired = false;
    }
  }

  // Restore any cleared transient PC state on NPCs that rewind couldn't undo
  // (e.g. PCs that were removed already have nothing to clear here).
  for (const c of state.combatants) {
    c.temp_hp = 0;
    c.conditions = [];
    c.concentration = null;
    if (c.type !== "object") c.tags = [];
    if (c.legendary_actions) {
      c.legendary_actions.current = c.legendary_actions.max;
    }
    if (c.spell_slots) {
      for (const slot of Object.values(c.spell_slots)) slot.current = slot.max;
    }
    if (c.hp && (c.type === "npc" || c.type === "object")) {
      c.hp.current = c.hp.max;
    }
  }
}

/** Reset the encounter to its authored starting state and persist. A reset
 *  triggered during a practice run instead ends practice: the file was never
 *  written, so exitPractice() restores the pre-practice state and hides the bar
 *  (there's nothing to roll back on disk). */
export async function resetEncounter(state: EncounterState): Promise<void> {
  if (state.practiceMode) {
    state.exitPractice();
    return;
  }
  rewindToAuthored(state);
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
