<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { DamageComponent, AuthoredDamage } from "../../types/encounter";
  import { commitAttack } from "../../state/action-logger.svelte";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";
  import DamageInput from "../shared/DamageInput.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let via = $state("");
  let dmgComponents = $state<DamageComponent[]>([{ n: 0, type: "" }]);
  let hasSave = $state(false);
  let saveStat = $state("dex");
  let saveDC = $state("");
  let showTargets = $state(true);
  let showViaSuggestions = $state(false);
  let spellKey = $state("");
  let slot = $state("");
  let isConc = $state(false);

  let targets = $state<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({});

  interface ActionSuggestion {
    name: string;
    /** Display-only dice expressions, e.g. [{dice: "2d6+2", type: "slashing"}] */
    authoredDmg?: AuthoredDamage[];
    /** For spells that define numeric damage */
    spellDmg?: DamageComponent[];
    save?: { stat: string; dc: number };
    isSpell?: boolean;
    spellKey?: string;
    conc?: boolean;
  }

  // Collect available actions from the current actor (combatant actions + spells)
  let availableActions = $derived.by((): ActionSuggestion[] => {
    const actor = encounter.effectiveActor;
    if (!actor) return [];

    const results: ActionSuggestion[] = [];

    // Combatant's authored actions
    if (actor.actions) {
      for (const action of actor.actions) {
        results.push({
          name: action.name,
          authoredDmg: action.dmg,
          save: action.save ? { stat: Array.isArray(action.save.stat) ? action.save.stat[0] : action.save.stat, dc: action.save.dc } : undefined,
        });
      }
    }

    // Behavior extra_actions
    if (actor.behavior?.extra_actions) {
      for (const action of actor.behavior.extra_actions) {
        results.push({
          name: action.name,
          authoredDmg: action.dmg,
          save: action.save ? { stat: Array.isArray(action.save.stat) ? action.save.stat[0] : action.save.stat, dc: action.save.dc } : undefined,
        });
      }
    }

    // Encounter spells
    for (const [key, spell] of Object.entries(encounter.spells)) {
      results.push({
        name: spell.name,
        spellDmg: spell.dmg,
        save: spell.save ? { stat: Array.isArray(spell.save.stat) ? spell.save.stat[0] : spell.save.stat, dc: spell.save.dc } : undefined,
        isSpell: true,
        spellKey: key,
        conc: spell.concentration,
      });
    }

    return results;
  });

  let filteredActions = $derived(
    via.length > 0
      ? availableActions.filter((a) => a.name.toLowerCase().includes(via.toLowerCase()))
      : availableActions,
  );

  let targetLabel = $derived.by(() => {
    const checked = Object.entries(targets).filter(([_, t]) => t.checked);
    if (checked.length === 0) return "Targets";
    if (checked.length === 1) {
      const id = checked[0][0];
      const c = encounter.getCombatant(id);
      return c?.name ?? id;
    }
    return `${checked.length} targets`;
  });

  function selectAction(action: ActionSuggestion) {
    via = action.name;

    if (action.authoredDmg && action.authoredDmg.length > 0) {
      // Authored actions: fill in damage types only, leave amount blank for manual entry
      dmgComponents = action.authoredDmg.map((d) => ({ n: 0, type: d.type }));
    } else if (action.spellDmg && action.spellDmg.length > 0) {
      // Spells with numeric damage: fill in types only
      dmgComponents = action.spellDmg.map((d) => ({ n: 0, type: d.type }));
    }

    if (action.save) {
      hasSave = true;
      saveStat = action.save.stat;
      saveDC = String(action.save.dc);
    }
    if (action.isSpell && action.spellKey) {
      spellKey = action.spellKey;
    }
    if (action.conc) {
      isConc = true;
    }
    showViaSuggestions = false;
  }

  function handleViaInput(event: Event) {
    via = (event.target as HTMLInputElement).value;
    showViaSuggestions = filteredActions.length > 0;
  }

  function handleViaFocus() {
    showViaSuggestions = availableActions.length > 0;
  }

  function handleViaBlur() {
    // Delay to allow tap on suggestion
    setTimeout(() => { showViaSuggestions = false; }, 200);
  }

  function handleCommit() {
    const actor = encounter.effectiveActor;
    if (!actor) return;

    const selectedTargets = Object.entries(targets)
      .filter(([_, t]) => t.checked)
      .map(([id, t]) => ({ who: id, outcome: t.outcome }));

    if (selectedTargets.length === 0) return;

    commitAttack(encounter, {
      by: actor.id,
      via: via || "attack",
      baseDmg: dmgComponents.filter((d) => d.n > 0),
      save: hasSave
        ? { stat: saveStat, dc: parseInt(saveDC, 10) || 10 }
        : undefined,
      targets: selectedTargets,
      spellKey: spellKey || undefined,
      slot: slot ? parseInt(slot, 10) : undefined,
      conc: isConc || undefined,
    });

    onDone();
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel attack">&#9876;</button>

  <button class="dnd-bar-btn" onclick={() => { showTargets = !showTargets; }}>
    {targetLabel}
  </button>

  <input
    type="text"
    class="dnd-action-input medium"
    placeholder="via"
    value={via}
    oninput={handleViaInput}
    onfocus={handleViaFocus}
    onblur={handleViaBlur}
  />

  <DamageInput bind:value={dmgComponents} />

  {#if hasSave}
    <input
      type="text"
      class="dnd-action-input narrow"
      placeholder="stat"
      bind:value={saveStat}
    />
    <input
      type="number"
      inputmode="numeric"
      class="dnd-action-input narrow"
      placeholder="DC"
      bind:value={saveDC}
    />
  {/if}

  <button
    class="dnd-bar-btn"
    onclick={() => { hasSave = !hasSave; }}
    class:active={hasSave}
    title="Toggle save"
  >Save</button>

  <button class="dnd-bar-btn active" onclick={handleCommit}>
    Commit
  </button>
</div>

{#if showViaSuggestions && filteredActions.length > 0}
  <div class="dnd-dropdown" style="max-height: 240px;">
    {#each filteredActions as action}
      <button
        class="dnd-dropdown-row dnd-via-suggestion"
        onmousedown={() => selectAction(action)}
      >
        <span class="dnd-via-name">{action.name}</span>
        {#if action.authoredDmg && action.authoredDmg.length > 0}
          <span class="dnd-via-detail">
            {action.authoredDmg.map((d) => `${d.dice} ${d.type}`).join(" + ")}
          </span>
        {:else if action.spellDmg && action.spellDmg.length > 0}
          <span class="dnd-via-detail">
            {action.spellDmg.map((d) => `${d.n} ${d.type}`).join(" + ")}
          </span>
        {/if}
        {#if action.isSpell}
          <span class="dnd-via-badge">spell</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

{#if showTargets}
  <TargetsDropdown
    {encounter}
    showOutcomes={hasSave}
    bind:selected={targets}
    onClose={() => { showTargets = false; }}
    damageType={dmgComponents[0]?.type}
  />
{/if}
