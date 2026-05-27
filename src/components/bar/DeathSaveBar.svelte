<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { recordDeathSave, stabilizeCombatant } from "../../state/action-logger.svelte";
  import { nextTurn, prevTurn } from "../../state/combat-engine.svelte";
  import { ACTION_ICONS } from "../../icons/action-icons";

  let { encounter, onToggle }: {
    encounter: EncounterState;
    /** Click the leftmost skull to flip back to the regular action bar.
     *  The flag lives on the parent (StickyBar) so it survives across
     *  re-renders of this component. */
    onToggle: () => void;
  } = $props();

  let actor = $derived(encounter.effectiveActor);
  let saves = $derived(actor?.death_saves);
  let successes = $derived(saves?.successes ?? 0);
  let failures = $derived(saves?.failures ?? 0);
  let stable = $derived(saves?.stable ?? false);

  // Disable prev only on the very first turn in the log. Mirrors
  // DefaultBar's logic so the affordance behaves the same.
  let isFirstTurn = $derived.by(() => {
    const log = encounter.log;
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
    for (let i = currentTurnIdx - 1; i >= 0; i--) {
      if ("start_turn" in log[i]) return false;
    }
    return true;
  });

  function handleFail() {
    if (!actor || !saves || stable) return;
    recordDeathSave(encounter, actor.id, "fail");
  }

  function handleSuccess() {
    if (!actor || !saves || stable) return;
    recordDeathSave(encounter, actor.id, "pass");
  }

  function handleStabilize() {
    if (!actor || !saves || stable) return;
    stabilizeCombatant(encounter, actor.id);
  }
</script>

<div class="dnd-bar dnd-death-save-bar">
  <!-- Prev/next turn flanking the bar so the DM can step through the
       initiative order without leaving the death-save view. -->
  <button class="dnd-bar-btn" onclick={() => prevTurn(encounter)} title="Previous turn" disabled={isFirstTurn}>&#9664;</button>

  <!-- Leftmost interior button: skull, toggles back to the regular
       action bar. Tapping the skull on the regular bar flips back here. -->
  <button
    class="dnd-bar-btn active dnd-death-save-toggle"
    onclick={onToggle}
    title="Switch to action bar"
    aria-label="Switch to action bar"
  >
    <span class="dnd-action-icon dnd-icon-skull">{@html ACTION_ICONS.skull}</span>
  </button>

  {#if stable}
    <div class="dnd-death-save-stable">STABLE</div>
  {:else}
    <!-- Six dots: three left slots fill with hearts (successes), three
         right slots fill with skulls (failures). Matches the D&D 5e
         tracker convention. -->
    <div class="dnd-death-save-dots">
      {#each [0, 1, 2] as i}
        <span class="dnd-death-save-dot dnd-death-save-success" class:filled={successes > i}>
          {#if successes > i}
            <span class="dnd-action-icon dnd-icon-heart">{@html ACTION_ICONS.heart}</span>
          {/if}
        </span>
      {/each}
      {#each [0, 1, 2] as i}
        <span class="dnd-death-save-dot dnd-death-save-fail" class:filled={failures > i}>
          {#if failures > i}
            <span class="dnd-action-icon dnd-icon-skull">{@html ACTION_ICONS.skull}</span>
          {/if}
        </span>
      {/each}
    </div>
  {/if}

  <button
    class="dnd-bar-btn dnd-death-save-btn dnd-death-save-fail-btn"
    onclick={handleFail}
    disabled={stable}
    title="Failed death save (tap twice for nat 1)"
    aria-label="Failed death save"
  >
    <span class="dnd-action-icon dnd-icon-skull">{@html ACTION_ICONS.skull}</span>
  </button>

  <button
    class="dnd-bar-btn dnd-death-save-btn dnd-death-save-success-btn"
    onclick={handleSuccess}
    disabled={stable}
    title="Successful death save"
    aria-label="Successful death save"
  >
    <span class="dnd-action-icon dnd-icon-heart">{@html ACTION_ICONS.heart}</span>
  </button>

  <button
    class="dnd-bar-btn dnd-death-save-btn dnd-death-save-stabilize-btn"
    onclick={handleStabilize}
    disabled={stable}
    title="Stabilize (no more death saves)"
  >Stabilize</button>

  <button class="dnd-bar-btn" onclick={() => nextTurn(encounter)} title="Next turn">&#9654;</button>
</div>
