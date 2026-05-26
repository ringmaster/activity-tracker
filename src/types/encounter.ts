import type { LogEntry } from "./actions";
import type { ActiveObligation } from "./obligations";
import type { Rider } from "./party";

export interface DamageComponent {
  n: number;
  type: string;
  /** Optional label for the source of this damage component (e.g. "Sneak
   *  Attack"). Surfaces in the prose log as "15 sl + 7 sl (Sneak Attack)". */
  source?: string;
  /** How the target's defenses scaled this component. "n" is already the
   *  scaled value (halved on resisted, doubled on vulnerable, zero on
   *  immune); this annotation drives the prose marker only. */
  mitigation?: "resisted" | "vulnerable" | "immune";
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
  type: "tag" | "condition" | "concentration" | "damage" | "heal" | "counter";
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
  /** If true, this effect is auto-applied as a tag when the encounter starts. */
  active_at_start?: boolean;
  /** Limited uses for this effect's tag. */
  uses?: number;
  /** When to reset uses to max. "turn" = start of tag carrier's turn. */
  resetOn?: "turn";
  /** For type: "counter" — id of the counter to tick. Always +1 per application. */
  counter?: string;
}

export interface CombatAction {
  name: string;
  type: string;
  /** Custom verb for the log, e.g., "grapples", "shoves". */
  verb?: string;
  /** Attack roll bonus, e.g., 5 for "+5 to hit". */
  toHit?: number;
  dmg?: AuthoredDamage[];
  save?: SaveInfo;
  area?: string;
  /** Limited-use cap (Channel Divinity, Action Surge, Second Wind, ...). Same
   *  shape as the rider RiderUses. `per: turn` resets at the start of the
   *  actor's turn; `per: encounter` resets only on encounter reset. */
  uses?: { per: "turn" | "encounter"; count: number };
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

export type TagTrigger = "start_of_turn" | "end_of_turn" | "when_damaged" | "on_ally_turn" | "on_enemy_turn" | "when_targeted" | "when_destroyed";

export interface Zone {
  id: string;
  name: string;
}

export interface ZonePosition {
  id: string;
  preposition?: string;
}

export interface CombatTag {
  id: string;
  name: string;
  source?: string;
  note?: string;
  trigger?: TagTrigger;
  onTrigger?: string;
  autoRemove?: "on_save" | "on_source_end" | "manual" | "when_damaged";
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
  /** Limited uses. Resolve/use decrements current. Banner disables at 0. */
  uses?: { current: number; max: number };
  /** When to reset uses to max. "turn" = start of tag carrier's turn. Absent = never. */
  resetOn?: "turn";
}

export interface Combatant {
  id: string;
  name: string;
  type: "npc" | "pc" | "object";
  /** Free-text class/level summary shown beside the name (e.g. "Cleric 3"
   *  or "Rogue 2/Cleric 7/Monk 4"). Display-only; nothing mechanical reads
   *  it. Plumbed from PartyMember.class_level for PCs; NPCs typically omit. */
  class_level?: string;
  zone?: ZonePosition;
  statblock?: string;
  /** Damage types this combatant takes half of. Substring-matched against
   *  the incoming component's `type`, so an entry like
   *  "piercing from nonmagical attacks" (as it comes out of the Fantasy
   *  Statblocks bestiary) still matches a "piercing" attack — at the cost
   *  of not distinguishing magical vs nonmagical. Authored entries can
   *  override with a clean list to fix the precision. */
  resistances?: string[];
  /** Damage types this combatant ignores entirely (n -> 0). */
  immunities?: string[];
  /** Damage types this combatant takes double of. */
  vulnerabilities?: string[];
  init: number | null;
  ac?: number;
  /** Default attack roll bonus for this combatant's actions. */
  toHit?: number;
  /** Default spell attack bonus for this combatant's spells. */
  spellAttack?: number;
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
  /** Authored coaching hint shown as blue text under the bar on this combatant's turn. */
  turn_hint?: string;
  /** Rider abilities (Sneak Attack, Divine Smite, Cunning Hide, ...) that
   *  surface as toggle chips in the action bar. */
  riders?: Rider[];
  /** Runtime use counters per rider name. Initialized from rider.uses on
   *  encounter start; decremented on commit; reset at start of carrier's
   *  turn when rider.uses.per === "turn". */
  rider_uses?: Record<string, { current: number; max: number }>;
  /** Runtime use counters per action name. Initialized from action.uses on
   *  encounter start (resolved from the library for string action refs);
   *  decremented on commit; reset at start of actor's turn when
   *  action.uses.per === "turn". */
  action_uses?: Record<string, { current: number; max: number }>;
  /** A held/readied action waiting on a trigger. The actor dropdown surfaces
   *  this as a "{name} ready" button; clicking it swaps to this actor, opens
   *  the bar in the snapshot's preset, and hydrates fields from the snapshot
   *  so the DM can finish filling in damage rolls and commit. Auto-cleared at
   *  the start of this combatant's next turn (with a readied_expired log
   *  entry) if not fired. */
  readied_action?: ReadiedActionSnapshot;
  /** PC death save tracker. Set when the PC drops to 0 HP / is marked down;
   *  cleared on heal, stabilize, or revive (nat 20). 3 successes -> stable
   *  (counts stay, `stable: true`, no further saves expected); 3 failures
   *  -> dead (the "dead" condition is applied and death_saves is cleared by
   *  the dead handler). */
  death_saves?: { successes: number; failures: number; stable?: boolean };
}

/** Captured bar state at ready time. Hydrated back into ActionFields when the
 *  DM clicks the actor-dropdown ready button. effects/targets are stored as
 *  the same loose shapes ActionFields uses locally; the bar casts on read. */
export interface ReadiedActionSnapshot {
  preset: "attack" | "cast" | "heal";
  via: string;
  isSpell?: boolean;
  isConc?: boolean;
  spellKey?: string;
  verb?: string;
  /** SpellEffect[] as authored by the bar, sans the Ready chit itself. */
  effects?: any[];
  /** Target picks at ready time. The DM can adjust on fire. */
  targets?: Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>;
  /** Active rider names (Set serialized to array for JSON). */
  activeRiderNames?: string[];
  riderDamageValues?: Record<string, number>;
  autoTagIndices?: number[];
}

/** The authored shape before expansion; `count` triggers multi-combatant generation. */
export interface AuthoredCombatant {
  id?: string;
  name: string;
  type: "npc" | "pc" | "object";
  class_level?: string;
  zone?: ZonePosition;
  statblock?: string;
  /** Per-encounter override of damage type lists. When present, used as-is
   *  and the bestiary auto-lookup is skipped. */
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  init?: number | null;
  ac?: number;
  count?: number;
  hp?: { current: number; max: number };
  damage_taken?: number;
  temp_hp?: number;
  conditions?: string[];
  tags?: CombatTag[];
  concentration?: { spell: string; line_ref: number } | null;
  /** Authored as plain numbers (max slots); normalized to {current, max} at load. */
  spell_slots?: Record<number, number | { current: number; max: number }>;
  legendary_actions?: { max: number; current: number } | null;
  actions?: (string | CombatAction)[];
  spells?: (string | Spell)[];
  behavior?: Behavior;
  friendly?: boolean;
  turn_hint?: string;
  riders?: Rider[];
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

export interface LadderRung {
  /** Counter value at or above which this rung fires. */
  at: number;
  /** Banner text shown to the DM when the rung fires. */
  banner: string;
  /** Combatants spawned via the normal add-combatant flow when the rung is acked. */
  add_combatants?: AuthoredCombatant[];
  /** Tracker-managed. True once the DM has acknowledged the banner. Latched. */
  fired?: boolean;
}

export interface Counter {
  id: string;
  name: string;
  /** DM-facing description shown in the chip tooltip / inline view. */
  note?: string;
  /** When true, the counter also appears in the inline view for players. Default false (DM-only). */
  visible?: boolean;
  /** Runtime accumulator. Starts at 0. */
  current: number;
  /** Empty ladder = pure accumulator (no banners ever fire). */
  ladder?: LadderRung[];
}

/** Authored shape: `current` may be omitted (defaults to 0). */
export interface AuthoredCounter {
  id: string;
  name: string;
  note?: string;
  visible?: boolean;
  current?: number;
  ladder?: LadderRung[];
}

export interface EncounterData {
  encounter: string;
  active: boolean;
  round: number;
  current_turn: string | null;
  combatants: Combatant[];
  log: LogEntry[];
  active_obligations: ActiveObligation[];
  zones?: Zone[];
  prepositions?: string[];
  counters?: Counter[];
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
  zones?: Zone[];
  prepositions?: string[];
  counters?: AuthoredCounter[];
}
