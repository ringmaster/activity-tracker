<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { Combatant } from "../../types/encounter";
  import { addCombatant } from "../../state/combat-engine.svelte";

  let { encounter, onClose }: {
    encounter: EncounterState;
    onClose: () => void;
  } = $props();

  let showAddForm = $state(false);
  let newName = $state("");
  let newInit = $state("");
  let newHP = $state("");
  let newType = $state<"npc" | "pc">("npc");

  let actor = $derived(encounter.effectiveActor);

  function swapTo(id: string) {
    if (id === encounter.currentTurn) {
      encounter.swappedActor = null;
    } else {
      encounter.swappedActor = id;
    }
    onClose();
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

    addCombatant(encounter, combatant);
    showAddForm = false;
    newName = "";
    newInit = "";
    newHP = "";
    onClose();
  }
</script>

<div class="dnd-dropdown">
  <!-- Current actor state -->
  {#if actor}
    <div class="dnd-dropdown-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
      <strong>{actor.name}</strong>
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

  <!-- Swap-to list -->
  <div class="dnd-dropdown-row" style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
    Swap Actor
  </div>
  {#each encounter.sortedCombatants as combatant (combatant.id)}
    <button
      class="dnd-dropdown-row"
      class:current={combatant.id === encounter.currentTurn}
      onclick={() => swapTo(combatant.id)}
    >
      <span class="dnd-combatant-name">
        {combatant.name}
        {#if combatant.conditions.includes("dead")}
          <span class="dnd-combatant-tag">DEAD</span>
        {/if}
      </span>
      {#if combatant.type === "npc" && combatant.hp}
        <span style="font-size: 12px; color: var(--text-muted);">
          {combatant.hp.current}/{combatant.hp.max}
        </span>
      {/if}
    </button>
  {/each}

  <!-- Add combatant -->
  {#if !showAddForm}
    <div class="dnd-dropdown-row">
      <button class="dnd-bar-btn" style="width: 100%;" onclick={() => { showAddForm = true; }}>
        + Add combatant
      </button>
    </div>
  {:else}
    <div class="dnd-dropdown-row" style="flex-wrap: wrap; gap: 4px;">
      <input
        type="text"
        class="dnd-action-input medium"
        placeholder="Name"
        bind:value={newName}
      />
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
      <button class="dnd-bar-btn" onclick={handleAdd}>Add</button>
    </div>
  {/if}
</div>
