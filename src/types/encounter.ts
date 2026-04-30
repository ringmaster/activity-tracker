import type { LogEntry } from "./actions";
import type { ActiveObligation } from "./obligations";

export interface DamageComponent {
  n: number;
  type: string;
}

/** Damage as authored in YAML actions; `dice` is a display string like "2d6+2". */
export interface AuthoredDamage {
  dice: string;
  type: string;
}

export interface SaveInfo {
  stat: string | string[];
  dc: number;
  on_pass?: string;
}

export interface ExtraAction {
  name: string;
  type: string;
  area?: string;
  save?: SaveInfo;
  effect?: string;
  dmg?: AuthoredDamage[];
}

export interface SpellPreference {
  when: string;
  cast: string;
}

export interface Behavior {
  motive?: string;
  priority?: string;
  flee_at?: number;
  coordinates_with?: string[];
  movement?: string;
  notes?: string;
  extra_actions?: ExtraAction[];
  spell_preferences?: SpellPreference[];
}

export interface CombatAction {
  name: string;
  type: string;
  dmg?: AuthoredDamage[];
  save?: SaveInfo;
  area?: string;
  effect?: string;
  note?: string;
  slot?: number;
}

export interface Combatant {
  id: string;
  name: string;
  type: "npc" | "pc";
  statblock?: string;
  init: number | null;
  ac?: number;
  hp?: { current: number; max: number };
  damage_taken?: number;
  temp_hp: number;
  conditions: string[];
  concentration: { spell: string; line_ref: number } | null;
  spell_slots?: Record<number, { current: number; max: number }>;
  legendary_actions?: { max: number; current: number } | null;
  actions?: CombatAction[];
  behavior?: Behavior;
  recharge?: Record<string, boolean>;
  hidden?: boolean;
}

/** The authored shape before expansion; `count` triggers multi-combatant generation. */
export interface AuthoredCombatant {
  id?: string;
  name: string;
  type: "npc" | "pc";
  statblock?: string;
  init?: number | null;
  count?: number;
  hp?: { current: number; max: number };
  damage_taken?: number;
  temp_hp?: number;
  conditions?: string[];
  concentration?: { spell: string; line_ref: number } | null;
  /** Authored as plain numbers (max slots); normalized to {current, max} at load. */
  spell_slots?: Record<number, number | { current: number; max: number }>;
  legendary_actions?: { max: number; current: number } | null;
  behavior?: Behavior;
}

export interface SpellObligation {
  target: "affected" | "enemies_in_range" | "allies_in_range" | "specific";
  trigger:
    | "start_of_turn"
    | "end_of_turn"
    | "when_damaged"
    | "init_20"
    | "start_of_round";
  kind: "save" | "save_for_half" | "damage" | "custom";
  stat?: string | string[];
  dc?: number;
  dmg?: DamageComponent[];
  on_fail?: string;
  on_success?: string;
  on_save?: string;
}

export interface Spell {
  name: string;
  type: string;
  range?: string;
  concentration?: boolean;
  duration_rounds?: number;
  obligation?: SpellObligation;
  save?: SaveInfo;
  dmg?: DamageComponent[];
  effect?: string;
}

export interface EncounterData {
  encounter: string;
  active: boolean;
  round: number;
  current_turn: string | null;
  combatants: Combatant[];
  spells?: Record<string, Spell>;
  log: LogEntry[];
  active_obligations: ActiveObligation[];
}

/** The raw YAML shape before expansion (combatants may have `count`). */
export interface AuthoredEncounterData {
  encounter: string;
  active?: boolean;
  round?: number;
  current_turn?: string | null;
  combatants: AuthoredCombatant[];
  spells?: Record<string, Spell>;
  log?: LogEntry[];
  active_obligations?: ActiveObligation[];
}
