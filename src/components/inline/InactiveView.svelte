<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { resetEncounter } from "../../state/combat-engine.svelte";
  import CombatantRow from "./CombatantRow.svelte";

  let { encounter, onRunEncounter, readOnly = false }: {
    encounter: EncounterState;
    onRunEncounter?: () => void;
    readOnly?: boolean;
  } = $props();

  let hasBeenStarted = $derived(encounter.round > 0 || encounter.log.length > 0);
  let confirmReset = $state(false);

  function handleContinue() {
    encounter.active = true;
    encounter.flushNow();
  }

  function handleReset() {
    if (!confirmReset) {
      confirmReset = true;
      return;
    }
    resetEncounter(encounter);
    confirmReset = false;
  }
</script>

<div class="dnd-inline-view">
  <div class="dnd-inline-header">Encounter: {encounter.encounter}</div>
  <div class="dnd-inline-status">Round {encounter.round} / Inactive</div>

  {#if encounter.combatants.length > 0}
    <ul class="dnd-combatant-list">
      <li class="dnd-combatant-row dnd-combatant-header">
        <span class="dnd-combatant-caret"></span>
        <span class="dnd-combatant-name"></span>
        <span class="dnd-combatant-init">Init</span>
        <span class="dnd-combatant-ac">AC</span>
        <span class="dnd-combatant-hp">HP</span>
      </li>
      {#each encounter.combatants as combatant (combatant.id)}
        <CombatantRow {combatant} />
      {/each}
    </ul>
  {/if}

  {#if !readOnly}
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      {#if hasBeenStarted}
        <button class="dnd-encounter-btn" onclick={handleContinue}>
          &#9654; Continue encounter
        </button>
        <button class="dnd-encounter-btn reset" onclick={handleReset}>
          {confirmReset ? "Confirm reset?" : "Reset encounter"}
        </button>
      {:else if onRunEncounter}
        <button class="dnd-encounter-btn" onclick={onRunEncounter}>
          &#9654; Run encounter
        </button>
      {/if}
    </div>
  {/if}
</div>
