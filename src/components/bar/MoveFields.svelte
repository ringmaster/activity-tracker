<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { ACTION_ICONS } from "../../icons/action-icons";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let showTargets = $state(false);
  let targets = $state<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({});

  let selectedTarget = $derived.by(() => {
    const checked = Object.entries(targets).filter(([_, t]) => t.checked);
    if (checked.length === 1) {
      return encounter.getCombatant(checked[0][0]) ?? null;
    }
    return null;
  });

  let targetLabel = $derived.by(() => {
    const actor = encounter.effectiveActor;
    if (!selectedTarget) return actor?.name ?? "?";
    return `\u2192 ${selectedTarget.name}`;
  });

  function commitMove(verb: string) {
    const actor = encounter.effectiveActor;
    if (!actor) return;

    // Handle flee: mark actor as fled
    if (verb === "flees") {
      if (!actor.conditions.includes("fled")) {
        actor.conditions.push("fled");
      }
    }

    encounter.logInsert({
      move: {
        by: actor.id,
        verb,
        target: selectedTarget?.id,
      },
    });

    encounter.flush();
    onDone();
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel move"><span class="dnd-action-icon dnd-icon-move">{@html ACTION_ICONS.move}</span></button>

  <button class="dnd-bar-btn" onclick={() => { showTargets = !showTargets; }}>
    {targetLabel}
  </button>

  <button class="dnd-bar-btn dnd-move-btn" onclick={() => commitMove("closes with")} title="Closes with"><span class="dnd-move-icon dnd-icon-closes">{@html ACTION_ICONS.closes}</span></button>
  <button class="dnd-bar-btn dnd-move-btn" onclick={() => commitMove("separates from")} title="Separates from"><span class="dnd-move-icon dnd-icon-separates">{@html ACTION_ICONS.separates}</span></button>
  <button class="dnd-bar-btn dnd-move-btn" onclick={() => commitMove("distances from")} title="Distances from"><span class="dnd-move-icon dnd-icon-distances">{@html ACTION_ICONS.distances}</span></button>
  <button class="dnd-bar-btn dnd-move-btn" onclick={() => commitMove("flies over")} title="Flies over"><span class="dnd-move-icon dnd-icon-flies">{@html ACTION_ICONS.flies}</span></button>
  <button class="dnd-bar-btn dnd-move-btn dnd-move-flee" onclick={() => commitMove("flees")} title="Flees"><span class="dnd-move-icon dnd-icon-flees">{@html ACTION_ICONS.flees}</span></button>
</div>

{#if showTargets}
  <TargetsDropdown
    {encounter}
    bind:selected={targets}
    onClose={() => { showTargets = false; }}
  />
{/if}
