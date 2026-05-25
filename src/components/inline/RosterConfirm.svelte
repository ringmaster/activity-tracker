<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { RosterEntry, PCToAdd } from "../../state/combat-engine.svelte";
  import type { Party } from "../../types/party";

  let { encounter, npcs, pcs, parties = [], onStart, onCancel }: {
    encounter: EncounterState;
    npcs: RosterEntry[];
    pcs: RosterEntry[];
    parties?: Party[];
    onStart: (inits: Map<string, number>, pcsToAdd: PCToAdd[]) => void;
    onCancel: () => void;
  } = $props();

  // Local init values for editing
  let npcInits = $state<Record<string, string>>({});
  let showNpcs = $state(false);
  let pcInits = $state<Record<string, string>>({});

  // Selected party name; empty string means "All party members" (the default).
  // Only honored when at least one named party is defined.
  let selectedPartyName = $state("");

  // PCs visible (and counted at start time) for the current selection. Named
  // parties show their members in the order declared in the YAML; the "All"
  // option preserves the roster's order.
  let visiblePcs = $derived.by<RosterEntry[]>(() => {
    if (!selectedPartyName) return pcs;
    const party = parties.find((p) => p.name === selectedPartyName);
    if (!party) return pcs;
    const byId = new Map(pcs.map((pc) => [pc.id, pc]));
    return party.members
      .map((id) => byId.get(id))
      .filter((pc): pc is RosterEntry => !!pc);
  });

  // Multiple guest slots
  let nextGuestKey = $state(0);
  let guests = $state<{ key: number; name: string; init: string }[]>([]);

  // Initialize NPC init values
  $effect(() => {
    const inits: Record<string, string> = {};
    for (const npc of npcs) {
      inits[npc.id] = npc.init !== null ? String(npc.init) : "";
    }
    npcInits = inits;
  });

  function addGuest() {
    guests = [...guests, { key: nextGuestKey++, name: "", init: "" }];
  }

  function handleStart() {
    const initMap = new Map<string, number>();
    const pcsToAdd: PCToAdd[] = [];

    // NPC inits
    for (const npc of npcs) {
      const val = parseInt(npcInits[npc.id] ?? "", 10);
      if (!isNaN(val)) initMap.set(npc.id, val);
    }

    // PC inits (only add the visible/selected PCs that have an init entered).
    // Iterating visiblePcs (not pcs) so a PC whose row is filtered out by the
    // party selection doesn't sneak into the encounter via a stale typed value.
    for (const pc of visiblePcs) {
      const val = parseInt(pcInits[pc.id] ?? "", 10);
      if (!isNaN(val)) {
        initMap.set(pc.id, val);
        pcsToAdd.push({ id: pc.id, name: pc.name, init: val, actions: pc.actions, riders: pc.riders });
      }
    }

    // Guests
    for (const guest of guests) {
      const name = (guest.name ?? "").trim();
      const init = Number(guest.init);
      if (name && !isNaN(init)) {
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        initMap.set(id, init);
        pcsToAdd.push({ id, name, init });
      }
    }

    onStart(initMap, pcsToAdd);
  }
</script>

<div class="dnd-roster-overlay">
  <div class="dnd-inline-header">Roster for: {encounter.encounter}</div>

  <div class="dnd-roster-section">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <h4 style="margin: 0;">Party</h4>
      {#if parties.length > 0}
        <select
          class="dnd-roster-party-select"
          bind:value={selectedPartyName}
          aria-label="Select party"
        >
          <option value="">All party members</option>
          {#each parties as party (party.name)}
            <option value={party.name}>{party.name}</option>
          {/each}
        </select>
      {/if}
      <button
        class="dnd-bar-btn"
        style="min-width: 32px; min-height: 32px; font-size: 16px;"
        onclick={addGuest}
        title="Add guest character"
      >+</button>
    </div>
    {#each visiblePcs as pc (pc.id)}
      <div class="dnd-roster-row">
        <span class="dnd-roster-name">{pc.name}</span>
        <input
          type="number"
          inputmode="numeric"
          class="dnd-roster-init-input"
          placeholder="init"
          bind:value={pcInits[pc.id]}
        />
      </div>
    {/each}
    {#each guests as guest (guest.key)}
      <div class="dnd-roster-row">
        <input
          type="text"
          class="dnd-action-input medium"
          placeholder="Guest name"
          bind:value={guest.name}
        />
        <input
          type="number"
          inputmode="numeric"
          class="dnd-roster-init-input"
          placeholder="init"
          bind:value={guest.init}
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
          <input
            type="number"
            inputmode="numeric"
            class="dnd-roster-init-input"
            bind:value={npcInits[npc.id]}
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
