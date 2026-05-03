<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { resetEncounter } from "../../state/combat-engine.svelte";
  import { loadLibraryWithResults, type LibraryLoadResult } from "../../state/library-loader";
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
  let libraryLoadResults = $state<LibraryLoadResult[] | null>(null);
  let libraryLoadTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleReloadLibrary() {
    const results = await loadLibraryWithResults(encounter.app, encounter.libraryPaths);
    libraryLoadResults = results;
    if (libraryLoadTimer) clearTimeout(libraryLoadTimer);
    libraryLoadTimer = setTimeout(() => { libraryLoadResults = null; }, 4000);
  }

  let fullLog = $derived.by(() => {
    if (!showLog) return [];
    return encounter.log
      .map((entry) => summarizeLogEntry(entry, encounter))
      .filter((s): s is string => s !== null);
  });

  function handleContinue() {
    // Remove the end_combat entry so the log is continuous when resumed
    const lastIdx = encounter.log.length - 1;
    if (lastIdx >= 0 && "end_combat" in encounter.log[lastIdx]) {
      encounter.log.splice(lastIdx, 1);
    }
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

      <button
        class="dnd-show-log-btn"
        onclick={handleReloadLibrary}
      >Reload library</button>
      {#if hasBeenStarted}
        <button
          class="dnd-show-log-btn"
          onclick={() => { showLog = !showLog; }}
        >{showLog ? "Hide log" : "Show log"}</button>
      {/if}
    </div>

    {#if libraryLoadResults}
      <div class="dnd-library-load-results">
        {#each libraryLoadResults as result}
          <div class="dnd-library-load-result" class:missing={!result.found}>
            {#if result.found}
              <span class="dnd-library-check">&#10003;</span> {result.label} ({result.count})
            {:else}
              <span class="dnd-library-x">&#10007;</span> {result.label} <span class="dnd-library-missing">not found</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
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
