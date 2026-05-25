<script lang="ts">
  import type { App } from "obsidian";
  import type { EncounterState } from "../state/encounter-state.svelte";
  import { prepareRoster, startEncounter, type PCToAdd } from "../state/combat-engine.svelte";
  import { loadPartyData } from "../state/party-loader";
  import type { Party } from "../types/party";
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
  let rosterParties = $state<Party[]>([]);

  async function handleRunEncounter() {
    const { members, parties } = await loadPartyData(app, partyNotePath);
    const { npcs, pcs } = prepareRoster(encounter, members, app);
    rosterNPCs = npcs;
    rosterPCs = pcs;
    rosterParties = parties;
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
    parties={rosterParties}
    onStart={handleStart}
    onCancel={handleCancel}
  />
{:else if encounter.active}
  <ActiveView {encounter} {readOnly} />
{:else}
  <InactiveView {encounter} onRunEncounter={readOnly ? undefined : handleRunEncounter} {readOnly} />
{/if}
