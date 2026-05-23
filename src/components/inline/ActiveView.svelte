<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { LadderRung } from "../../types/encounter";
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

  let visibleCounters = $derived(
    encounter.counters.filter((c) => c.visible),
  );

  function nextThreshold(ladder: LadderRung[] | undefined): number | null {
    const next = (ladder ?? []).find((r) => !r.fired);
    return next ? next.at : null;
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

  {#if visibleCounters.length > 0}
    <div class="dnd-inline-counters">
      {#each visibleCounters as counter (counter.id)}
        {@const next = nextThreshold(counter.ladder)}
        <div class="dnd-inline-counter">
          <span class="dnd-inline-counter-name">{counter.name}</span>
          <span class="dnd-inline-counter-value">
            {counter.current}{#if next != null}/{next}{/if}
          </span>
          {#if counter.note}
            <span class="dnd-inline-counter-note">{counter.note}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <ul class="dnd-combatant-list">
    <li class="dnd-combatant-row dnd-combatant-header">
      <span class="dnd-combatant-caret"></span>
      <span class="dnd-combatant-name"></span>
      <span class="dnd-combatant-init">Init</span>
      <span class="dnd-combatant-ac">AC</span>
      <span class="dnd-combatant-hp">Dmg</span>
    </li>
    {#each encounter.sortedCombatants.filter((c) => c.type !== "object") as combatant (combatant.id)}
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
