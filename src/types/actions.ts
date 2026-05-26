import type { DamageComponent, ZonePosition } from "./encounter";

export interface StartCombatEntry {
  start_combat: { at: string };
}

export interface EndCombatEntry {
  end_combat: { at: string };
}

export interface StartRoundEntry {
  start_round: { n: number; at: string };
}

export interface StartTurnEntry {
  start_turn: { who: string; init: number; at: string };
}

export interface AttackTargetResult {
  who: string;
  hit?: "full" | "half" | "zero";
  dmg?: DamageComponent[];
}

export interface AttackEntry {
  attack: {
    by: string;
    via: string;
    verb?: string;
    spell?: boolean;
    failed?: boolean;
    /** True when this attack/cast is the commit of a previously-held
     *  readied action. Pairs with the earlier `readied` entry to close the
     *  hold→fire loop; the log summary renders "(readied)" after the
     *  verb. Display-only; rewind treats this entry like any other. */
    from_readied?: boolean;
    /** Set when this attack is a resolved deferred effect (e.g. a save
     *  tag's damage). The summary uses a different sentence shape. */
    resolved?: boolean;
    save?: { stat: string; dc: number; on_pass?: string };
    tgt: AttackTargetResult[];
  };
}

export interface HealEntry {
  heal: {
    by: string;
    via?: string;
    /** True when this heal is the commit of a previously-held readied
     *  action. See AttackEntry.from_readied. */
    from_readied?: boolean;
    resolved?: boolean;
    tgt: { who: string; hp: number }[];
  };
}

export interface BuffEntry {
  buff: {
    by: string;
    via: string;
    tgt: string[];
    slot?: number;
    conc?: boolean;
  };
}

export interface DebuffEntry {
  debuff: {
    by: string;
    via: string;
    tgt: string[];
    slot?: number;
    conc?: boolean;
  };
}

export interface SaveEntry {
  save: {
    who: string;
    stat: string;
    dc: number;
    result: "pass" | "fail";
    for?: string;
  };
}

export interface NoteEntry {
  note: {
    by: string;
    text: string;
  };
}

export interface DeathEntry {
  death: {
    who: string;
    at: string;
  };
}

export interface EffectEndsEntry {
  effect_ends: {
    what: string;
    on: string;
    reason: string;
  };
}

export interface AddCombatantEntry {
  add_combatant: {
    who: string;
    name: string;
    init: number;
    at: string;
  };
}

export interface RemoveCombatantEntry {
  remove_combatant: {
    who: string;
    reason?: string;
    at: string;
  };
}

export interface ConditionEntry {
  condition: {
    by: string;
    tgt: string[];
    conditions: string[];
    via?: string;
  };
}

export interface TagEntry {
  tag: {
    by: string;
    tgt: string[];
    name: string;
    note?: string;
    via?: string;
    /** Per-target tag ids, in the same order as `tgt`. Enables precise undo. */
    ids?: string[];
  };
}

export interface MoveEntry {
  move: {
    by: string;
    from?: ZonePosition | null;
    to?: ZonePosition;
    fled?: boolean;
  };
}

export interface CounterEntry {
  counter: {
    id: string;
    delta: number;
    by?: string;
    via?: string;
    at: string;
  };
}

export interface AckRungEntry {
  ack_rung: {
    counter: string;
    rungIndex: number;
    at: string;
    /** When true, the rung was dismissed without applying its consequences
     *  (no banner text in the prose summary, no add_combatants spawned). */
    skipped?: boolean;
  };
}

/** A single use of a limited-use ability (rider or action) was consumed by
 *  `by`. The named bucket on `by.action_uses` (kind: "action") or
 *  `by.rider_uses` (kind: "rider") was decremented by `delta` (default 1).
 *  Logged so rewind can credit the use back when the entry is undone. */
export interface ConsumeEntry {
  consume: {
    by: string;
    kind: "rider" | "action";
    name: string;
    delta?: number;
  };
}

/** A held action: the actor configured an action but committed only to wait
 *  on a trigger. The snapshot carries the full bar state for hydration when
 *  the DM resumes via the actor dropdown. Stored in the log so the rewind
 *  cascade can restore `combatant.readied_action` if this entry is undone. */
export interface ReadiedEntry {
  readied: {
    by: string;
    via: string;
    isSpell?: boolean;
    verb?: string;
    /** Target IDs at ready time, for the prose summary. */
    tgt?: string[];
    /** Full ReadiedActionSnapshot (typed `any` here to avoid a circular
     *  import; the schema lives in encounter.ts). */
    snapshot: any;
  };
}

/** Auto-logged when a combatant's turn starts and they still have an unfired
 *  readied action. The snapshot is preserved so a rewind can restore it. */
export interface ReadiedExpiredEntry {
  readied_expired: {
    by: string;
    via: string;
    snapshot?: any;
  };
}

/** A PC's death-save state changed. `kind` names the transition:
 *  - downed: PC dropped to 0 HP / was manually marked down. Initialized
 *    counts come in as 0/0.
 *  - pass / fail / crit_fail: a death save roll. `successes` / `failures`
 *    are the values AFTER applying the result. crit_fail = +2 failures.
 *  - dmg_fail: damage taken while down auto-applied a failure. Same shape
 *    as `fail`; separate kind so the rewind can credit it back even when
 *    the originating attack entry is also undone (each carries its own
 *    delta).
 *  - stabilized: stable: true was set on the PC (DM hand-stabilize, Spare
 *    the Dying, etc.).
 *  - revived: counts cleared and unconscious removed (heal lands or
 *    nat-20 self-revive). HP delta lives on the paired heal entry; this
 *    one is structural.
 *  - dead: 3 failures reached; "dead" condition applied. Counts cleared. */
export interface DeathSaveEntry {
  death_save: {
    who: string;
    kind: "downed" | "pass" | "fail" | "crit_fail" | "dmg_fail" | "stabilized" | "revived" | "dead";
    /** Counts BEFORE this entry's transition applied (so rewind can restore
     *  them precisely without needing to know which kind decremented what). */
    prev?: { successes: number; failures: number; stable?: boolean };
  };
}

export type LogEntry =
  | StartCombatEntry
  | EndCombatEntry
  | StartRoundEntry
  | StartTurnEntry
  | AttackEntry
  | HealEntry
  | BuffEntry
  | DebuffEntry
  | SaveEntry
  | NoteEntry
  | DeathEntry
  | EffectEndsEntry
  | AddCombatantEntry
  | RemoveCombatantEntry
  | ConditionEntry
  | TagEntry
  | MoveEntry
  | CounterEntry
  | AckRungEntry
  | ConsumeEntry
  | ReadiedEntry
  | ReadiedExpiredEntry
  | DeathSaveEntry;
