<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { commitNote } from "../../state/action-logger.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let text = $state("");

  function handleCommit() {
    const actor = encounter.effectiveActor;
    if (!actor || !text.trim()) return;

    commitNote(encounter, {
      by: actor.id,
      text: text.trim(),
    });

    onDone();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      handleCommit();
    }
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel note">&#128221;</button>

  <span style="font-size: 13px; color: var(--text-muted);">
    {encounter.effectiveActor?.name ?? "?"}:
  </span>

  <input
    type="text"
    class="dnd-action-input"
    style="flex: 1;"
    placeholder="Note text..."
    bind:value={text}
    onkeydown={handleKeydown}
  />

  <button class="dnd-bar-btn active" onclick={handleCommit}>Commit</button>
</div>
