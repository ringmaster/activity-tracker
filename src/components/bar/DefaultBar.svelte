<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { nextTurn, prevTurn } from "../../state/combat-engine.svelte";
  import ActorDropdown from "../dropdowns/ActorDropdown.svelte";
  import UtilityDropdown from "../dropdowns/UtilityDropdown.svelte";

  let { encounter }: { encounter: EncounterState } = $props();

  let showActorDropdown = $state(false);
  let showUtilityDropdown = $state(false);

  let actorName = $derived.by(() => {
    const actor = encounter.effectiveActor;
    if (!actor) return "---";
    return actor.name;
  });

  let isSwapped = $derived(encounter.swappedActor !== null);

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
    showUtilityDropdown = false;
  }

  function toggleUtilityDropdown() {
    showUtilityDropdown = !showUtilityDropdown;
    showActorDropdown = false;
  }
</script>

<div class="dnd-bar">
  <button class="dnd-bar-btn" onclick={handlePrev} title="Previous turn" disabled={isFirstTurn}>&#9664;</button>

  <button
    class="dnd-bar-btn dnd-bar-actor"
    class:swapped={isSwapped}
    onclick={toggleActorDropdown}
  >
    {actorName} &#9662;
  </button>

  <button class="dnd-bar-btn" onclick={() => setAction("attack")} title="Attack">&#9876;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("heal")} title="Heal">&#10084;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("buff")} title="Buff">&#8593;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("debuff")} title="Debuff">&#8595;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("save")} title="Save">&#128190;</button>
  <button class="dnd-bar-btn" onclick={() => setAction("note")} title="Note">&#128221;</button>

  <button class="dnd-bar-btn" onclick={toggleUtilityDropdown} title="Utility">&#128203;</button>

  <button class="dnd-bar-btn" onclick={handleNext} title="Next turn">&#9654;</button>
</div>

{#if showActorDropdown}
  <ActorDropdown {encounter} onClose={() => { showActorDropdown = false; }} />
{/if}

{#if showUtilityDropdown}
  <UtilityDropdown {encounter} onClose={() => { showUtilityDropdown = false; }} />
{/if}
