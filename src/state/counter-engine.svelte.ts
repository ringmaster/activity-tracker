import type { EncounterState } from "./encounter-state.svelte";
import type { Combatant, LadderRung } from "../types/encounter";
import { addCombatant } from "./combat-engine.svelte";
import { toSlug } from "../utils/id-generator";
import { nowTimestamp } from "../utils/time";

/** Increment a counter's `current` by delta (default +1) and log the tick.
 *  Returns true if at least one ladder rung is now due (current >= at && !fired). */
export function tickCounter(
  state: EncounterState,
  counterId: string,
  delta: number = 1,
  by?: string,
  via?: string,
): boolean {
  const counter = state.getCounter(counterId);
  if (!counter) return false;

  counter.current = Math.max(0, counter.current + delta);

  state.logInsert({
    counter: {
      id: counterId,
      delta,
      by,
      via,
      at: nowTimestamp(),
    },
  });

  const dueRungs = (counter.ladder ?? []).filter(
    (r) => counter.current >= r.at && !r.fired,
  );
  state.flush();
  return dueRungs.length > 0;
}

/** Choose an id for a newly-spawned combatant that doesn't collide with any
 *  existing combatant. Uses the authored id if free; otherwise slugifies the
 *  name and appends -2, -3, ... until unique. */
function reserveSpawnId(
  state: EncounterState,
  authoredId: string | undefined,
  name: string,
): string {
  const taken = new Set(state.combatants.map((c) => c.id));
  const desired = authoredId ?? toSlug(name);
  if (!taken.has(desired)) return desired;
  let n = 2;
  while (taken.has(`${desired}-${n}`)) n++;
  return `${desired}-${n}`;
}

/** Acknowledge a fired-but-unacked rung. Marks fired:true (latched). With
 *  `skipped: true`, no consequences fire (no spawns, no banner text in the
 *  log summary) but the ack is still recorded so the rung crossing remains
 *  reconstructible. Without `skipped`, spawns add_combatants and the log
 *  summary surfaces the banner prose for narrative reconstruction. The ack
 *  is logged before the spawns so rewinding the ack cascades the spawns. */
export function ackRung(
  state: EncounterState,
  counterId: string,
  rungIndex: number,
  options: { skipped?: boolean } = {},
): void {
  const counter = state.getCounter(counterId);
  if (!counter?.ladder) return;
  const rung: LadderRung | undefined = counter.ladder[rungIndex];
  if (!rung || rung.fired) return;

  rung.fired = true;

  state.logInsert({
    ack_rung: {
      counter: counterId,
      rungIndex,
      at: nowTimestamp(),
      ...(options.skipped ? { skipped: true } : {}),
    },
  });

  if (options.skipped) {
    state.flush();
    return;
  }

  for (const entry of rung.add_combatants ?? []) {
    const id = reserveSpawnId(state, entry.id, entry.name);
    const combatant: Combatant = {
      id,
      name: entry.name,
      type: entry.type,
      init: entry.init ?? 10,
      temp_hp: entry.temp_hp ?? 0,
      conditions: entry.conditions ?? [],
      tags: [],
      concentration: entry.concentration ?? null,
    };
    if (entry.hp) combatant.hp = entry.hp;
    if (entry.ac != null) combatant.ac = entry.ac;
    if (entry.statblock) combatant.statblock = entry.statblock;
    if (entry.actions) combatant.actions = entry.actions;
    if (entry.spells) combatant.spells = entry.spells;
    if (entry.behavior) combatant.behavior = entry.behavior;
    if (entry.zone) combatant.zone = entry.zone;
    if (entry.friendly != null) combatant.friendly = entry.friendly;
    addCombatant(state, combatant);
  }

  state.flush();
}
