import type { App, TFile } from "obsidian";
import type {
  Combatant,
  EncounterData,
  AuthoredEncounterData,
  Spell,
} from "../types/encounter";
import type { LogEntry } from "../types/actions";
import type { ActiveObligation } from "../types/obligations";
import { expandCombatants } from "../utils/id-generator";
import { createDebouncedFlush, flushToFile } from "./yaml-bridge";

export class EncounterState {
  // Core encounter fields
  encounter = $state<string>("");
  active = $state<boolean>(false);
  round = $state<number>(0);
  currentTurn = $state<string | null>(null);

  // Combatants
  combatants = $state<Combatant[]>([]);

  // Action log
  log = $state<LogEntry[]>([]);

  // Active obligations
  activeObligations = $state<ActiveObligation[]>([]);

  // Transient bar state (not persisted to YAML)
  swappedActor = $state<string | null>(null);
  activeAction = $state<string | null>(null);
  /** Index of the start_turn log entry we're currently viewing. -1 = derive from currentTurn. */
  currentTurnLogIndex = $state<number>(-1);
  /** Last selected target IDs for the current turn; persists across action commits. */
  lastTargetIds = $state<string[]>([]);

  // Derived values
  sortedCombatants = $derived(
    [...(this.combatants ?? [])].sort((a, b) => (b.init ?? 0) - (a.init ?? 0)),
  );

  currentActor = $derived(
    (this.combatants ?? []).find((c) => c.id === this.currentTurn) ?? null,
  );

  effectiveActor = $derived(
    this.swappedActor
      ? (this.combatants ?? []).find((c) => c.id === this.swappedActor) ?? this.currentActor
      : this.currentActor,
  );

  livingCombatants = $derived(
    (this.sortedCombatants ?? []).filter((c) =>
      !(c.conditions ?? []).includes("dead") && !(c.conditions ?? []).includes("fled"),
    ),
  );

  livingNPCs = $derived(
    (this.livingCombatants ?? []).filter((c) => c.type === "npc"),
  );

  allNPCsDead = $derived(
    this.active &&
      this.combatants.filter((c) => c.type === "npc").length > 0 &&
      this.livingNPCs.length === 0,
  );

  /** The round number of the currently viewed turn (derived from log position). */
  viewingRound = $derived.by(() => {
    const logIdx = this.currentTurnLogIndex;
    if (logIdx < 0) return this.round;

    // Scan backwards from the current turn to find the nearest start_round
    for (let i = logIdx; i >= 0; i--) {
      const entry = this.log[i] as any;
      if (entry.start_round) return entry.start_round.n;
    }
    return 1;
  });

  /** Called when the encounter deactivates so the plugin can hide the bar. */
  onDeactivate: (() => void) | null = null;

  /** Path to the party note for persisting learned PC actions. */
  partyNotePath: string = "party.yaml";
  libraryPaths: string = "library.yaml, srd-library.yaml";

  // File reference for YAML persistence
  app: App;
  private file: TFile;
  private sectionStart: number;
  private sectionEnd: number;
  private debouncedFlush: ReturnType<typeof createDebouncedFlush>;

  constructor(
    app: App,
    file: TFile,
    sectionStart: number,
    sectionEnd: number,
    data: AuthoredEncounterData | EncounterData,
  ) {
    this.app = app;
    this.file = file;
    this.sectionStart = sectionStart;
    this.sectionEnd = sectionEnd;
    this.debouncedFlush = createDebouncedFlush(app);

    this.loadFromData(data);
  }

  /** Load/reload from parsed YAML data. */
  loadFromData(data: AuthoredEncounterData | EncounterData): void {
    this.encounter = data.encounter ?? "";
    this.active = data.active ?? false;
    this.round = data.round ?? 0;
    this.currentTurn = data.current_turn ?? null;
    this.log = data.log ?? [];
    this.activeObligations = data.active_obligations ?? [];

    // Expand combatants if they have `count` fields (authored format)
    if (data.combatants?.some((c: any) => c.count && c.count > 1)) {
      this.combatants = expandCombatants(data.combatants).map((c) =>
        fillCombatantDefaults(c),
      );
    } else {
      this.combatants = (data.combatants ?? []).map((c) =>
        fillCombatantDefaults(c as Combatant),
      );
    }
  }

  /** Get a combatant by ID. */
  getCombatant(id: string): Combatant | undefined {
    return this.combatants.find((c) => c.id === id);
  }

  /**
   * Insert a log entry at the correct position for the currently viewed turn.
   * If viewing the latest turn, appends to the end.
   * If viewing a historical turn, inserts before the next start_turn.
   */
  logInsert(entry: LogEntry): void {
    const idx = this.currentTurnLogIndex;

    // If no valid index or viewing the latest turn segment, just append
    if (idx < 0) {
      this.log.push(entry);
      return;
    }

    // Find the end of the current turn's segment (next start_turn or end of log)
    let insertAt = this.log.length;
    for (let i = idx + 1; i < this.log.length; i++) {
      if ("start_turn" in this.log[i]) {
        insertAt = i;
        break;
      }
    }

    this.log.splice(insertAt, 0, entry);

    // Adjust currentTurnLogIndex if needed (the index itself doesn't shift
    // since we insert after it, but later indices do shift)
  }

  /** Find a fully-specified spell definition by name, searching all combatants. */
  findSpellDef(name: string): Spell | undefined {
    const lower = name.toLowerCase();
    for (const c of this.combatants) {
      if (!c.spells) continue;
      for (const entry of c.spells) {
        if (typeof entry !== "string" && entry.name.toLowerCase() === lower) {
          return entry;
        }
      }
    }
    return undefined;
  }

  /** Update section bounds (if code block processor re-runs). */
  updateSectionBounds(start: number, end: number): void {
    this.sectionStart = start;
    this.sectionEnd = end;
  }

  /** Serialize current state to EncounterData (for YAML output).
   *  Uses JSON round-trip to strip Svelte reactive proxies. */
  toData(): EncounterData {
    return JSON.parse(JSON.stringify({
      encounter: this.encounter,
      active: this.active,
      round: this.round,
      current_turn: this.currentTurn,
      combatants: this.combatants,
      log: this.log,
      active_obligations: this.activeObligations,
    }));
  }

  /** Flush current state to the YAML code block (debounced). */
  flush(): void {
    this.debouncedFlush.schedule(
      this.file,
      this.sectionStart,
      this.sectionEnd,
      this.toData(),
    );
  }

  /** Flush immediately (for critical operations like encounter start/end). */
  async flushNow(): Promise<void> {
    this.debouncedFlush.cancel();
    await flushToFile(
      this.app,
      this.file,
      this.sectionStart,
      this.sectionEnd,
      this.toData(),
    );
  }

  /** Clean up when the state instance is no longer needed. */
  destroy(): void {
    this.debouncedFlush.cancel();
  }
}

/** Normalize spell slots from authored format (plain number = max) to runtime format ({current, max}). */
function normalizeSpellSlots(
  slots: Record<number, number | { current: number; max: number }> | undefined,
): Record<number, { current: number; max: number }> | undefined {
  if (!slots) return undefined;
  const result: Record<number, { current: number; max: number }> = {};
  for (const [level, val] of Object.entries(slots)) {
    if (typeof val === "number") {
      result[Number(level)] = { current: val, max: val };
    } else if (val && typeof val === "object" && "current" in val && "max" in val) {
      result[Number(level)] = { current: val.current, max: val.max };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Fill in default values for combatant fields that may be absent in YAML. */
function fillCombatantDefaults(partial: Partial<Combatant> & { id: string; name: string; type: "npc" | "pc" }): Combatant {
  const base: Combatant = {
    id: partial.id,
    name: partial.name,
    type: partial.type,
    init: partial.init ?? null,
    temp_hp: partial.temp_hp ?? 0,
    conditions: partial.conditions ?? [],
    tags: partial.tags ?? [],
    concentration: partial.concentration ?? null,
  };

  if (partial.type === "npc") {
    base.hp = partial.hp ?? { current: 0, max: 0 };
    base.spell_slots = normalizeSpellSlots(partial.spell_slots);
    base.legendary_actions = partial.legendary_actions ?? null;
    base.behavior = partial.behavior;
  } else {
    base.damage_taken = partial.damage_taken ?? 0;
  }

  if (partial.ac != null) base.ac = partial.ac;
  if (partial.actions) base.actions = partial.actions;
  if (partial.spells) base.spells = partial.spells;
  if (partial.statblock) base.statblock = partial.statblock;
  if (partial.recharge) base.recharge = partial.recharge;
  if (partial.hidden) base.hidden = partial.hidden;

  return base;
}
