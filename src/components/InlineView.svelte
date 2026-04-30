<script lang="ts">
  import type { App } from "obsidian";
  import type { EncounterState } from "../state/encounter-state.svelte";
  import { prepareRoster, startEncounter, type PCToAdd } from "../state/combat-engine.svelte";
  import { loadParty } from "../state/party-loader";
  import InactiveView from "./inline/InactiveView.svelte";
  import ActiveView from "./inline/ActiveView.svelte";
  import RosterConfirm from "./inline/RosterConfirm.svelte";

  let { encounter, app, partyNotePath, readOnly = false }: {
    encounter: EncounterState;
    app: App;
    partyNotePath: string;
    readOnly?: boolean;
  } = $props();

  let showRoster = $state(false);
  let rosterNPCs = $state<any[]>([]);
  let rosterPCs = $state<any[]>([]);

  async function handleRunEncounter() {
    const party = await loadParty(app, partyNotePath);
    const { npcs, pcs } = prepareRoster(encounter, party, app);
    rosterNPCs = npcs;
    rosterPCs = pcs;
    showRoster = true;
  }

  function handleStart(
    inits: Map<string, number>,
    pcsToAdd: PCToAdd[],
  ) {
    startEncounter(encounter, inits, pcsToAdd);
    showRoster = false;
    encounter.flushNow();
  }

  function handleCancel() {
    showRoster = false;
  }
</script>

{#if showRoster}
  <RosterConfirm
    {encounter}
    npcs={rosterNPCs}
    pcs={rosterPCs}
    onStart={handleStart}
    onCancel={handleCancel}
  />
{:else if encounter.active}
  <ActiveView {encounter} {readOnly} />
{:else}
  <InactiveView {encounter} onRunEncounter={readOnly ? undefined : handleRunEncounter} {readOnly} />
{/if}
