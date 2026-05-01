<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { resetEncounter } from "../../state/combat-engine.svelte";
  import { summarizeLogEntry } from "../../utils/log-summary";
  import CombatantRow from "./CombatantRow.svelte";

  let { encounter, onRunEncounter, readOnly = false }: {
    encounter: EncounterState;
    onRunEncounter?: () => void;
    readOnly?: boolean;
  } = $props();

  let hasBeenStarted = $derived(encounter.round > 0 || encounter.log.length > 0);
  let confirmReset = $state(false);
  let showLog = $state(false);

  let fullLog = $derived.by(() => {
    if (!showLog) return [];
    return encounter.log
      .map((entry) => summarizeLogEntry(entry, encounter))
      .filter((s): s is string => s !== null);
  });

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

  async function copyLogToClipboard() {
    const text = fullLog.join("\n");
    await navigator.clipboard.writeText(text);
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
    <div class="dnd-inline-actions">
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

      {#if hasBeenStarted}
        <button
          class="dnd-show-log-btn"
          onclick={() => { showLog = !showLog; }}
        >{showLog ? "Hide log" : "Show log"}</button>
      {/if}
    </div>
  {/if}

  {#if showLog && fullLog.length > 0}
    <hr class="dnd-log-divider" />
    <div class="dnd-full-log">
      <button class="dnd-copy-log-btn" onclick={copyLogToClipboard}>Copy to clipboard</button>
      {#each fullLog as line}
        <div class="dnd-full-log-entry">{line}</div>
      {/each}
    </div>
  {/if}
</div>
