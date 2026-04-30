<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { commitDebuff } from "../../state/action-logger.svelte";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let via = $state("");
  let condition = $state("");
  let slot = $state("");
  let isConc = $state(false);
  let spellKey = $state("");
  let showTargets = $state(false);
  let targets = $state<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({});

  const commonConditions = [
    "blinded", "charmed", "deafened", "frightened", "grappled",
    "incapacitated", "invisible", "paralyzed", "petrified",
    "poisoned", "prone", "restrained", "stunned", "unconscious",
    "downed", "dead",
  ];

  let targetLabel = $derived.by(() => {
    const checked = Object.entries(targets).filter(([_, t]) => t.checked);
    if (checked.length === 0) return "Targets";
    if (checked.length === 1) {
      const c = encounter.getCombatant(checked[0][0]);
      return c?.name ?? checked[0][0];
    }
    return `${checked.length} targets`;
  });

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

    if (selectedTargets.length === 0 && !condition) return;

    commitDebuff(encounter, {
      by: actor.id,
      via: via || condition || "debuff",
      targets: selectedTargets,
      conditions: condition ? [condition] : undefined,
      spellKey: spellKey || undefined,
      slot: slot ? parseInt(slot, 10) : undefined,
      conc: isConc || undefined,
    });

    onDone();
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel debuff">&#8595;</button>

  <button class="dnd-bar-btn" onclick={() => { showTargets = !showTargets; }}>
    {targetLabel}
  </button>

  <input
    type="text"
    class="dnd-action-input medium"
    placeholder="via / spell"
    bind:value={via}
  />

  <select class="dnd-action-input" bind:value={condition} style="min-width: 80px;">
    <option value="">condition...</option>
    {#each commonConditions as c}
      <option value={c}>{c}</option>
    {/each}
  </select>

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
