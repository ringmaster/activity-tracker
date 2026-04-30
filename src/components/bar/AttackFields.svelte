<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { DamageComponent, AuthoredDamage } from "../../types/encounter";
  import { commitAttack } from "../../state/action-logger.svelte";
  import { searchSpells, findSpell, type SrdSpell } from "../../data/spell-lookup";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";
  import DamageInput from "../shared/DamageInput.svelte";

  let { encounter, onDone }: {
    encounter: EncounterState;
    onDone: () => void;
  } = $props();

  let via = $state("");
  let dmgComponents = $state<DamageComponent[]>([{ n: 0, type: "" }]);
  let showTargets = $state(true);
  let showViaSuggestions = $state(false);
  let spellKey = $state("");
  let slot = $state("");
  let isConc = $state(false);
  let isSpell = $state(false);
  let spellDesc = $state<string | null>(null);

  let targets = $state<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({});

  interface ActionSuggestion {
    name: string;
    authoredDmg?: AuthoredDamage[];
    spellDmg?: DamageComponent[];
    isSpell?: boolean;
    spellKey?: string;
    conc?: boolean;
    srdSpell?: SrdSpell;
  }

  // Collect available actions from the current actor: weapon actions, then their spells
  let availableActions = $derived.by((): ActionSuggestion[] => {
    const actor = encounter.effectiveActor;
    if (!actor) return [];

    const results: ActionSuggestion[] = [];

    // Weapon/ability actions
    if (actor.actions) {
      for (const action of actor.actions) {
        results.push({
          name: action.name,
          authoredDmg: action.dmg,
        });
      }
    }

    if (actor.behavior?.extra_actions) {
      for (const action of actor.behavior.extra_actions) {
        results.push({
          name: action.name,
          authoredDmg: action.dmg,
        });
      }
    }

    // Combatant's spells (strings resolved from SRD, objects used directly)
    if (actor.spells) {
      for (const entry of actor.spells) {
        if (typeof entry === "string") {
          // SRD lookup by name
          const srd = findSpell(entry);
          if (srd) {
            results.push({
              name: srd.name,
              authoredDmg: srd.damageType ? [{ dice: srd.dice ?? "", type: srd.damageType }] : undefined,
              isSpell: true,
              conc: srd.concentration,
              srdSpell: srd,
            });
          } else {
            // Unknown spell name; show it anyway without SRD data
            results.push({ name: entry, isSpell: true });
          }
        } else {
          // Fully specified spell object
          results.push({
            name: entry.name,
            spellDmg: entry.dmg,
            isSpell: true,
            spellKey: entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            conc: entry.concentration,
          });
        }
      }
    }

    return results;
  });

  // Combined suggestions: authored actions first, then SRD spells (only when 3+ chars typed)
  let combinedSuggestions = $derived.by((): ActionSuggestion[] => {
    const authoredMatches = via.length > 0
      ? availableActions.filter((a) => a.name.toLowerCase().includes(via.toLowerCase()))
      : availableActions;

    // Only search SRD when 3+ characters are typed
    if (via.length < 3) return authoredMatches;

    const srdMatches = searchSpells(via);
    // Exclude SRD spells that duplicate an authored action name
    const authoredNames = new Set(authoredMatches.map((a) => a.name.toLowerCase()));
    const srdSuggestions: ActionSuggestion[] = srdMatches
      .filter((s) => !authoredNames.has(s.name.toLowerCase()))
      .map((s) => ({
        name: s.name,
        authoredDmg: s.damageType ? [{ dice: s.dice ?? "", type: s.damageType }] : undefined,
        isSpell: true,
        conc: s.concentration,
        srdSpell: s,
      }));

    return [...authoredMatches, ...srdSuggestions];
  });

  let targetLabel = $derived.by(() => {
    const checked = Object.entries(targets).filter(([_, t]) => t.checked);
    const actorName = encounter.effectiveActor?.name ?? "?";
    if (checked.length === 0) return `${actorName} \u2192`;
    if (checked.length === 1) {
      const id = checked[0][0];
      const c = encounter.getCombatant(id);
      return `\u2192 ${c?.name ?? id}`;
    }
    return `\u2192 ${checked.length} targets`;
  });

  function selectAction(action: ActionSuggestion) {
    via = action.name;
    isSpell = !!action.isSpell;

    if (action.srdSpell) {
      spellDesc = action.srdSpell.desc;
      if (action.srdSpell.damageType) {
        dmgComponents = [{ n: 0, type: action.srdSpell.damageType }];
      }
      if (action.srdSpell.concentration) {
        isConc = true;
      }
    } else {
      spellDesc = null;
      if (action.authoredDmg && action.authoredDmg.length > 0) {
        dmgComponents = action.authoredDmg.map((d) => ({ n: 0, type: d.type }));
      } else if (action.spellDmg && action.spellDmg.length > 0) {
        dmgComponents = action.spellDmg.map((d) => ({ n: 0, type: d.type }));
      }
      if (action.isSpell && action.spellKey) {
        spellKey = action.spellKey;
      }
      if (action.conc) {
        isConc = true;
      }
    }

    showViaSuggestions = false;

    // Focus the damage number input after selection
    requestAnimationFrame(() => {
      const dmgInput = document.querySelector(".dnd-dmg-number") as HTMLInputElement | null;
      dmgInput?.focus();
    });
  }

  function handleViaInput(event: Event) {
    via = (event.target as HTMLInputElement).value;
    showViaSuggestions = combinedSuggestions.length > 0;

    // Typing clears the selected spell state; a new selection is needed
    spellDesc = null;
    isSpell = false;
  }

  function handleViaFocus() {
    showViaSuggestions = combinedSuggestions.length > 0;
  }

  function handleViaBlur() {
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
      targets: selectedTargets,
      spellKey: spellKey || undefined,
      slot: slot ? parseInt(slot, 10) : undefined,
      conc: isConc || undefined,
      isSpell: isSpell || undefined,
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
    class="dnd-action-input medium dnd-via-input"
    placeholder="via"
    value={via}
    oninput={handleViaInput}
    onfocus={handleViaFocus}
    onblur={handleViaBlur}
  />

  <DamageInput bind:value={dmgComponents} oncommit={handleCommit} />

  <button class="dnd-bar-btn active" onclick={handleCommit}>
    Commit
  </button>
</div>

{#if spellDesc}
  <div class="dnd-spell-desc">{spellDesc}</div>
{/if}

{#if showViaSuggestions && combinedSuggestions.length > 0}
  <div class="dnd-dropdown" style="max-height: 240px;">
    {#each combinedSuggestions as action}
      <button
        class="dnd-dropdown-row dnd-via-suggestion"
        onmousedown={() => selectAction(action)}
      >
        <span class="dnd-via-name">{action.name}</span>
        {#if action.authoredDmg && action.authoredDmg.length > 0}
          <span class="dnd-via-detail">
            {action.authoredDmg.map((d) => `${d.dice} ${d.type}`.trim()).join(" + ")}
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
    bind:selected={targets}
    onClose={() => {
      showTargets = false;
      requestAnimationFrame(() => {
        const viaInput = document.querySelector(".dnd-via-input") as HTMLInputElement | null;
        viaInput?.focus();
      });
    }}
    damageType={dmgComponents[0]?.type}
  />
{/if}
