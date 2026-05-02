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

/** An effect that auto-populates the action bar when this action is selected. */
export interface ActionEffect {
  type: "tag" | "condition" | "concentration" | "damage" | "heal";
  /** For tag/condition: the name of the tag or condition to apply. */
  name?: string;
  /** Who receives the effect: "target" | "self" | "enemy" | "ally". */
  on?: "target" | "self" | "enemy" | "ally";
  /** Trigger timing. Without trigger, damage applies immediately. */
  trigger?: TagTrigger;
  /** Reminder note shown in banners. */
  note?: string;
  /** For deferred damage: dice expression (display only). */
  dice?: string;
  /** For deferred damage: damage type. */
  damageType?: string;
  /** For deferred damage: save info. */
  save?: { stat: string; onSave?: string };
}

export interface CombatAction {
  name: string;
  type: string;
  /** Custom verb for the log, e.g., "grapples", "shoves". */
  verb?: string;
  dmg?: AuthoredDamage[];
  save?: SaveInfo;
  area?: string;
  /** Structured effects that auto-populate the bar on selection. */
  effects?: ActionEffect[];
  /** Legacy string effect description. */
  effect?: string;
  note?: string;
  slot?: number;
  concentration?: boolean;

  // --- Display/reference fields (from SRD or authored) ---
  desc?: string;
  higher_level?: string;
  level?: number;
  school?: string;
  casting_time?: string;
  duration?: string;
  components?: string;
  material?: string;
  ritual?: boolean;
  range?: string;
  damageType?: string;
  dice?: string;
  saveStat?: string;
  saveOnSuccess?: string;
  areaOfEffect?: string;
  classes?: string;

  /** Runtime-only: which library file this action was loaded from. */
  _source?: string;
}

export type TagTrigger = "start_of_turn" | "end_of_turn" | "when_damaged" | "on_ally_turn" | "on_enemy_turn";

export interface CombatTag {
  id: string;
  name: string;
  source?: string;
  note?: string;
  trigger?: TagTrigger;
  onTrigger?: string;
  autoRemove?: "on_save" | "on_source_end" | "manual";
  /** Deferred damage/heal: dice expression for display. */
  dice?: string;
  /** Deferred damage: damage type. */
  damageType?: string;
  /** Deferred damage: save info. */
  save?: { stat: string; onSave?: string };
  /** Deferred heal flag. */
  isHeal?: boolean;
  /** Who the deferred effect resolves against (target combatant ID). */
  resolveTarget?: string;
  /** Groups tags from the same action commit for cascade cleanup. */
  castId?: string;
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
  tags: CombatTag[];
  concentration: { spell: string; line_ref: number } | null;
  spell_slots?: Record<number, { current: number; max: number }>;
  legendary_actions?: { max: number; current: number } | null;
  /** Actions known by this combatant. Strings are resolved from the library. */
  actions?: (string | CombatAction)[];
  /** Spells known by this combatant. Strings are looked up from library, then SRD. */
  spells?: (string | Spell)[];
  behavior?: Behavior;
  recharge?: Record<string, boolean>;
  hidden?: boolean;
  /** NPCs marked friendly group with the party; PCs marked hostile group with NPCs. */
  friendly?: boolean;
}

/** The authored shape before expansion; `count` triggers multi-combatant generation. */
export interface AuthoredCombatant {
  id?: string;
  name: string;
  type: "npc" | "pc";
  statblock?: string;
  init?: number | null;
  ac?: number;
  count?: number;
  hp?: { current: number; max: number };
  damage_taken?: number;
  temp_hp?: number;
  conditions?: string[];
  concentration?: { spell: string; line_ref: number } | null;
  /** Authored as plain numbers (max slots); normalized to {current, max} at load. */
  spell_slots?: Record<number, number | { current: number; max: number }>;
  legendary_actions?: { max: number; current: number } | null;
  actions?: (string | CombatAction)[];
  spells?: (string | Spell)[];
  behavior?: Behavior;
  friendly?: boolean;
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
  verb?: string;
  range?: string;
  concentration?: boolean;
  duration_rounds?: number;
  obligation?: SpellObligation;
  save?: SaveInfo;
  dmg?: DamageComponent[];
  effects?: ActionEffect[];
  effect?: string;
}

export interface EncounterData {
  encounter: string;
  active: boolean;
  round: number;
  current_turn: string | null;
  combatants: Combatant[];
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
  log?: LogEntry[];
  active_obligations?: ActiveObligation[];
}
