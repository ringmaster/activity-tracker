<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import ActionFields from "./ActionFields.svelte";
  import MoveFields from "./MoveFields.svelte";
  import NoteFields from "./NoteFields.svelte";

  let { encounter }: { encounter: EncounterState } = $props();

  function handleDone() {
    encounter.activeAction = null;
  }
</script>

{#if encounter.activeAction === "attack"}
  <ActionFields {encounter} onDone={handleDone} preset="attack" />
{:else if encounter.activeAction === "cast"}
  <ActionFields {encounter} onDone={handleDone} preset="cast" />
{:else if encounter.activeAction === "heal"}
  <ActionFields {encounter} onDone={handleDone} preset="heal" />
{:else if encounter.activeAction === "move"}
  <MoveFields {encounter} onDone={handleDone} />
{:else if encounter.activeAction === "note"}
  <NoteFields {encounter} onDone={handleDone} />
{/if}
