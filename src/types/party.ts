import type { DamageComponent, SaveInfo } from "./encounter";

export interface PartyAction {
  name: string;
  type: string;
  dmg?: DamageComponent[];
  save?: SaveInfo;
  slot?: number;
  note?: string;
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
