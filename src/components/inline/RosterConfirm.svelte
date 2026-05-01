<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { RosterEntry, PCToAdd } from "../../state/combat-engine.svelte";

  let { encounter, npcs, pcs, onStart, onCancel }: {
    encounter: EncounterState;
    npcs: RosterEntry[];
    pcs: RosterEntry[];
    onStart: (inits: Map<string, number>, pcsToAdd: PCToAdd[]) => void;
    onCancel: () => void;
  } = $props();

  // Local init values for editing
  let npcInits = $state<Record<string, string>>({});
  let showNpcs = $state(false);
  let pcInits = $state<Record<string, string>>({});

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

    // PC inits (only add PCs with entered init values)
    for (const pc of pcs) {
      const val = parseInt(pcInits[pc.id] ?? "", 10);
      if (!isNaN(val)) {
        initMap.set(pc.id, val);
        pcsToAdd.push({ id: pc.id, name: pc.name, init: val, actions: pc.actions });
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
      <button
        class="dnd-bar-btn"
        style="min-width: 32px; min-height: 32px; font-size: 16px;"
        onclick={addGuest}
        title="Add guest character"
      >+</button>
    </div>
    {#each pcs as pc (pc.id)}
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
      <span class="dnd-disclosure-arrow" class:open={showNpcs}>{showNpcs ? "\u25BC" : "\u25B6"}</span>
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
