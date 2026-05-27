<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { nextTurn, prevTurn } from "../../state/combat-engine.svelte";
  import { ACTION_ICONS } from "../../icons/action-icons";
  import ActorDropdown from "../dropdowns/ActorDropdown.svelte";

  let { encounter, downReturn }: {
    encounter: EncounterState;
    /** When the effective actor is in death-save state but the DM has
     *  flipped to the regular bar, this callback flips back. StickyBar
     *  passes it whenever the current actor is down + override is active;
     *  otherwise undefined. */
    downReturn?: () => void;
  } = $props();

  let showActorDropdown = $state(false);

  let isSwapped = $derived(encounter.swappedActor !== null);

  let actorLabel = $derived.by(() => {
    const actor = encounter.effectiveActor;
    if (!actor) return "---";
    if (isSwapped) return `\u21A9 ${actor.name}`;
    return actor.name;
  });

  // Disable back button only when viewing the very first turn in the log
  let isFirstTurn = $derived.by(() => {
    const log = encounter.log;

    // Use tracked index if valid
    let currentTurnIdx = encounter.currentTurnLogIndex;
    if (currentTurnIdx < 0 || currentTurnIdx >= log.length) {
      for (let i = log.length - 1; i >= 0; i--) {
        const entry = log[i] as any;
        if (entry.start_turn && entry.start_turn.who === encounter.currentTurn) {
          currentTurnIdx = i;
          break;
        }
      }
    }
    if (currentTurnIdx < 0) return true;

    // Check if there's any start_turn before this one
    for (let i = currentTurnIdx - 1; i >= 0; i--) {
      if ("start_turn" in log[i]) return false;
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
    class:active={showActorDropdown}
    onclick={toggleActorDropdown}
  >
    {actorLabel} &#9662;
  </button>

  <button class="dnd-bar-btn" onclick={() => setAction("attack")} title="Attack"><span class="dnd-action-icon dnd-icon-attack">{@html ACTION_ICONS.attack}</span></button>
  <button class="dnd-bar-btn" onclick={() => setAction("cast")} title="Cast"><span class="dnd-action-icon dnd-icon-cast">{@html ACTION_ICONS.cast}</span></button>
  <button class="dnd-bar-btn" onclick={() => setAction("heal")} title="Heal"><span class="dnd-action-icon dnd-icon-heal">{@html ACTION_ICONS.heal}</span></button>
  <button class="dnd-bar-btn" onclick={() => setAction("move")} title="Move"><span class="dnd-action-icon dnd-icon-move">{@html ACTION_ICONS.move}</span></button>
  <button class="dnd-bar-btn" onclick={() => setAction("note")} title="Note"><span class="dnd-action-icon dnd-icon-note">{@html ACTION_ICONS.note}</span></button>

  {#if downReturn}
    <!-- Reminder + return path: the active actor is in death-save state
         but the DM toggled to this regular bar. Tap to flip back to
         the death-save bar. -->
    <button
      class="dnd-bar-btn dnd-bar-death-return"
      onclick={downReturn}
      title="Return to death-save bar"
    ><span class="dnd-action-icon dnd-icon-skull">{@html ACTION_ICONS.skull}</span></button>
  {/if}

  <button class="dnd-bar-btn" onclick={handleNext} title="Next turn">&#9654;</button>
</div>

{#if showActorDropdown}
  <ActorDropdown {encounter} onClose={() => { showActorDropdown = false; }} />
{/if}

