<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { endEncounter, resetEncounter } from "../../state/combat-engine.svelte";
  import CombatantRow from "./CombatantRow.svelte";

  let { encounter, readOnly = false }: {
    encounter: EncounterState;
    readOnly?: boolean;
  } = $props();

  let confirmReset = $state(false);

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
  <div class="dnd-inline-status">
    Round {encounter.viewingRound}/{encounter.round} &mdash; Active
    {#if encounter.allNPCsDead}
      <span class="dnd-combat-over"> &mdash; Combat Over!</span>
    {/if}
  </div>

  <ul class="dnd-combatant-list">
    <li class="dnd-combatant-row dnd-combatant-header">
      <span class="dnd-combatant-caret"></span>
      <span class="dnd-combatant-name"></span>
      <span class="dnd-combatant-init">Init</span>
      <span class="dnd-combatant-ac">AC</span>
      <span class="dnd-combatant-hp">Dmg</span>
    </li>
    {#each encounter.sortedCombatants as combatant (combatant.id)}
      <CombatantRow
        {combatant}
        isCurrent={combatant.id === encounter.currentTurn}
      />
    {/each}
  </ul>

  {#if !readOnly}
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      <button
        class="dnd-encounter-btn stop"
        onclick={() => endEncounter(encounter)}
      >
        &#9208; Stop encounter
      </button>
      <button
        class="dnd-encounter-btn reset"
        onclick={handleReset}
      >
        {confirmReset ? "Confirm reset?" : "Reset encounter"}
      </button>
    </div>
  {/if}
</div>
