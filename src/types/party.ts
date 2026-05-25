import type { ActionEffect, AuthoredDamage, DamageComponent, SaveInfo, Spell } from "./encounter";

export interface PartyAction {
  name: string;
  type: string;
  /** Damage components. Authored format uses `dice` strings; the encounter
   *  roster shape uses the same. The DamageComponent {n, type} form appears
   *  only in log entries. */
  dmg?: (DamageComponent | AuthoredDamage)[];
  save?: SaveInfo;
  slot?: number;
  note?: string;
  /** SRD range string ("Touch", "5 feet", "60ft", etc.). Read by the action
   *  bar's implicit-move check, so a "5 feet" weapon will suggest a move
   *  when the target is in another zone. */
  range?: string;
  verb?: string;
  toHit?: number;
  concentration?: boolean;
  effects?: ActionEffect[];
}

/** Conditions that must hold for a rider to appear on a selected action.
 *  Empty / absent `when:` means the rider is always available for actions
 *  the actor could perform. */
export interface RiderWhen {
  /** Only show this rider when the active preset is one of these
   *  (e.g. "attack", "cast", "heal"). */
  action_type?: string;
}

/** Limited-use rider; the count decrements when the rider commits and
 *  resets at the next turn boundary or encounter, depending on `per`. */
export interface RiderUses {
  per: "turn" | "encounter";
  count: number;
}

/** One piece of what a rider does when active. */
export interface RiderEffect {
  type: "damage" | "tag" | "condition";
  /** Display name (used as the source label on damage components and as the
   *  log via on tag/condition entries). Defaults to the rider's name. */
  name?: string;
  /** For damage: dice expression shown as a hint (e.g. "5d6"). */
  dice?: string;
  /** For damage: explicit damage type. Ignored when inherit_type is true. */
  damageType?: string;
  /** For damage: inherit the type from the riding action's first damage
   *  component (so Sneak Attack on slashing weapons logs as slashing). */
  inherit_type?: boolean;
  /** For tag/condition: recipient relative to the actor. Defaults: tag=self,
   *  condition=target. */
  on?: "self" | "target" | "ally" | "enemy";
  /** For tag: free-text reminder shown in the chip. */
  note?: string;
  /** For tag: optional trigger that fires the tag's banner later. */
  trigger?: string;
  /** When true on a tag/condition rider effect, an effect_ends entry is
   *  emitted automatically AFTER the riding action commits (with
   *  reason: action_consumed). Use for "consumed by the action it rode on"
   *  abilities like Cunning Hide. */
  consumed?: boolean;
}

export interface Rider {
  name: string;
  /** Optional gating; absent = always available. */
  when?: RiderWhen;
  /** Limited-use cap; absent = unlimited. */
  uses?: RiderUses;
  /** When tag/condition effects are applied relative to the riding action's
   *  log entry. "before" reads as setup ("Wex hides (Cunning Action). Wex
   *  attacks..."); "after" reads as consequence ("Garrick attacked Owlbear...
   *  Owlbear is prone."). When absent, inferred from effect targets: any
   *  effect with `on: target` or `on: enemy` defaults to "after"; otherwise
   *  "before". Damage effects always merge into the action's log entry
   *  regardless of phase. */
  phase?: "before" | "after";
  effects: RiderEffect[];
}

export interface PartyMember {
  id: string;
  name: string;
  player?: string;
  notes?: string;
  /** Free-text class/level summary shown beside the PC's name on the roster
   *  (e.g. "Cleric 3" or "Rogue 2/Cleric 7/Monk 4"). Display-only; nothing
   *  mechanical reads this. */
  class_level?: string;
  actions?: PartyAction[];
  /** Spells known by this PC. Strings reference the library (resolved against
   *  loaded spell library files); objects are inline spell definitions. Both
   *  surface in the action bar's via dropdown when the cast preset is active. */
  spells?: (string | Spell)[];
  /** Rider abilities authored on the PC. Each commits as part of an action
   *  via the bar's rider toggles. */
  riders?: Rider[];
}

/** A named subset of the party roster. `members` lists PartyMember ids in the
 *  order they should appear when this party is selected at encounter start. */
export interface Party {
  name: string;
  members: string[];
}

export interface PartyData {
  party: PartyMember[];
  parties?: Party[];
}
