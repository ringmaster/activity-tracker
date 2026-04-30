<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { commitHeal } from "../../state/action-logger.svelte";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let via = $state("");
  let healAmount = $state("");
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

  function handleCommit() {
    const actor = encounter.effectiveActor;
    if (!actor) return;

    const hp = parseInt(healAmount, 10);
    if (isNaN(hp) || hp <= 0) return;

    const selectedTargets = Object.entries(targets)
      .filter(([_, t]) => t.checked)
      .map(([id]) => ({ who: id, hp }));

    if (selectedTargets.length === 0) return;

    commitHeal(encounter, {
      by: actor.id,
      via: via || undefined,
      targets: selectedTargets,
    });

    onDone();
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel heal">&#10084;</button>

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
    placeholder="HP"
    bind:value={healAmount}
  />

  <button class="dnd-bar-btn active" onclick={handleCommit}>Commit</button>
</div>

{#if showTargets}
  <TargetsDropdown
    {encounter}
    bind:selected={targets}
    onClose={() => { showTargets = false; }}
  />
{/if}
