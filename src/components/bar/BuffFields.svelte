<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { commitBuff } from "../../state/action-logger.svelte";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let via = $state("");
  let slot = $state("");
  let isConc = $state(false);
  let spellKey = $state("");
  let showTargets = $state(false);
  let targets = $state<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({});

  let targetLabel = $derived.by(() => {
    const checked = Object.entries(targets).filter(([_, t]) => t.checked);
    if (checked.length === 0) return "Targets";
    if (checked.length === 1) {
      const c = encounter.getCombatant(checked[0][0]);
      return c?.name ?? checked[0][0];
    }
    return `${checked.length} targets`;
  });

  // Match via to spell key
  $effect(() => {
    const matchedKey = Object.keys(encounter.spells).find(
      (k) => encounter.spells[k].name.toLowerCase() === via.toLowerCase() || k === via.toLowerCase(),
    );
    if (matchedKey) {
      spellKey = matchedKey;
      const spell = encounter.spells[matchedKey];
      if (spell.concentration) isConc = true;
    }
  });

  function handleCommit() {
    const actor = encounter.effectiveActor;
    if (!actor) return;

    const selectedTargets = Object.entries(targets)
      .filter(([_, t]) => t.checked)
      .map(([id]) => id);

    if (selectedTargets.length === 0) return;

    commitBuff(encounter, {
      by: actor.id,
      via: via || "buff",
      targets: selectedTargets,
      spellKey: spellKey || undefined,
      slot: slot ? parseInt(slot, 10) : undefined,
      conc: isConc || undefined,
    });

    onDone();
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel buff">&#8593;</button>

  <button class="dnd-bar-btn" onclick={() => { showTargets = !showTargets; }}>
    {targetLabel}
  </button>

  <input
    type="text"
    class="dnd-action-input medium"
    placeholder="via"
    bind:value={via}
  />

  <input
    type="number"
    inputmode="numeric"
    class="dnd-action-input narrow"
    placeholder="slot"
    bind:value={slot}
  />

  <button
    class="dnd-bar-btn"
    class:active={isConc}
    onclick={() => { isConc = !isConc; }}
    title="Concentration"
  >Conc</button>

  <button class="dnd-bar-btn active" onclick={handleCommit}>Commit</button>
</div>

{#if showTargets}
  <TargetsDropdown
    {encounter}
    bind:selected={targets}
    onClose={() => { showTargets = false; }}
  />
{/if}
