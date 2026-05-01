<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { nextTurn, prevTurn } from "../../state/combat-engine.svelte";
  import ActorDropdown from "../dropdowns/ActorDropdown.svelte";

  let { encounter }: { encounter: EncounterState } = $props();

  let showActorDropdown = $state(false);

  let isSwapped = $derived(encounter.swappedActor !== null);

  let actorLabel = $derived.by(() => {
    const actor = encounter.effectiveActor;
    if (!actor) return "---";
    if (isSwapped) return `\u21A9 ${actor.name}`;
    return actor.name;
  });

  let isFirstTurn = $derived.by(() => {
    const log = encounter.log;
    for (const entry of log) {
      if ("start_turn" in entry) {
        return (entry as any).start_turn.who === encounter.currentTurn;
      }
    }
    return true;
  });

  function setAction(action: string) {
    encounter.activeAction = action;
  }

  function handlePrev() {
    prevTurn(encounter);
  }

  function handleNext() {
    nextTurn(encounter);
  }

  function toggleActorDropdown() {
    showActorDropdown = !showActorDropdown;
  }
</script>

<div class="dnd-bar">
  <button class="dnd-bar-btn" onclick={handlePrev} title="Previous turn" disabled={isFirstTurn}>&#9664;</button>

  <button
    class="dnd-bar-btn dnd-bar-actor"
    onclick={toggleActorDropdown}
  >
    {actorLabel} &#9662;
  </button>

  <button class="dnd-bar-btn" onclick={() => setAction("attack")} title="Attack">&#9876;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("cast")} title="Cast">&#10024;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("heal")} title="Heal">&#10084;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("note")} title="Note">&#128221;</button>

  <button class="dnd-bar-btn" onclick={handleNext} title="Next turn">&#9654;</button>
</div>

{#if showActorDropdown}
  <ActorDropdown {encounter} onClose={() => { showActorDropdown = false; }} />
{/if}

