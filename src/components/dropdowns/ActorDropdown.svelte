<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { Combatant, Counter, LadderRung } from "../../types/encounter";
  import { addCombatant, endEncounter } from "../../state/combat-engine.svelte";
  import { tickCounter } from "../../state/counter-engine.svelte";
  import { getCreature, getCreatureNames, openStatblockView } from "../../state/statblocks-api";
  import { STATBLOCK_ICON } from "../../icons/target-icons";

  // Combatants holding an unfired readied action. Surfaced as resume buttons
  // near the counters so the DM can fire from anyone's turn without first
  // navigating to the readier's turn.
  let readiedCombatants = $derived(
    encounter.combatants.filter((c) => c.readied_action),
  );

  function resumeReadied(readier: Combatant) {
    const snapshot = readier.readied_action;
    if (!snapshot) return;
    // Clear the readied marker -- the dropdown button shouldn't keep showing
    // after the action is restored to the bar. If the DM cancels mid-resume,
    // they'll need to re-ready.
    readier.readied_action = undefined;
    encounter.resumingReadiedFrom = snapshot;
    encounter.swappedActor = readier.id;
    encounter.activeAction = snapshot.preset;
    onClose();
  }
  import CombatantRow from "../inline/CombatantRow.svelte";

  let { encounter, onClose }: {
    encounter: EncounterState;
    onClose: () => void;
  } = $props();

  let showAddForm = $state(false);
  let newName = $state("");
  let newInit = $state("");
  let newHP = $state("");
  let newType = $state<"npc" | "pc">("npc");
  let confirmEnd = $state(false);

  // Statblock autocomplete: when the user picks a suggestion, we remember
  // which bestiary name they chose. Editing newName afterwards clears the
  // pick so a typo doesn't keep applying a stale statblock. Null = free
  // text mode (no bestiary integration on submit).
  let pickedStatblock = $state<string | null>(null);
  // Suggestions are gated only on (a) newType === "npc" and (b) the user
  // has typed at least 2 chars. No separate "showSuggestions" toggle: the
  // prior focus/blur approach turned out to interact badly with the
  // dropdown's overflow:auto + absolute positioning, so the list now
  // renders in normal flow and is purely driven by suggestion count.
  let suggestions = $derived.by<string[]>(() => {
    if (newType !== "npc") return [];
    const query = newName.trim().toLowerCase();
    if (query.length < 2) return [];
    const all = getCreatureNames(encounter.app);
    return all
      .filter((n) => n.toLowerCase().includes(query))
      .slice(0, 8);
  });

  // One-shot diagnostic: log how many bestiary names we got back on the
  // first non-trivial query. Helps when the autocomplete looks broken --
  // count: 0 means the Fantasy Statblocks bestiary isn't returning
  // anything to this plugin.
  let loggedBestiarySize = false;
  $effect(() => {
    if (newType !== "npc" || newName.trim().length < 2 || loggedBestiarySize) return;
    loggedBestiarySize = true;
    const all = getCreatureNames(encounter.app);
    console.log(
      `[activity-tracker] bestiary names available: ${all.length}` +
        (all.length > 0 ? ` (first: ${all[0]})` : ""),
    );
  });

  function pickSuggestion(name: string) {
    pickedStatblock = name;
    newName = name;
    // Prefill HP from the bestiary entry. User can overwrite before
    // submitting; we don't lock the input.
    const creature = getCreature(encounter.app, name);
    if (creature?.hp != null) newHP = String(creature.hp);
  }

  function handleNameInput() {
    // Editing the name after a pick disengages the bestiary integration so
    // the user can drift into a custom name without surprise prefill.
    if (pickedStatblock && newName !== pickedStatblock) pickedStatblock = null;
  }

  let actor = $derived(encounter.effectiveActor);

  function handleEnd() {
    if (!confirmEnd) {
      confirmEnd = true;
      return;
    }
    confirmEnd = false;
    endEncounter(encounter);
    onClose();
  }

  function nextThreshold(ladder: LadderRung[] | undefined): number | null {
    const next = (ladder ?? []).find((r) => !r.fired);
    return next ? next.at : null;
  }

  function manualTick(counter: Counter) {
    // Manual tick from the actor dropdown: no `by` (it's a DM hand-tick, not
    // attributable to a combatant action). The log entry still records what
    // happened for prose reconstruction.
    tickCounter(encounter, counter.id, 1);
  }

  function swapTo(id: string) {
    if (id === encounter.currentTurn) {
      encounter.swappedActor = null;
    } else {
      encounter.swappedActor = id;
    }
    // Dropdown stays open so the user can see the swap-caret update and pick
    // a different actor without re-opening it.
  }

  function handleAdd() {
    const init = parseInt(newInit, 10);
    const hp = parseInt(newHP, 10);
    if (!newName.trim() || isNaN(init)) return;

    const id = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const combatant: Combatant = {
      id,
      name: newName.trim(),
      type: newType,
      init,
      temp_hp: 0,
      conditions: [],
      concentration: null,
    };

    if (newType === "npc") {
      combatant.hp = { current: isNaN(hp) ? 0 : hp, max: isNaN(hp) ? 0 : hp };
    } else {
      combatant.damage_taken = 0;
    }

    // If the user explicitly picked a bestiary entry (and didn't edit the
    // name away from it), stamp the statblock name + r/i/v + parsed
    // actions from the bestiary onto the new combatant. Free-text names
    // get nothing extra -- you can still type "Bandit Lieutenant" for a
    // custom NPC.
    if (newType === "npc" && pickedStatblock && newName.trim() === pickedStatblock) {
      combatant.statblock = pickedStatblock;
      const creature = getCreature(encounter.app, pickedStatblock);
      if (creature) {
        if (creature.resistances) combatant.resistances = creature.resistances;
        if (creature.immunities) combatant.immunities = creature.immunities;
        if (creature.vulnerabilities) combatant.vulnerabilities = creature.vulnerabilities;
        if (creature.actions) combatant.actions = creature.actions;
      }
    }

    addCombatant(encounter, combatant);
    cancelAdd();
    onClose();
  }

  /** Close the add-form takeover and clear all fields. Used by both the
   *  successful-add path (right after pushing the new combatant) and the
   *  explicit Cancel button. */
  function cancelAdd() {
    showAddForm = false;
    newName = "";
    newInit = "";
    newHP = "";
    pickedStatblock = null;
  }

  /** Sensible default initiative when opening the Add form: drop in right
   *  after the current actor (their init minus one). If that would land at
   *  zero (or below) -- usually because the current actor has init 1 or
   *  no init is set -- top of order instead: one above the highest init
   *  on the roster. */
  function defaultNewInit(): string {
    const current = encounter.effectiveActor?.init;
    if (typeof current === "number" && current - 1 > 0) {
      return String(current - 1);
    }
    let max = 0;
    for (const c of encounter.combatants) {
      if (typeof c.init === "number" && c.init > max) max = c.init;
    }
    return String(max + 1);
  }

  function openAddForm() {
    newInit = defaultNewInit();
    showAddForm = true;
  }

  /** Whether the current actor's statblock can be opened in the sidebar.
   *  Requires Fantasy Statblocks to be available AND the actor's statblock
   *  reference to resolve to a bestiary entry. Read at render time so a
   *  bestiary that loads after the encounter starts surfaces correctly. */
  let canOpenActorStatblock = $derived.by(() => {
    if (!actor?.statblock) return false;
    return !!getCreature(encounter.app, actor.statblock);
  });

  function openActorStatblock() {
    if (!actor?.statblock) return;
    openStatblockView(encounter.app, actor.statblock);
  }
</script>

<div class="dnd-dropdown">
  {#if !showAddForm}
  <!-- Current actor state -->
  {#if actor}
    <div class="dnd-dropdown-row" style="flex-direction: column; align-items: stretch; gap: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <strong>{actor.name}</strong>
            {#if canOpenActorStatblock}
              <button
                type="button"
                class="dnd-statblock-open-btn"
                onclick={openActorStatblock}
                title="Open {actor.statblock} statblock in the sidebar"
                aria-label="Open {actor.statblock} statblock"
              >{@html STATBLOCK_ICON}</button>
            {/if}
          </div>
          <div style="font-size: 13px; color: var(--text-muted);">
            {#if actor.type === "npc" && actor.hp}
              HP {actor.hp.current}/{actor.hp.max}
            {:else if actor.type === "pc"}
              Damage taken: {actor.damage_taken ?? 0}
            {/if}
            {#if actor.temp_hp > 0}
              &middot; Temp HP: {actor.temp_hp}
            {/if}
            {#if actor.concentration}
              &middot; Concentrating: {actor.concentration.spell}
            {/if}
          </div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
          {#each encounter.counters as counter (counter.id)}
            {@const next = nextThreshold(counter.ladder)}
            <button
              type="button"
              class="dnd-counter-chip"
              title={counter.note ?? ""}
              onclick={() => manualTick(counter)}
            >
              <span class="dnd-counter-name">{counter.name}</span>
              <span class="dnd-counter-value">
                {counter.current}{#if next != null}/{next}{/if}
              </span>
              <span class="dnd-counter-plus">+1</span>
            </button>
          {/each}
          <button
            class="dnd-end-btn"
            class:confirming={confirmEnd}
            onclick={handleEnd}
          >
            {confirmEnd ? "Confirm?" : "End"}
          </button>
        </div>
      </div>
      {#if actor.conditions.length > 0 || actor.tags.length > 0}
        <div>
          {#each actor.conditions as cond}
            <span class="dnd-condition-chip">{cond}</span>
          {/each}
          {#each actor.tags as tag (tag.id)}
            <span class="dnd-tag-chip" title={tag.note ?? ""}>{tag.name}</span>
          {/each}
        </div>
      {/if}
      <!-- Death-save controls used to live here; they moved to the
           dedicated DeathSaveBar (auto-shown on the action bar when the
           current actor is down). The bar's leftmost skull toggles
           between death-save and regular action bars. -->
      {#if actor.spell_slots && Object.values(actor.spell_slots).some((s) => s.max > 0)}
        <div style="font-size: 12px; color: var(--text-muted);">
          Slots: {#each Object.entries(actor.spell_slots).filter(([_, s]) => s.max > 0) as [level, slot]}
            L{level}:{slot.current}/{slot.max}{" "}
          {/each}
        </div>
      {/if}
      {#if actor.legendary_actions}
        <div style="font-size: 12px; color: var(--text-muted);">
          Legendary: {actor.legendary_actions.current}/{actor.legendary_actions.max}
        </div>
      {/if}
      {#if actor.behavior}
        <div class="dnd-behavior-section">
          <div class="dnd-behavior-label">Behavior</div>
          {#if actor.behavior.motive}
            <div><strong>Motive:</strong> {actor.behavior.motive}</div>
          {/if}
          {#if actor.behavior.priority}
            <div><strong>Priority:</strong> {actor.behavior.priority}</div>
          {/if}
          {#if actor.behavior.movement}
            <div><strong>Movement:</strong> {actor.behavior.movement}</div>
          {/if}
          {#if actor.behavior.flee_at}
            <div><strong>Flee at:</strong> {actor.behavior.flee_at} HP</div>
          {/if}
          {#if actor.behavior.notes}
            <div><strong>Notes:</strong> {actor.behavior.notes}</div>
          {/if}
          {#if actor.behavior.spell_preferences}
            <div class="dnd-behavior-label" style="margin-top: 4px;">Spell Hints</div>
            {#each actor.behavior.spell_preferences as pref}
              <div style="font-size: 12px;">&bull; When {pref.when}: {pref.cast}</div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if readiedCombatants.length > 0}
    <div class="dnd-dropdown-row dnd-readied-row">
      {#each readiedCombatants as readier (readier.id)}
        <button
          type="button"
          class="dnd-ready-resume"
          title="Resume {readier.name}'s readied {readier.readied_action?.via ?? 'action'}"
          onclick={() => resumeReadied(readier)}
        >
          <span class="dnd-ready-resume-icon">&#9201;</span>
          <span class="dnd-ready-resume-name">{readier.name}</span>
          <span class="dnd-ready-resume-label">ready</span>
        </button>
      {/each}
    </div>
  {/if}

  <ul class="dnd-combatant-list">
    {#each encounter.sortedCombatants.filter((c) => c.type !== "object") as combatant (combatant.id)}
      <CombatantRow
        {combatant}
        isCurrent={combatant.id === encounter.currentTurn}
        isSwapped={combatant.id === encounter.swappedActor}
        onSelect={swapTo}
        showZone={true}
        zones={encounter.zones}
      />
    {/each}
  </ul>

  <!-- Add combatant trigger (visible only when the form isn't open) -->
  <div class="dnd-dropdown-row">
    <button class="dnd-bar-btn" style="width: 100%;" onclick={openAddForm}>
      + Add combatant
    </button>
  </div>
  {:else}
    <!-- Add-combatant takeover: replaces the rest of the dropdown until
         Add or Cancel is clicked. -->
    <div class="dnd-dropdown-row" style="flex-direction: column; align-items: stretch; gap: 6px;">
      <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
        Add combatant
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
        <div class="dnd-statblock-autocomplete">
          <input
            type="text"
            class="dnd-action-input medium"
            placeholder={newType === "npc" ? "Name or statblock" : "Name"}
            bind:value={newName}
            oninput={handleNameInput}
          />
        </div>
        {#if suggestions.length > 0}
          <ul class="dnd-statblock-suggestions">
            {#each suggestions as name (name)}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <li
                class="dnd-statblock-suggestion"
                onmousedown={(e) => { e.preventDefault(); pickSuggestion(name); }}
              >{name}</li>
            {/each}
          </ul>
        {/if}
        <input
          type="number"
          inputmode="numeric"
          class="dnd-action-input narrow"
          placeholder="Init"
          bind:value={newInit}
        />
        {#if newType === "npc"}
          <input
            type="number"
            inputmode="numeric"
            class="dnd-action-input narrow"
            placeholder="HP"
            bind:value={newHP}
          />
        {/if}
        <select class="dnd-action-input" bind:value={newType} style="min-width: 60px;">
          <option value="npc">NPC</option>
          <option value="pc">PC</option>
        </select>
        {#if pickedStatblock && newType === "npc"}
          <span class="dnd-statblock-pick-hint" title="HP / resistances / immunities will be filled from the {pickedStatblock} statblock">
            📖 {pickedStatblock}
          </span>
        {/if}
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="dnd-bar-btn" onclick={cancelAdd}>Cancel</button>
        <button class="dnd-bar-btn dnd-add-confirm" onclick={handleAdd}>Add</button>
      </div>
    </div>
  {/if}
</div>
