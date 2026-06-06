<script lang="ts">
  import type { App } from "obsidian";
  import type { EncounterState } from "../state/encounter-state.svelte";
  import { prepareRoster, startEncounter, rewindToAuthored, type PCToAdd } from "../state/combat-engine.svelte";
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

  async function handlePracticeEncounter() {
    encounter.enterPractice();
    // Start practice from a clean authored roster even if the encounter has
    // persisted progress. rewindToAuthored mutates memory only (no flush, and
    // it doesn't leave practice), so the file keeps its progress; enterPractice
    // snapshotted it and exitPractice restores it when practice ends.
    if (encounter.round > 0 || encounter.log.length > 0) {
      rewindToAuthored(encounter);
    }
    await handleRunEncounter();
  }

  function handleStart(
    inits: Map<string, number>,
    pcsToAdd: PCToAdd[],
    zones: Map<string, string>,
  ) {
    startEncounter(encounter, inits, pcsToAdd, zones);
    showRoster = false;
    encounter.flushNow();
  }

  function handleCancel() {
    showRoster = false;
    // Backing out of the roster before a practice run actually started should
    // leave practice entirely, restoring the pre-practice state.
    if (encounter.practiceMode && !encounter.active) {
      encounter.exitPractice();
    }
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
  <InactiveView
    {encounter}
    onRunEncounter={readOnly ? undefined : handleRunEncounter}
    onPracticeEncounter={readOnly ? undefined : handlePracticeEncounter}
    {readOnly}
  />
{/if}
