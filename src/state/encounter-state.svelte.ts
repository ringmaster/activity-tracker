import type { App, TFile } from "obsidian";
import type {
  Combatant,
  Counter,
  AuthoredCounter,
  EncounterData,
  AuthoredEncounterData,
  Spell,
  Zone,
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

  // Zones (positional grouping for combatants)
  zones = $state<Zone[]>([]);

  // Custom prepositions added at runtime via the move bar's + button.
  // The four built-in icons (above/beside/inside/under) are not stored here.
  prepositions = $state<string[]>([]);

  // Action log
  log = $state<LogEntry[]>([]);

  // Active obligations
  activeObligations = $state<ActiveObligation[]>([]);

  // Counters (encounter-scoped accumulators with laddered thresholds)
  counters = $state<Counter[]>([]);

  // Transient bar state (not persisted to YAML)
  swappedActor = $state<string | null>(null);
  activeAction = $state<string | null>(null);
  /** Index of the start_turn log entry we're currently viewing. -1 = derive from currentTurn. */
  currentTurnLogIndex = $state<number>(-1);
  /** Last selected target IDs for the current turn; persists across action commits. */
  lastTargetIds = $state<string[]>([]);
  /** Currently selected target IDs in the action bar (transient, for when_targeted banners). */
  pendingTargetIds = $state<string[]>([]);

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
    const log = this.log ?? [];
    const logIdx = this.currentTurnLogIndex;
    if (logIdx < 0 || logIdx >= log.length) return this.round || 1;

    // Scan backwards from the current turn to find the nearest start_round
    for (let i = logIdx; i >= 0; i--) {
      const entry = log[i] as any;
      if (entry?.start_round) return entry.start_round.n;
    }
    return 1;
  });

  /** Called when the encounter deactivates so the plugin can hide the bar. */
  onDeactivate: (() => void) | null = null;

  /** Plugin sets this so the inline view can disable Run/Continue when another
   *  encounter in the same file is already active. Returns the name of the
   *  blocking encounter, or null if none. */
  blockingEncounterName: (() => string | null) | null = null;

  /** Path to the party note for persisting learned PC actions. */
  partyNotePath: string = "party.yaml";
  libraryPaths: string = "library.yaml, srd-library.yaml";

  // File reference for YAML persistence
  app: App;
  private file: TFile;
  private language: string;
  private debouncedFlush: ReturnType<typeof createDebouncedFlush>;

  constructor(
    app: App,
    file: TFile,
    language: string,
    data: AuthoredEncounterData | EncounterData,
  ) {
    this.app = app;
    this.file = file;
    this.language = language;
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
    this.zones = data.zones ?? [];
    this.prepositions = data.prepositions ?? [];
    this.counters = normalizeCounters(data.counters);

    // Always run through expandCombatants. It handles `count > 1` expansion
    // AND auto-derives `id: toSlug(name)` for unique entries that omit an
    // explicit id, so handwritten YAML like the Owlbear sample (no id, no
    // count) still gets a stable, addressable id. Skipping this branch is
    // what made the Owlbear target as undefined.
    this.combatants = expandCombatants(data.combatants ?? []).map((c) =>
      fillCombatantDefaults(c),
    );

    // Default any combatant without an explicit zone to the first zone, if any
    const defaultZoneId = this.zones[0]?.id;
    if (defaultZoneId) {
      for (const c of this.combatants) {
        if (!c.zone) c.zone = { id: defaultZoneId };
      }
    }
  }

  /** Get a combatant by ID. */
  getCombatant(id: string): Combatant | undefined {
    return this.combatants.find((c) => c.id === id);
  }

  /** Get a counter by ID. */
  getCounter(id: string): Counter | undefined {
    return this.counters.find((c) => c.id === id);
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

  /** Serialize current state to EncounterData (for YAML output).
   *  Uses JSON round-trip to strip Svelte reactive proxies. */
  toData(): EncounterData {
    return JSON.parse(JSON.stringify({
      encounter: this.encounter,
      active: this.active,
      round: this.round,
      current_turn: this.currentTurn,
      zones: this.zones.length > 0 ? this.zones : undefined,
      prepositions: this.prepositions.length > 0 ? this.prepositions : undefined,
      counters: this.counters.length > 0 ? this.counters : undefined,
      combatants: this.combatants,
      log: this.log,
      active_obligations: this.activeObligations,
    }));
  }

  /** Flush current state to the YAML code block (debounced). The block is
   *  located by re-scanning the file and matching the encounter name, so
   *  sibling-block writes that shift line numbers don't corrupt the target. */
  flush(): void {
    this.debouncedFlush.schedule(
      this.file,
      this.language,
      this.encounter,
      this.toData(),
    );
  }

  /** Flush immediately (for critical operations like encounter start/end). */
  async flushNow(): Promise<void> {
    this.debouncedFlush.cancel();
    await flushToFile(
      this.app,
      this.file,
      this.language,
      this.encounter,
      this.toData(),
    );
  }

  /** Clean up when the state instance is no longer needed. */
  destroy(): void {
    this.debouncedFlush.cancel();
  }
}

/** Fill defaults on authored counters: current defaults to 0; each ladder rung's
 *  fired flag defaults to false. */
function normalizeCounters(
  counters: (Counter | AuthoredCounter)[] | undefined,
): Counter[] {
  if (!counters || counters.length === 0) return [];
  return counters.map((c) => ({
    id: c.id,
    name: c.name,
    note: c.note,
    visible: c.visible ?? false,
    current: c.current ?? 0,
    ladder: (c.ladder ?? []).map((r) => ({
      at: r.at,
      banner: r.banner,
      add_combatants: r.add_combatants,
      fired: r.fired ?? false,
    })),
  }));
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

/** Backfill missing tag IDs so handwritten YAML (which often omits them) doesn't
 *  blow up Svelte's keyed each blocks with undefined-vs-undefined collisions. */
function ensureTagIds(tags: Combatant["tags"]): Combatant["tags"] {
  let counter = 0;
  return (tags ?? []).map((t) => {
    if (t && t.id) return t;
    counter++;
    return { ...t, id: `tag-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 6)}` };
  });
}

/** Fill in default values for combatant fields that may be absent in YAML. */
function fillCombatantDefaults(partial: Partial<Combatant> & { id: string; name: string; type: "npc" | "pc" | "object" }): Combatant {
  const base: Combatant = {
    id: partial.id,
    name: partial.name,
    type: partial.type,
    init: partial.init ?? null,
    temp_hp: partial.temp_hp ?? 0,
    conditions: partial.conditions ?? [],
    tags: ensureTagIds(partial.tags ?? []),
    concentration: partial.concentration ?? null,
  };

  if (partial.type === "npc") {
    base.hp = partial.hp ?? { current: 0, max: 0 };
    base.spell_slots = normalizeSpellSlots(partial.spell_slots);
    base.legendary_actions = partial.legendary_actions ?? null;
    base.behavior = partial.behavior;
  } else if (partial.type === "object") {
    base.hp = partial.hp ?? { current: 0, max: 0 };
  } else {
    base.damage_taken = partial.damage_taken ?? 0;
  }

  if (partial.ac != null) base.ac = partial.ac;
  if (partial.toHit != null) base.toHit = partial.toHit;
  if (partial.spellAttack != null) base.spellAttack = partial.spellAttack;
  if (partial.actions) base.actions = partial.actions;
  if (partial.spells) base.spells = partial.spells;
  if (partial.statblock) base.statblock = partial.statblock;
  if (partial.recharge) base.recharge = partial.recharge;
  if (partial.hidden) base.hidden = partial.hidden;
  if (partial.friendly != null) base.friendly = partial.friendly;
  if (partial.zone) base.zone = partial.zone;
  if (partial.turn_hint) base.turn_hint = partial.turn_hint;
  if (partial.riders) base.riders = partial.riders;
  if (partial.rider_uses) base.rider_uses = partial.rider_uses;
  if (partial.action_uses) base.action_uses = partial.action_uses;
  if (partial.class_level) base.class_level = partial.class_level;

  return base;
}
