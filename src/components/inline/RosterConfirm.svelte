<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { RosterEntry, PCToAdd } from "../../state/combat-engine.svelte";
  import type { Party } from "../../types/party";

  let { encounter, npcs, pcs, parties = [], onStart, onCancel }: {
    encounter: EncounterState;
    npcs: RosterEntry[];
    pcs: RosterEntry[];
    parties?: Party[];
    onStart: (
      inits: Map<string, number>,
      pcsToAdd: PCToAdd[],
      zones: Map<string, string>,
    ) => void;
    onCancel: () => void;
  } = $props();

  // Local init values for editing
  let npcInits = $state<Record<string, string>>({});
  let showNpcs = $state(false);
  let pcInits = $state<Record<string, string>>({});

  // Per-row zone selection. Keyed by combatant id (PC id, guest id-or-key, or
  // NPC id). Seeded for NPCs from their authored zone; PCs start unset and
  // pick up the encounter's first zone as their default at render time.
  let zoneSelections = $state<Record<string, string>>({});

  // The party dropdown drives an explicit set of selected PC ids. Empty means
  // "no PCs on the roster yet" (the user has not picked a party or added any
  // PCs individually). Selecting a named party replaces this list; "+ PC"
  // appends one id at a time.
  let selectedPcIds = $state<string[]>([]);
  let selectedPartyName = $state("");
  // Bound to the "+ PC" select; reset to "" after each pick so the chip stays
  // showing the placeholder text.
  let pcPickerValue = $state("");

  // PCs rendered in roster order, matching the user's explicit selection.
  let visiblePcs = $derived.by<RosterEntry[]>(() => {
    const byId = new Map(pcs.map((pc) => [pc.id, pc]));
    return selectedPcIds
      .map((id) => byId.get(id))
      .filter((pc): pc is RosterEntry => !!pc);
  });

  // PCs not yet on the roster, available to add via the "+ PC" picker.
  let availablePcs = $derived.by<RosterEntry[]>(() => {
    const taken = new Set(selectedPcIds);
    return pcs.filter((pc) => !taken.has(pc.id));
  });

  // Zone list for the per-row dropdown (only shown when zones are defined).
  let zones = $derived(encounter.zones ?? []);

  // Multiple guest slots
  let nextGuestKey = $state(0);
  let guests = $state<{ key: number; name: string; init: string }[]>([]);

  // Initialize NPC init + zone values once, and refresh when the NPC list
  // changes (e.g. encounter swap).
  $effect(() => {
    const inits: Record<string, string> = {};
    const npcZones: Record<string, string> = {};
    for (const npc of npcs) {
      inits[npc.id] = npc.init !== null ? String(npc.init) : "";
      if (npc.zone?.id) npcZones[npc.id] = npc.zone.id;
    }
    npcInits = inits;
    // Merge rather than replace so PC/guest selections survive an NPC reload.
    zoneSelections = { ...zoneSelections, ...npcZones };
  });

  function zoneFor(id: string): string {
    return zoneSelections[id] ?? zones[0]?.id ?? "";
  }

  function handlePartyPick(name: string) {
    selectedPartyName = name;
    if (!name) {
      selectedPcIds = [];
      return;
    }
    const party = parties.find((p) => p.name === name);
    if (!party) return;
    // Filter against the loaded roster so a stale id in the party YAML can't
    // produce a phantom row.
    const known = new Set(pcs.map((pc) => pc.id));
    selectedPcIds = party.members.filter((id) => known.has(id));
  }

  function handlePcPick(id: string) {
    if (!id) return;
    if (!selectedPcIds.includes(id)) {
      selectedPcIds = [...selectedPcIds, id];
    }
    pcPickerValue = "";
  }

  function addGuest() {
    guests = [...guests, { key: nextGuestKey++, name: "", init: "" }];
  }

  /** Fill an init input with a fresh 1-20 if it's currently blank, and
   *  highlight the value so the player can overwrite it with a quick type.
   *  No-op when a value is already present (per spec). */
  function rollInitOnDoubleTap(
    e: MouseEvent,
    current: string,
    setter: (val: string) => void,
  ) {
    if (current && current.trim() !== "") return;
    const rolled = Math.floor(Math.random() * 20) + 1;
    setter(String(rolled));
    const input = e.currentTarget as HTMLInputElement;
    // Wait one tick so the bound value is committed before selecting.
    queueMicrotask(() => input.select());
  }

  function handleStart() {
    const initMap = new Map<string, number>();
    const zoneMap = new Map<string, string>();
    const pcsToAdd: PCToAdd[] = [];

    // NPC inits + zone overrides
    for (const npc of npcs) {
      const val = parseInt(npcInits[npc.id] ?? "", 10);
      if (!isNaN(val)) initMap.set(npc.id, val);
      const zoneId = zoneSelections[npc.id];
      // Only emit an override if it actually changed; saves a no-op write on
      // every authored NPC.
      if (zoneId && zoneId !== npc.zone?.id) zoneMap.set(npc.id, zoneId);
    }

    // PC rows
    for (const pc of visiblePcs) {
      const val = parseInt(pcInits[pc.id] ?? "", 10);
      if (!isNaN(val)) {
        initMap.set(pc.id, val);
        const zoneId = zoneSelections[pc.id] ?? zones[0]?.id;
        pcsToAdd.push({
          id: pc.id,
          name: pc.name,
          init: val,
          actions: pc.actions,
          riders: pc.riders,
          zone: zoneId ? { id: zoneId } : undefined,
        });
      }
    }

    // Guests / allies
    for (const guest of guests) {
      const name = (guest.name ?? "").trim();
      const init = Number(guest.init);
      if (name && !isNaN(init)) {
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        initMap.set(id, init);
        const zoneId = zoneSelections[`guest-${guest.key}`] ?? zones[0]?.id;
        pcsToAdd.push({
          id,
          name,
          init,
          zone: zoneId ? { id: zoneId } : undefined,
        });
      }
    }

    onStart(initMap, pcsToAdd, zoneMap);
  }
</script>

<div class="dnd-roster-overlay">
  <div class="dnd-inline-header">Roster for: {encounter.encounter}</div>

  <div class="dnd-roster-section">
    <div class="dnd-roster-toolbar">
      {#if parties.length > 0}
        <select
          class="dnd-roster-party-select"
          value={selectedPartyName}
          onchange={(e) => handlePartyPick((e.currentTarget as HTMLSelectElement).value)}
          aria-label="Select party"
        >
          <option value="">Select party…</option>
          {#each parties as party (party.name)}
            <option value={party.name}>{party.name}</option>
          {/each}
        </select>
      {/if}
      <select
        class="dnd-roster-pc-picker"
        value={pcPickerValue}
        onchange={(e) => handlePcPick((e.currentTarget as HTMLSelectElement).value)}
        disabled={availablePcs.length === 0}
        aria-label="Add a PC to the roster"
      >
        <option value="">+ PC</option>
        {#each availablePcs as pc (pc.id)}
          <option value={pc.id}>{pc.name}</option>
        {/each}
      </select>
      <button
        class="dnd-bar-btn dnd-roster-add-ally"
        onclick={addGuest}
        title="Add ally / guest character"
      >+ Ally</button>
    </div>
    {#each visiblePcs as pc (pc.id)}
      <div class="dnd-roster-row">
        <span class="dnd-roster-name">{pc.name}</span>
        {#if zones.length > 0}
          <select
            class="dnd-roster-zone-select"
            value={zoneFor(pc.id)}
            onchange={(e) => { zoneSelections[pc.id] = (e.currentTarget as HTMLSelectElement).value; }}
            aria-label="Starting zone for {pc.name}"
          >
            {#each zones as zone (zone.id)}
              <option value={zone.id}>{zone.name}</option>
            {/each}
          </select>
        {/if}
        <input
          type="number"
          inputmode="numeric"
          class="dnd-roster-init-input"
          placeholder="init"
          bind:value={pcInits[pc.id]}
          ondblclick={(e) => rollInitOnDoubleTap(e, pcInits[pc.id] ?? "", (v) => { pcInits[pc.id] = v; })}
        />
      </div>
    {/each}
    {#each guests as guest (guest.key)}
      <div class="dnd-roster-row">
        <input
          type="text"
          class="dnd-action-input medium"
          placeholder="Ally name"
          bind:value={guest.name}
        />
        {#if zones.length > 0}
          <select
            class="dnd-roster-zone-select"
            value={zoneFor(`guest-${guest.key}`)}
            onchange={(e) => { zoneSelections[`guest-${guest.key}`] = (e.currentTarget as HTMLSelectElement).value; }}
            aria-label="Starting zone for ally"
          >
            {#each zones as zone (zone.id)}
              <option value={zone.id}>{zone.name}</option>
            {/each}
          </select>
        {/if}
        <input
          type="number"
          inputmode="numeric"
          class="dnd-roster-init-input"
          placeholder="init"
          bind:value={guest.init}
          ondblclick={(e) => rollInitOnDoubleTap(e, guest.init, (v) => { guest.init = v; })}
        />
      </div>
    {/each}
  </div>

  <div class="dnd-roster-section">
    <button class="dnd-disclosure-header" onclick={() => { showNpcs = !showNpcs; }}>
      <h4 style="margin: 0;">NPCs (auto-rolled)</h4>
      <span class="dnd-disclosure-arrow" class:open={showNpcs}>{showNpcs ? "▼" : "▶"}</span>
    </button>
    {#if showNpcs}
      {#each npcs as npc (npc.id)}
        <div class="dnd-roster-row">
          <span class="dnd-roster-name">
            {npc.name}
            {#if npc.hp}
              <span style="color: var(--text-muted); font-size: 12px;">
                HP {npc.hp.current}/{npc.hp.max}
              </span>
            {/if}
          </span>
          {#if zones.length > 0}
            <select
              class="dnd-roster-zone-select"
              value={zoneFor(npc.id)}
              onchange={(e) => { zoneSelections[npc.id] = (e.currentTarget as HTMLSelectElement).value; }}
              aria-label="Starting zone for {npc.name}"
            >
              {#each zones as zone (zone.id)}
                <option value={zone.id}>{zone.name}</option>
              {/each}
            </select>
          {/if}
          <input
            type="number"
            inputmode="numeric"
            class="dnd-roster-init-input"
            bind:value={npcInits[npc.id]}
            ondblclick={(e) => rollInitOnDoubleTap(e, npcInits[npc.id] ?? "", (v) => { npcInits[npc.id] = v; })}
          />
        </div>
      {/each}
    {/if}
  </div>

  <div style="display: flex; gap: 8px;">
    <button class="dnd-encounter-btn" onclick={handleStart}>Start</button>
    <button class="dnd-encounter-btn stop" onclick={onCancel}>Cancel</button>
  </div>
</div>
