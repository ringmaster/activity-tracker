<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { Zone } from "../../types/encounter";
  import { toSlug } from "../../utils/id-generator";
  import { PREPOSITION_ICONS, BUILTIN_PREPOSITIONS } from "../../icons/preposition-icons";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let actor = $derived(encounter.effectiveActor);

  // Selection seeded from actor's current zone/preposition
  // svelte-ignore state_referenced_locally
  let selectedZoneId = $state<string | null>(actor?.zone?.id ?? encounter.zones[0]?.id ?? null);
  // svelte-ignore state_referenced_locally
  let selectedPreposition = $state<string | null>(actor?.zone?.preposition ?? null);
  let fleeing = $state(false);

  let showAddZone = $state(false);
  let newZoneName = $state("");

  let showAddPreposition = $state(false);
  let newPrepositionName = $state("");

  let allPrepositions = $derived([
    ...BUILTIN_PREPOSITIONS,
    ...encounter.prepositions,
  ]);

  function selectZone(zoneId: string) {
    fleeing = false;
    selectedZoneId = zoneId;
  }

  function selectFlee() {
    fleeing = true;
    selectedZoneId = null;
  }

  function togglePreposition(prep: string) {
    selectedPreposition = selectedPreposition === prep ? null : prep;
  }

  function addZone() {
    const name = newZoneName.trim();
    if (!name) return;
    const id = toSlug(name) || `zone-${Date.now()}`;
    if (encounter.zones.some((z) => z.id === id)) {
      // Already exists; just select it
      selectedZoneId = id;
    } else {
      encounter.zones.push({ id, name });
      selectedZoneId = id;
    }
    newZoneName = "";
    showAddZone = false;
    encounter.flush();
  }

  function addPreposition() {
    const name = newPrepositionName.trim().toLowerCase();
    if (!name) return;
    if (!allPrepositions.includes(name)) {
      encounter.prepositions.push(name);
    }
    selectedPreposition = name;
    newPrepositionName = "";
    showAddPreposition = false;
    encounter.flush();
  }

  function commit() {
    if (!actor) return;

    if (fleeing) {
      if (!actor.conditions.includes("fled")) {
        actor.conditions.push("fled");
      }
      encounter.logInsert({
        move: { by: actor.id, fled: true },
      });
      encounter.flush();
      onDone();
      return;
    }

    if (!selectedZoneId) return;

    const from = actor.zone ? { ...actor.zone } : null;
    const to = selectedPreposition
      ? { id: selectedZoneId, preposition: selectedPreposition }
      : { id: selectedZoneId };

    // No-op move
    if (from && from.id === to.id && (from.preposition ?? null) === (to.preposition ?? null)) {
      onDone();
      return;
    }

    actor.zone = to;
    encounter.logInsert({
      move: { by: actor.id, from, to },
    });
    encounter.flush();
    onDone();
  }
</script>

<div class="dnd-action-bar dnd-move-bar">
  <div class="dnd-move-row">
    <button class="dnd-bar-btn active" onclick={onDone} title="Cancel move">&larr;</button>
    <button
      class="dnd-bar-btn dnd-move-flee-btn"
      class:selected={fleeing}
      onclick={selectFlee}
      title="Flee the encounter"
    >Flee</button>

    {#each encounter.zones as zone (zone.id)}
      <button
        class="dnd-bar-btn dnd-zone-btn"
        class:selected={!fleeing && selectedZoneId === zone.id}
        onclick={() => selectZone(zone.id)}
      >{zone.name}</button>
    {/each}

    <button
      class="dnd-bar-btn"
      onclick={() => { showAddZone = !showAddZone; showAddPreposition = false; }}
      title="Add a new zone"
    >+</button>

    <button
      class="dnd-bar-btn active"
      disabled={!fleeing && !selectedZoneId}
      onclick={commit}
    >Commit</button>
  </div>

  <div class="dnd-move-row">
    {#each BUILTIN_PREPOSITIONS as prep}
      <button
        class="dnd-bar-btn dnd-prep-btn"
        class:selected={selectedPreposition === prep}
        title={prep}
        onclick={() => togglePreposition(prep)}
      >
        <span class="dnd-prep-icon">{@html PREPOSITION_ICONS[prep]}</span>
      </button>
    {/each}

    {#each encounter.prepositions as prep}
      <button
        class="dnd-bar-btn dnd-prep-btn"
        class:selected={selectedPreposition === prep}
        title={prep}
        onclick={() => togglePreposition(prep)}
      >{prep}</button>
    {/each}

    <button
      class="dnd-bar-btn"
      onclick={() => { showAddPreposition = !showAddPreposition; showAddZone = false; }}
      title="Add a new preposition"
    >+</button>
  </div>

  {#if showAddZone}
    <div class="dnd-move-row">
      <input
        type="text"
        class="dnd-action-input medium"
        placeholder="New zone name"
        bind:value={newZoneName}
        onkeydown={(e) => { if (e.key === "Enter") addZone(); }}
      />
      <button class="dnd-bar-btn active" onclick={addZone}>Add zone</button>
    </div>
  {/if}

  {#if showAddPreposition}
    <div class="dnd-move-row">
      <input
        type="text"
        class="dnd-action-input medium"
        placeholder="New preposition"
        bind:value={newPrepositionName}
        onkeydown={(e) => { if (e.key === "Enter") addPreposition(); }}
      />
      <button class="dnd-bar-btn active" onclick={addPreposition}>Add</button>
    </div>
  {/if}
</div>
