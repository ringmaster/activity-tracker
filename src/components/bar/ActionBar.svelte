<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import AttackFields from "./AttackFields.svelte";
  import HealFields from "./HealFields.svelte";
  import NoteFields from "./NoteFields.svelte";

  let { encounter }: { encounter: EncounterState } = $props();

  function handleDone() {
    encounter.activeAction = null;
  }
</script>

{#if encounter.activeAction === "attack"}
  <AttackFields {encounter} onDone={handleDone} />
{:else if encounter.activeAction === "heal"}
  <HealFields {encounter} onDone={handleDone} />
{:else if encounter.activeAction === "note"}
  <NoteFields {encounter} onDone={handleDone} />
{/if}
