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
    save?: { stat: string; dc: number; on_pass?: string };
    tgt: AttackTargetResult[];
  };
}

export interface HealEntry {
  heal: {
    by: string;
    via?: string;
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
  | MoveEntry;
