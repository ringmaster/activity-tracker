<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { commitSave } from "../../state/action-logger.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let stat = $state("con");
  let dc = $state("");
  let result = $state<"pass" | "fail">("pass");
  let forSpell = $state("");

  const stats = ["str", "dex", "con", "int", "wis", "cha"];

  function handleCommit() {
    const actor = encounter.effectiveActor;
    if (!actor) return;

    commitSave(encounter, {
      who: actor.id,
      stat,
      dc: parseInt(dc, 10) || 10,
      result,
      forSpell: forSpell || undefined,
    });

    onDone();
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel save">&#128190;</button>

  <span style="font-size: 13px; color: var(--text-muted);">
    {encounter.effectiveActor?.name ?? "?"}
  </span>

  <select class="dnd-action-input" bind:value={stat} style="min-width: 60px;">
    {#each stats as s}
      <option value={s}>{s.toUpperCase()}</option>
    {/each}
  </select>

  <input
    type="number"
    inputmode="numeric"
    class="dnd-action-input narrow"
    placeholder="DC"
    bind:value={dc}
  />

  <div style="display: flex; gap: 2px;">
    <button
      class="dnd-bar-btn"
      class:active={result === "pass"}
      onclick={() => { result = "pass"; }}
    >Pass</button>
    <button
      class="dnd-bar-btn"
      class:active={result === "fail"}
      onclick={() => { result = "fail"; }}
    >Fail</button>
  </div>

  <input
    type="text"
    class="dnd-action-input medium"
    placeholder="for spell"
    bind:value={forSpell}
  />

  <button class="dnd-bar-btn active" onclick={handleCommit}>Commit</button>
</div>
