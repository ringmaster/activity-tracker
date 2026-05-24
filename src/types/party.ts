import type { ActionEffect, AuthoredDamage, DamageComponent, SaveInfo } from "./encounter";

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

export interface PartyMember {
  id: string;
  name: string;
  player?: string;
  notes?: string;
  actions?: PartyAction[];
}

export interface PartyData {
  party: PartyMember[];
}
