import type { EncounterState } from "./encounter-state.svelte";
import type { LogEntry } from "../types/actions";

/** A reverse operation: given a log entry, undo its effects on encounter state.
 *  Returns true if the entry was meaningfully reversed, false if it was a
 *  no-op (e.g. structural flow-control entries, or entries we can't reverse). */
export function rewindEntry(state: EncounterState, entry: any): boolean {
  if (entry.attack) {
    if (entry.attack.failed) return false; // Failed attack had no state effect
    for (const t of entry.attack.tgt ?? []) {
      if (!t.dmg || t.dmg.length === 0) continue;
      const total = t.dmg.reduce((s: number, d: any) => s + (d.n ?? 0), 0);
      const c = state.getCombatant(t.who);
      if (!c) continue;
      if ((c.type === "npc" || c.type === "object") && c.hp) {
        c.hp.current = Math.min(c.hp.current + total, c.hp.max);
        if (c.hp.current > 0) {
          c.conditions = c.conditions.filter((x) => x !== "dead");
        }
      } else if (c.type === "pc") {
        c.damage_taken = Math.max(0, (c.damage_taken ?? 0) - total);
      }
    }
    return true;
  }

  if (entry.heal) {
    for (const t of entry.heal.tgt ?? []) {
      const c = state.getCombatant(t.who);
      if (!c) continue;
      if ((c.type === "npc" || c.type === "object") && c.hp) {
        c.hp.current = Math.max(0, c.hp.current - t.hp);
      } else if (c.type === "pc") {
        c.damage_taken = (c.damage_taken ?? 0) + t.hp;
      }
    }
    return true;
  }

  if (entry.condition) {
    for (const targetId of entry.condition.tgt ?? []) {
      const c = state.getCombatant(targetId);
      if (!c) continue;
      for (const cond of entry.condition.conditions ?? []) {
        c.conditions = c.conditions.filter((x) => x !== cond);
      }
    }
    return true;
  }

  if (entry.tag) {
    const ids: string[] | undefined = entry.tag.ids;
    const tgts: string[] = entry.tag.tgt ?? [];
    if (ids && ids.length === tgts.length) {
      // Precise removal by id
      for (let i = 0; i < tgts.length; i++) {
        const c = state.getCombatant(tgts[i]);
        if (!c) continue;
        c.tags = c.tags.filter((t) => t.id !== ids[i]);
      }
    } else {
      // Best-effort fallback: match by name + source
      for (const targetId of tgts) {
        const c = state.getCombatant(targetId);
        if (!c) continue;
        c.tags = c.tags.filter(
          (t) => !(t.name === entry.tag.name && t.source === entry.tag.by),
        );
      }
    }
    return true;
  }

  if (entry.move) {
    const c = state.getCombatant(entry.move.by);
    if (c) {
      if (entry.move.fled) {
        c.conditions = c.conditions.filter((x) => x !== "fled");
      } else {
        c.zone = entry.move.from ?? undefined;
      }
    }
    return true;
  }

  if (entry.add_combatant) {
    state.combatants = state.combatants.filter((c) => c.id !== entry.add_combatant.who);
    return true;
  }

  if (entry.death) {
    const c = state.getCombatant(entry.death.who);
    if (c) c.conditions = c.conditions.filter((x) => x !== "dead");
    return true;
  }

  if (entry.effect_ends) {
    // Best-effort: re-add the condition by name if it looks like one. We don't
    // have full tag info to reconstruct a tag, so re-adding tags is skipped;
    // the cascade typically undoes the `effect_ends` together with the action
    // that caused the effect to end (e.g. a Dismiss), so this is rare.
    return false;
  }

  if (entry.counter) {
    const counter = state.getCounter(entry.counter.id);
    if (counter) {
      counter.current = Math.max(0, counter.current - (entry.counter.delta ?? 0));
    }
    return true;
  }

  if (entry.ack_rung) {
    const counter = state.getCounter(entry.ack_rung.counter);
    const rung = counter?.ladder?.[entry.ack_rung.rungIndex];
    if (rung) rung.fired = false;
    return true;
  }

  if (entry.consume) {
    const c = state.getCombatant(entry.consume.by);
    if (!c) return false;
    const delta = entry.consume.delta ?? 1;
    const bucket = entry.consume.kind === "rider" ? c.rider_uses : c.action_uses;
    if (bucket && bucket[entry.consume.name]) {
      const slot = bucket[entry.consume.name];
      slot.current = Math.min(slot.max, slot.current + delta);
    }
    return true;
  }

  if (entry.readied) {
    // Undoing the "ready" itself: the actor never held this action, so clear
    // the marker if it's still pending. (If they already fired, the bar
    // commit cleared it; nothing to do.)
    const c = state.getCombatant(entry.readied.by);
    if (c) c.readied_action = undefined;
    return true;
  }

  if (entry.readied_expired) {
    // Undoing the auto-expiration: restore the snapshot so the readied action
    // is once again pending. The snapshot was preserved on the log entry for
    // exactly this purpose.
    const c = state.getCombatant(entry.readied_expired.by);
    if (c && entry.readied_expired.snapshot) {
      c.readied_action = entry.readied_expired.snapshot;
    }
    return true;
  }

  if (entry.death_save) {
    const c = state.getCombatant(entry.death_save.who);
    if (!c) return false;
    const prev = entry.death_save.prev;
    if (entry.death_save.kind === "downed") {
      // Undo the initial down: clear the tracker and lift unconscious.
      c.death_saves = undefined;
      c.conditions = c.conditions.filter((x) => x !== "unconscious");
    } else if (entry.death_save.kind === "dead") {
      // Undo death: restore counts (prev was 2 failures, the third was
      // crossed in the original recordDeathSave call which logged its own
      // entry before this dead-marker), lift the "dead" condition, restore
      // unconscious.
      if (prev) c.death_saves = { successes: prev.successes, failures: prev.failures, stable: prev.stable };
      c.conditions = c.conditions.filter((x) => x !== "dead");
      if (!c.conditions.includes("unconscious")) c.conditions.push("unconscious");
    } else if (entry.death_save.kind === "revived") {
      // Undo revive: re-put the tracker and the unconscious condition.
      if (prev) c.death_saves = { successes: prev.successes, failures: prev.failures, stable: prev.stable };
      if (!c.conditions.includes("unconscious")) c.conditions.push("unconscious");
    } else if (prev && c.death_saves) {
      // pass / fail / crit_fail / dmg_fail / stabilized: roll the counts
      // back to their prior values.
      c.death_saves.successes = prev.successes;
      c.death_saves.failures = prev.failures;
      c.death_saves.stable = prev.stable;
    }
    return true;
  }

  // Structural entries (start_combat, end_combat, start_round, start_turn,
  // save, note, remove_combatant, buff, debuff) are no-ops for rewind.
  return false;
}

/** Collect the set of identifiers that `entry` introduces into the encounter,
 *  i.e. things that later entries might reference. */
function introduces(entry: any): {
  combatantIds: string[];
  tagIds: string[];
  counterId?: string;
  counterTicked?: boolean;
  ackedCounter?: string;
} {
  if (entry.add_combatant) {
    return { combatantIds: [entry.add_combatant.who], tagIds: [] };
  }
  if (entry.tag) {
    return { combatantIds: [], tagIds: entry.tag.ids ?? [] };
  }
  if (entry.counter) {
    return {
      combatantIds: [],
      tagIds: [],
      counterId: entry.counter.id,
      counterTicked: true,
    };
  }
  if (entry.ack_rung) {
    return {
      combatantIds: [],
      tagIds: [],
      counterId: entry.ack_rung.counter,
      ackedCounter: entry.ack_rung.counter,
    };
  }
  return { combatantIds: [], tagIds: [] };
}

/** Collect identifiers that `entry` references (and thus depends on). */
function references(entry: any): {
  combatantIds: string[];
  tagIds: string[];
  counterId?: string;
  isAck?: boolean;
} {
  const out = {
    combatantIds: [] as string[],
    tagIds: [] as string[],
    counterId: undefined as string | undefined,
    isAck: false,
  };
  if (entry.attack) {
    if (entry.attack.by) out.combatantIds.push(entry.attack.by);
    for (const t of entry.attack.tgt ?? []) {
      if (t.who) out.combatantIds.push(t.who);
    }
  } else if (entry.heal) {
    if (entry.heal.by) out.combatantIds.push(entry.heal.by);
    for (const t of entry.heal.tgt ?? []) {
      if (t.who) out.combatantIds.push(t.who);
    }
  } else if (entry.buff || entry.debuff) {
    const e = entry.buff ?? entry.debuff;
    if (e.by) out.combatantIds.push(e.by);
    for (const id of e.tgt ?? []) out.combatantIds.push(id);
  } else if (entry.condition) {
    if (entry.condition.by) out.combatantIds.push(entry.condition.by);
    for (const id of entry.condition.tgt ?? []) out.combatantIds.push(id);
  } else if (entry.tag) {
    if (entry.tag.by) out.combatantIds.push(entry.tag.by);
    for (const id of entry.tag.tgt ?? []) out.combatantIds.push(id);
  } else if (entry.move) {
    if (entry.move.by) out.combatantIds.push(entry.move.by);
  } else if (entry.death) {
    if (entry.death.who) out.combatantIds.push(entry.death.who);
  } else if (entry.effect_ends) {
    if (entry.effect_ends.on) out.combatantIds.push(entry.effect_ends.on);
  } else if (entry.start_turn) {
    if (entry.start_turn.who) out.combatantIds.push(entry.start_turn.who);
  } else if (entry.remove_combatant) {
    if (entry.remove_combatant.who) out.combatantIds.push(entry.remove_combatant.who);
  } else if (entry.save) {
    if (entry.save.who) out.combatantIds.push(entry.save.who);
  } else if (entry.note) {
    if (entry.note.by) out.combatantIds.push(entry.note.by);
  } else if (entry.counter) {
    out.counterId = entry.counter.id;
    if (entry.counter.by) out.combatantIds.push(entry.counter.by);
  } else if (entry.ack_rung) {
    out.counterId = entry.ack_rung.counter;
    out.isAck = true;
  } else if (entry.readied) {
    if (entry.readied.by) out.combatantIds.push(entry.readied.by);
    for (const id of entry.readied.tgt ?? []) out.combatantIds.push(id);
  } else if (entry.readied_expired) {
    if (entry.readied_expired.by) out.combatantIds.push(entry.readied_expired.by);
  }
  return out;
}

/** Indices of log entries that depend, transitively, on what `fromIdx` introduced.
 *  Returns indices in increasing order (not including fromIdx itself). */
export function findDownstream(log: LogEntry[], fromIdx: number): number[] {
  if (fromIdx < 0 || fromIdx >= log.length) return [];

  const seed = introduces(log[fromIdx]);
  const liveCombatants = new Set<string>(seed.combatantIds);
  const liveTags = new Set<string>(seed.tagIds);
  // Counter ticks: any later ack_rung on this counter is downstream.
  const tickedCounters = new Set<string>();
  if (seed.counterTicked && seed.counterId) tickedCounters.add(seed.counterId);
  // An ack: any later add_combatant immediately following (no intervening
  // start_turn / start_round) is treated as caused by this ack.
  let pendingAckedCounter: string | null = seed.ackedCounter ?? null;

  const result: number[] = [];

  for (let i = fromIdx + 1; i < log.length; i++) {
    const e = log[i];
    const refs = references(e);
    let isDownstream = false;

    if (refs.combatantIds.some((id) => liveCombatants.has(id))) isDownstream = true;
    if (refs.tagIds.some((id) => liveTags.has(id))) isDownstream = true;
    if (refs.counterId && tickedCounters.has(refs.counterId) && refs.isAck) {
      isDownstream = true;
    }
    if ((e as any).add_combatant && pendingAckedCounter) {
      // Spawn entries following an ack (until the next structural break) cascade
      isDownstream = true;
    }

    // Flow-control entries break the implicit ack -> spawn association.
    if ((e as any).start_turn || (e as any).start_round
        || (e as any).start_combat || (e as any).end_combat) {
      pendingAckedCounter = null;
    }

    if (isDownstream) {
      result.push(i);
      // Transitively include what this entry introduces
      const intro = introduces(e);
      for (const id of intro.combatantIds) liveCombatants.add(id);
      for (const id of intro.tagIds) liveTags.add(id);
      if (intro.counterTicked && intro.counterId) tickedCounters.add(intro.counterId);
      if (intro.ackedCounter) pendingAckedCounter = intro.ackedCounter;
    }
  }

  return result;
}

/** Short summary of a log entry for the cascade warning UI. */
export function entryKindLabel(entry: any): string {
  if (entry.attack) return entry.attack.failed ? "miss" : "attack";
  if (entry.heal) return "heal";
  if (entry.buff) return "buff";
  if (entry.debuff) return "debuff";
  if (entry.condition) return "condition";
  if (entry.tag) return "tag";
  if (entry.save) return "save";
  if (entry.note) return "note";
  if (entry.death) return "death";
  if (entry.effect_ends) return "effect ends";
  if (entry.add_combatant) return "add combatant";
  if (entry.remove_combatant) return "remove combatant";
  if (entry.move) return "move";
  if (entry.counter) return "counter tick";
  if (entry.ack_rung) return "ack rung";
  if (entry.readied) return "readied";
  if (entry.readied_expired) return "readied expired";
  if (entry.start_turn) return "start turn";
  if (entry.start_round) return "start round";
  return "entry";
}

/** Rewind the entry at `idx` and every downstream entry, then remove them
 *  from the log. Returns the number of entries removed. */
export function deleteEntryWithCascade(state: EncounterState, idx: number): number {
  const downstream = findDownstream(state.log, idx);
  const toRemove = [idx, ...downstream].sort((a, b) => b - a); // descending

  for (const i of toRemove) {
    rewindEntry(state, state.log[i]);
  }

  // Remove in descending order so earlier indices stay valid.
  for (const i of toRemove) {
    state.log.splice(i, 1);
  }

  // Adjust currentTurnLogIndex if needed
  let shifted = 0;
  for (const i of toRemove) {
    if (state.currentTurnLogIndex > i) shifted++;
  }
  if (shifted > 0) state.currentTurnLogIndex -= shifted;

  state.flush();
  return toRemove.length;
}

/** Walk the log backward and rewind every entry. Use for a full reset. */
export function rewindAll(state: EncounterState): void {
  for (let i = state.log.length - 1; i >= 0; i--) {
    rewindEntry(state, state.log[i]);
  }
}
