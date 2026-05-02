<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { DamageComponent, AuthoredDamage, TagTrigger, ActionEffect, CombatAction } from "../../types/encounter";
  import { renderSpellDescription } from "../../utils/spell-renderer";
  import { commitAttack, commitHeal, dropConcentration } from "../../state/action-logger.svelte";
  import { generateSpellTag, generateConcentrationTag } from "../../data/spell-tag-generator";
  import { findLibraryAction, searchLibrary } from "../../state/library-loader";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";
  import DamageTypeIcon from "../shared/DamageTypeIcon.svelte";

  type EffectType = "damage" | "condition" | "heal" | "tag" | "concentration" | "failed";

  interface DamageEffect {
    type: "damage";
    amount: number;
    damageType: string;
  }

  interface ConditionEffect {
    type: "condition";
    condition: string;
  }

  interface HealEffect {
    type: "heal";
    amount: number;
  }

  interface TagEffect {
    type: "tag";
    name: string;
    note: string;
    trigger: TagTrigger | "";
  }

  interface ConcentrationEffect {
    type: "concentration";
  }

  interface FailedEffect {
    type: "failed";
  }

  type SpellEffect = DamageEffect | ConditionEffect | HealEffect | TagEffect | ConcentrationEffect | FailedEffect;

  const COMMON_CONDITIONS = [
    "blinded", "charmed", "deafened", "frightened", "grappled",
    "incapacitated", "invisible", "paralyzed", "petrified",
    "poisoned", "prone", "restrained", "stunned", "unconscious",
    "downed", "dead",
  ];

  let { encounter, onDone, preset = "attack" }: {
    encounter: EncounterState;
    onDone: () => void;
    /** "attack" starts with a damage effect and shows all actions.
     *  "cast" starts empty and shows only spells.
     *  "heal" starts with a heal effect. */
    preset?: "attack" | "cast" | "heal";
  } = $props();

  let via = $state("");
  // svelte-ignore state_referenced_locally
  // svelte-ignore state_referenced_locally
  let showTargets = $state(preset === "attack" && encounter.lastTargetIds.length === 0);
  let showViaSuggestions = $state(false);
  let showEffectPicker = $state(false);

  function closeAllDropdowns() {
    showTargets = false;
    showViaSuggestions = false;
    showEffectPicker = false;
  }
  let spellKey = $state("");
  let isConc = $state(false);
  let isSpell = $state(false);
  let selectedVerb = $state<string | undefined>(undefined);
  let diceHint = $state<string | null>(null);
  let spellDesc = $state<string | null>(null);
  let spellDescEl = $state<HTMLElement | null>(null);
  let showSpellMeta = $state(false);

  // Render spell description as markdown with highlighting when it changes
  $effect(() => {
    if (spellDescEl && spellDesc) {
      renderSpellDescription(spellDescEl, spellDesc);
    }
    showSpellMeta = false;
  });

  // svelte-ignore state_referenced_locally
  let effects = $state<SpellEffect[]>(
    preset === "attack"
      ? [{ type: "damage", amount: 0, damageType: "" }]
      : preset === "heal"
        ? [{ type: "heal", amount: 0 }]
        : [],
  );

  // Initialize target selection from last-used targets (persists within a turn)
  function buildInitialTargets(): Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }> {
    const initial: Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }> = {};
    // Pre-populate entries for ALL combatants so the dropdown renders them immediately
    for (const c of encounter.combatants ?? []) {
      const wasSelected = encounter.lastTargetIds.includes(c.id);
      const isDead = (c.conditions ?? []).includes("dead");
      initial[c.id] = { checked: wasSelected && !isDead, outcome: "full" };
    }
    return initial;
  }
  let targets = $state<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>(buildInitialTargets());

  let cancelIcon = $derived(
    preset === "attack" ? "\u2694" : preset === "cast" ? "\u2728" : "\u2764",
  );

  // --- Via suggestions ---

  interface ActionSuggestion {
    name: string;
    authoredDmg?: AuthoredDamage[];
    spellDmg?: DamageComponent[];
    isSpell?: boolean;
    spellKey?: string;
    conc?: boolean;
    verb?: string;
    actionEffects?: ActionEffect[];
    libAction?: CombatAction;
    note?: string;
    source?: string;
  }

  /** Build authoredDmg from either the dmg array or the top-level damageType/dice fields. */
  function getDmgFromAction(action: CombatAction): AuthoredDamage[] | undefined {
    if (action.dmg && action.dmg.length > 0) return action.dmg;
    if (action.damageType) return [{ dice: action.dice ?? "", type: action.damageType }];
    return undefined;
  }

  /** Resolve a string action reference from the library. */
  function resolveAction(name: string): ActionSuggestion | null {
    const libAction = findLibraryAction(name);
    if (libAction) {
      return {
        name: libAction.name,
        authoredDmg: getDmgFromAction(libAction),
        verb: libAction.verb,
        actionEffects: libAction.effects,
        conc: libAction.concentration,
        isSpell: libAction.type === "spell",
        note: libAction.note,
        source: libAction._source,
        libAction,
      };
    }
    return null;
  }

  /** Convert a CombatAction object to a suggestion. */
  function actionToSuggestion(action: CombatAction): ActionSuggestion {
    return {
      name: action.name,
      authoredDmg: getDmgFromAction(action),
      verb: action.verb,
      actionEffects: action.effects,
      conc: action.concentration,
      isSpell: action.type === "spell",
      note: action.note,
      source: action._source,
      libAction: action,
    };
  }

  let availableActions = $derived.by((): ActionSuggestion[] => {
    const actor = encounter.effectiveActor;
    if (!actor) return [];
    const results: ActionSuggestion[] = [];

    // Actor's actions (strings resolved from library, objects used directly)
    if (preset === "attack" && actor.actions) {
      for (const entry of actor.actions) {
        if (typeof entry === "string") {
          const resolved = resolveAction(entry);
          if (resolved) results.push(resolved);
          else results.push({ name: entry });
        } else {
          results.push(actionToSuggestion(entry));
        }
      }
    }

    // Behavior extra_actions (always inline objects)
    if (preset === "attack" && actor.behavior?.extra_actions) {
      for (const action of actor.behavior.extra_actions) {
        results.push({
          name: action.name,
          authoredDmg: action.dmg,
        });
      }
    }

    // Actor's spells (strings from library then SRD, objects used directly)
    if (actor.spells) {
      for (const entry of actor.spells) {
        if (typeof entry === "string") {
          // Resolve from library (includes SRD spells)
          const libResolved = resolveAction(entry);
          if (libResolved) {
            libResolved.isSpell = true;
            results.push(libResolved);
          } else {
            // Unknown spell; show name without metadata
            results.push({ name: entry, isSpell: true });
          }
        } else {
          results.push({
            name: entry.name, spellDmg: entry.dmg, isSpell: true,
            spellKey: (entry.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            conc: entry.concentration, verb: entry.verb,
            actionEffects: entry.effects,
          });
        }
      }
    }

    return results;
  });

  let combinedSuggestions = $derived.by((): ActionSuggestion[] => {
    const authoredMatches = via.length > 0
      ? availableActions.filter((a) => a.name?.toLowerCase()?.includes(via.toLowerCase()))
      : availableActions;

    if (via.length < 2) return authoredMatches;
    const authoredNames = new Set(authoredMatches.map((a) => (a.name ?? "").toLowerCase()));

    // Library search (includes SRD spells, homebrew, standard actions)
    const libMatches = searchLibrary(via, 15)
      .filter((a) => !authoredNames.has((a.name ?? "").toLowerCase()))
      .map((a) => actionToSuggestion(a));

    return [...authoredMatches, ...libMatches];
  });

  // Force reactivity by reading the full targets object
  let checkedTargetIds = $derived(
    Object.entries(targets)
      .filter(([_, t]) => t.checked)
      .map(([id]) => id),
  );

  let targetLabel = $derived.by(() => {
    const checked = checkedTargetIds;
    const actorName = encounter.effectiveActor?.name ?? "?";
    if (checked.length === 0) {
      return preset === "attack" ? `${actorName} \u2192` : `${actorName} \u2192 Self`;
    }
    if (checked.length === 1) {
      const c = encounter.getCombatant(checked[0]);
      const name = c?.name ?? checked[0];
      const ac = c?.ac != null ? ` (${c.ac})` : "";
      return `\u2192 ${name}${ac}`;
    }
    return `\u2192 ${checked.length} targets`;
  });

  // --- Selection ---

  let selectedLibAction = $state<CombatAction | null>(null);

  function selectAction(action: ActionSuggestion) {
    via = action.name;
    isSpell = !!action.isSpell;
    selectedLibAction = action.libAction ?? null;
    selectedVerb = action.verb;

    // Show desc if available (from library action)
    if (action.libAction?.desc) {
      spellDesc = action.libAction.desc;
    } else {
      spellDesc = null;
    }
    selectedLibAction = action.libAction ?? null;

    // Dice hint and damage effect population
    if (action.authoredDmg && action.authoredDmg.length > 0) {
      const parts = action.authoredDmg
        .filter((d) => d.dice)
        .map((d) => `${d.dice} ${d.type}`);
      diceHint = parts.length > 0 ? parts.join(" + ") : null;
      if (preset !== "heal") setDamageEffects(action.authoredDmg);
    } else if (action.libAction?.damageType) {
      diceHint = action.libAction.dice
        ? `${action.libAction.dice} ${action.libAction.damageType}`
        : null;
      if (preset !== "heal") setDamageEffects([{ dice: "", type: action.libAction.damageType }]);
    } else if (action.spellDmg && action.spellDmg.length > 0) {
      diceHint = null;
      if (preset !== "heal") setDamageEffects(action.spellDmg.map((d) => ({ dice: "", type: d.type })));
    } else {
      diceHint = null;
    }

    // Concentration
    if (action.conc || action.libAction?.concentration) isConc = true;
    if (action.isSpell && action.spellKey) spellKey = action.spellKey;

    // Auto-generate a tag effect from description, but only if the action
    // doesn't have explicit effects (authored effects take priority)
    if (action.libAction?.desc && !action.actionEffects?.length) {
      const autoTag = generateSpellTag(
        action.libAction,
        encounter.effectiveActor?.id ?? "",
        [],
      );
      if (autoTag && autoTag.trigger) {
        if (!effects.some((e) => e.type === "tag")) {
          effects = [...effects, {
            type: "tag",
            name: autoTag.name,
            note: autoTag.onTrigger ?? autoTag.note ?? "",
            trigger: autoTag.trigger,
          }];
        }
      }
    }

    // --- Auto-populate structured effects from action definition ---
    if (action.actionEffects && action.actionEffects.length > 0) {
      for (const ae of action.actionEffects) {
        if (ae.type === "tag" && !effects.some((e) => e.type === "tag" && (e as TagEffect).name === ae.name)) {
          effects = [...effects, {
            type: "tag",
            name: ae.name ?? via,
            note: ae.note ?? "",
            trigger: ae.trigger ?? "",
          }];
        } else if (ae.type === "condition" && !effects.some((e) => e.type === "condition" && (e as ConditionEffect).condition === ae.name)) {
          effects = [...effects, {
            type: "condition",
            condition: ae.name ?? "",
          }];
        } else if (ae.type === "concentration" && !effects.some((e) => e.type === "concentration")) {
          effects = [...effects, { type: "concentration" }];
          isConc = true;
        } else if (ae.type === "damage" && ae.trigger) {
          // Deferred damage: create a tag effect with damage info embedded
          effects = [...effects, {
            type: "tag",
            name: ae.name ?? via,
            note: buildDeferredDamageNote(ae),
            trigger: ae.trigger,
            _damageType: ae.damageType,
            _dice: ae.dice,
            _save: ae.save,
            _on: ae.on ?? "target",
          } as any];
        } else if (ae.type === "damage" && !ae.trigger) {
          // Immediate damage: add damage widget
          if (ae.damageType) {
            setDamageEffects([{ dice: ae.dice ?? "", type: ae.damageType }]);
          }
        } else if (ae.type === "heal" && ae.trigger) {
          effects = [...effects, {
            type: "tag",
            name: ae.name ?? via,
            note: `${ae.dice ?? ""} healing${ae.note ? "; " + ae.note : ""}`,
            trigger: ae.trigger,
            _isHeal: true,
            _dice: ae.dice,
            _on: ae.on ?? "ally",
          } as any];
        } else if (ae.type === "heal" && !ae.trigger) {
          // Immediate heal: add heal widget
          effects = [...effects, { type: "heal", amount: 0 }];
        }
      }
    }

    // Concentration from action/spell definition
    if (action.conc && !effects.some((e) => e.type === "concentration")) {
      effects = [...effects, { type: "concentration" }];
      isConc = true;
    }

    showViaSuggestions = false;
    focusFirstEffectInput();
  }

  /** Replace existing damage effects with ones matching the selected action's damage types.
   *  Preserves amounts already entered by the user. */
  function setDamageEffects(dmgSource: { dice?: string; type: string }[]) {
    const existingDmg = effects.filter((e) => e.type === "damage") as DamageEffect[];
    const nonDamage = effects.filter((e) => e.type !== "damage");

    const newDmg: DamageEffect[] = dmgSource.map((d, i) => ({
      type: "damage",
      amount: existingDmg[i]?.amount ?? 0,
      damageType: d.type,
    }));
    effects = [...newDmg, ...nonDamage];
  }

  function buildDeferredDamageNote(ae: ActionEffect): string {
    const parts: string[] = [];
    if (ae.save?.stat) parts.push(`${ae.save.stat.toUpperCase()} save`);
    if (ae.dice && ae.damageType) parts.push(`${ae.dice} ${ae.damageType}`);
    else if (ae.damageType) parts.push(ae.damageType);
    if (ae.save?.onSave) parts.push(`${ae.save.onSave} on save`);
    if (ae.note) parts.push(ae.note);
    return parts.join("; ");
  }

  function focusFirstEffectInput() {
    requestAnimationFrame(() => {
      const input = document.querySelector(".dnd-effect-amount") as HTMLInputElement | null;
      input?.focus();
    });
  }

  // --- Via input handlers ---

  function handleViaInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const val = input.value;

    // If the typed value is a number, move it to the first damage field
    if (/^\d+$/.test(val)) {
      via = "";
      input.value = "";
      const dmgEffect = effects.find((e) => e.type === "damage") as DamageEffect | undefined;
      if (dmgEffect) {
        dmgEffect.amount = parseInt(val, 10);
      }
      showViaSuggestions = false;
      requestAnimationFrame(() => {
        const dmgInput = document.querySelector(".dnd-dmg-number") as HTMLInputElement | null;
        if (dmgInput) {
          dmgInput.focus();
          // Place cursor after the number
          const len = String(dmgEffect?.amount ?? "").length;
          dmgInput.setSelectionRange(len, len);
        }
      });
      return;
    }

    via = val;
    showTargets = false;
    showEffectPicker = false;
    showViaSuggestions = combinedSuggestions.length > 0;
    spellDesc = null;
    isSpell = false;
    diceHint = null;
  }

  function handleViaFocus() {
    showTargets = false;
    showEffectPicker = false;
    showViaSuggestions = combinedSuggestions.length > 0;
  }

  function handleViaBlur() {
    setTimeout(() => { showViaSuggestions = false; }, 200);
  }

  // --- Effects ---

  function addEffect(effectType: EffectType) {
    if (effectType === "damage") {
      effects = [...effects, { type: "damage", amount: 0, damageType: "" }];
    } else if (effectType === "condition") {
      effects = [...effects, { type: "condition", condition: "" }];
    } else if (effectType === "heal") {
      effects = [...effects, { type: "heal", amount: 0 }];
    } else if (effectType === "tag") {
      effects = [...effects, { type: "tag", name: via || "", note: "", trigger: "" }];
    } else if (effectType === "concentration") {
      // Only one concentration effect makes sense
      if (!effects.some((e) => e.type === "concentration")) {
        effects = [...effects, { type: "concentration" }];
        isConc = true;
      }
    } else if (effectType === "failed") {
      // Replace all existing effects with a single failed marker
      effects = [{ type: "failed" }];
    }
    showEffectPicker = false;
    focusFirstEffectInput();
  }

  function removeEffect(index: number) {
    effects = effects.filter((_, i) => i !== index);
  }

  // --- Commit ---

  function handleCommit() {
    const actor = encounter.effectiveActor;
    if (!actor) return;

    let selectedTargets = Object.entries(targets)
      .filter(([_, t]) => t.checked)
      .map(([id, t]) => ({ who: id, outcome: t.outcome }));

    // If no targets selected: attacks require a target; casts/heals default to self
    if (selectedTargets.length === 0) {
      if (preset === "attack") return;
      selectedTargets = [{ who: actor.id, outcome: "full" as const }];
    }

    const isFailed = effects.some((e) => e.type === "failed");

    // If failed, log the attempt with no effects applied
    if (isFailed) {
      const isSpellAction = isSpell || preset === "cast";
      encounter.logInsert({
        attack: {
          by: actor.id,
          via: via || (preset === "attack" ? "attack" : "spell"),
          verb: selectedVerb,
          spell: isSpellAction || undefined,
          failed: true,
          tgt: selectedTargets.map((t) => ({ who: t.who, hit: "zero" as const })),
        },
      } as any);

      encounter.lastTargetIds = selectedTargets.map((t) => t.who);
      encounter.flush();
      onDone();
      return;
    }

    // Collect damage effects into baseDmg
    const damageEffects = effects.filter((e) => e.type === "damage") as DamageEffect[];
    const baseDmg: DamageComponent[] = damageEffects
      .filter((d) => d.amount > 0)
      .map((d) => ({ n: d.amount, type: d.damageType }));

    // Apply healing effects
    const healEffects = effects.filter((e) => e.type === "heal") as HealEffect[];
    const totalHeal = healEffects.reduce((sum, h) => sum + h.amount, 0);

    // Apply condition effects
    const conditionEffects = effects.filter((e) => e.type === "condition") as ConditionEffect[];
    const conditions = conditionEffects
      .map((c) => c.condition)
      .filter((c) => c.length > 0);

    // Build ActionEffect[] from the current effects for saving to the library
    const learnableEffects: ActionEffect[] = [];
    for (const eff of effects) {
      if (eff.type === "tag") {
        learnableEffects.push({
          type: "tag",
          name: (eff as TagEffect).name,
          on: "target",
          trigger: (eff as TagEffect).trigger || undefined,
          note: (eff as TagEffect).note || undefined,
        });
      } else if (eff.type === "condition") {
        learnableEffects.push({
          type: "condition",
          name: (eff as ConditionEffect).condition,
          on: "target",
        });
      } else if (eff.type === "concentration") {
        learnableEffects.push({ type: "concentration" });
      }
    }

    // Log as attack/spell if there's damage or it's an action
    if (baseDmg.length > 0 || preset === "attack" || preset === "cast" || selectedVerb) {
      commitAttack(encounter, {
        by: actor.id,
        via: via || (preset === "attack" ? "attack" : "spell"),
        baseDmg,
        targets: selectedTargets,
        spellKey: spellKey || undefined,
        conc: isConc || undefined,
        isSpell: isSpell || preset === "cast" || undefined,
        verb: selectedVerb,
        actionEffects: learnableEffects.length > 0 ? learnableEffects : undefined,
      });
    }

    // Apply healing to targets
    if (totalHeal > 0) {
      commitHeal(encounter, {
        by: actor.id,
        via: via || undefined,
        targets: selectedTargets.map((t) => ({ who: t.who, hp: totalHeal })),
      });
    }

    // Apply conditions to targets
    if (conditions.length > 0) {
      const affectedTargetIds = selectedTargets.map((t) => t.who);
      for (const targetId of affectedTargetIds) {
        const combatant = encounter.getCombatant(targetId);
        if (!combatant) continue;
        for (const condition of conditions) {
          if (!combatant.conditions.includes(condition)) {
            combatant.conditions.push(condition);
          }
          if (condition === "dead" && combatant.type === "npc" && combatant.hp) {
            combatant.hp.current = 0;
          }
          // Auto-drop concentration on death or incapacitation
          if ((condition === "dead" || condition === "incapacitated") &&
              (combatant.tags ?? []).some((t) => t.name.startsWith("Concentrating:"))) {
            dropConcentration(encounter, combatant.id);
          }
        }
      }
      encounter.logInsert({
        condition: {
          by: actor.id,
          tgt: affectedTargetIds,
          conditions,
          via: via || undefined,
        },
      });
    }

    // Apply tag effects to targets
    const tagEffects = effects.filter((e) => e.type === "tag") as TagEffect[];
    if (tagEffects.length > 0) {
      const affectedTargetIds = selectedTargets.map((t) => t.who);
      for (const tagEffect of tagEffects) {
        if (!tagEffect.name) continue;
        const tagAny = tagEffect as any;
        const hasDeferredEffect = !!(tagAny._damageType || tagAny._isHeal);
        const effectOn = tagAny._on ?? "target";

        if (hasDeferredEffect && (effectOn === "self" || effectOn === "enemy" || effectOn === "ally")) {
          // Deferred effect on self/enemy/ally: tag goes on the ACTOR
          // with resolveTarget pointing to the selected target(s)
          const firstTarget = affectedTargetIds.find((id) => id !== actor.id) ?? affectedTargetIds[0];
          actor.tags.push({
            id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: tagEffect.name,
            source: actor.id,
            note: tagEffect.note || undefined,
            trigger: tagEffect.trigger || undefined,
            onTrigger: tagEffect.note || undefined,
            autoRemove: "manual",
            damageType: tagAny._damageType || undefined,
            dice: tagAny._dice || undefined,
            save: tagAny._save || undefined,
            isHeal: tagAny._isHeal || undefined,
            resolveTarget: firstTarget !== actor.id ? firstTarget : undefined,
          });
        } else {
          // Regular tag: placed on each selected target
          for (const targetId of affectedTargetIds) {
            const combatant = encounter.getCombatant(targetId);
            if (!combatant) continue;
            combatant.tags.push({
              id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: tagEffect.name,
              source: actor.id,
              note: tagEffect.note || undefined,
              trigger: tagEffect.trigger || undefined,
              onTrigger: tagEffect.note || undefined,
              autoRemove: "manual",
              damageType: tagAny._damageType || undefined,
              dice: tagAny._dice || undefined,
              save: tagAny._save || undefined,
              isHeal: tagAny._isHeal || undefined,
            });
          }
        }
      }
      // Log once per tag effect, not once per target
      for (const tagEffect of tagEffects) {
        if (!tagEffect.name) continue;
        encounter.logInsert({
          tag: {
            by: actor.id,
            tgt: affectedTargetIds,
            name: tagEffect.name,
            note: tagEffect.note || undefined,
            via: via || undefined,
          },
        });
      }
    }

    // Auto-add concentration tag to the caster
    if (isConc) {
      const concTag = generateConcentrationTag(via, actor.id);
      actor.tags.push(concTag);
    }

    encounter.lastTargetIds = selectedTargets.map((t) => t.who);
    encounter.flush();
    onDone();
  }
</script>

<div class="dnd-action-bar">
  <button class="dnd-bar-btn active" onclick={onDone} title="Cancel">{cancelIcon}</button>

  <button class="dnd-bar-btn" onclick={() => { const next = !showTargets; closeAllDropdowns(); showTargets = next; }}>
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

  <!-- Effect widgets -->
  {#each effects as effect, idx (idx)}
    {#if effect.type === "damage"}
      <div class="dnd-effect-widget">
        <input
          type="number"
          inputmode="numeric"
          class="dnd-action-input narrow dnd-effect-amount dnd-dmg-number"
          placeholder="dmg"
          value={effect.amount || ""}
          oninput={(e) => { effect.amount = parseInt((e.target as HTMLInputElement).value, 10) || 0; }}
          onkeydown={(e) => { if (e.key === "Enter") handleCommit(); }}
        />
        <DamageTypeIcon bind:value={effect.damageType} />
        {#if effects.length > 1 || preset === "cast"}
          <button class="dnd-effect-remove" onclick={() => removeEffect(idx)}>&times;</button>
        {/if}
      </div>
    {:else if effect.type === "heal"}
      <div class="dnd-effect-widget">
        <input
          type="number"
          inputmode="numeric"
          class="dnd-action-input narrow dnd-effect-amount"
          placeholder="HP"
          value={effect.amount || ""}
          oninput={(e) => { effect.amount = parseInt((e.target as HTMLInputElement).value, 10) || 0; }}
          onkeydown={(e) => { if (e.key === "Enter") handleCommit(); }}
        />
        <span class="dnd-effect-label">heal</span>
        {#if effects.length > 1 || preset === "cast"}
          <button class="dnd-effect-remove" onclick={() => removeEffect(idx)}>&times;</button>
        {/if}
      </div>
    {:else if effect.type === "condition"}
      <div class="dnd-effect-widget">
        <select
          class="dnd-action-input"
          value={effect.condition}
          onchange={(e) => { effect.condition = (e.target as HTMLSelectElement).value; }}
        >
          <option value="">condition...</option>
          {#each COMMON_CONDITIONS as cond}
            <option value={cond}>{cond}</option>
          {/each}
        </select>
        {#if effects.length > 1 || preset === "cast"}
          <button class="dnd-effect-remove" onclick={() => removeEffect(idx)}>&times;</button>
        {/if}
      </div>
    {:else if effect.type === "tag"}
      <div class="dnd-effect-widget dnd-tag-widget">
        <span class="dnd-effect-label">&#127991;</span>
        <input
          type="text"
          class="dnd-action-input narrow"
          placeholder="tag"
          value={effect.name}
          oninput={(e) => { effect.name = (e.target as HTMLInputElement).value; }}
        />
        <input
          type="text"
          class="dnd-action-input medium"
          placeholder="reminder"
          value={effect.note}
          oninput={(e) => { effect.note = (e.target as HTMLInputElement).value; }}
        />
        <select
          class="dnd-action-input"
          style="min-width: 50px;"
          value={effect.trigger}
          onchange={(e) => { effect.trigger = (e.target as HTMLSelectElement).value as TagTrigger | ""; }}
        >
          <option value="">no trigger</option>
          <option value="start_of_turn">start of turn</option>
          <option value="end_of_turn">end of turn</option>
          <option value="on_ally_turn">on ally turn</option>
          <option value="on_enemy_turn">on enemy turn</option>
          <option value="when_damaged">when damaged</option>
        </select>
        <button class="dnd-effect-remove" onclick={() => removeEffect(idx)}>&times;</button>
      </div>
    {:else if effect.type === "concentration"}
      <div class="dnd-effect-widget dnd-conc-widget">
        <span class="dnd-effect-label">Conc</span>
        <button class="dnd-effect-remove" onclick={() => { removeEffect(idx); isConc = false; }}>&times;</button>
      </div>
    {:else if effect.type === "failed"}
      <div class="dnd-effect-widget dnd-failed-widget">
        <span class="dnd-effect-label">{preset === "attack" ? "Miss" : "Failed"}</span>
        <button class="dnd-effect-remove" onclick={() => removeEffect(idx)}>&times;</button>
      </div>
    {/if}
  {/each}

  <!-- Add effect button -->
  <div style="position: relative;">
    <button
      class="dnd-bar-btn"
      onclick={() => { const next = !showEffectPicker; closeAllDropdowns(); showEffectPicker = next; }}
      title="Add effect"
    >+</button>
    {#if showEffectPicker}
      <div class="dnd-dropdown dnd-effect-picker">
        <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("damage")}>
          <span class="dnd-via-name">Damage</span>
        </button>
        <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("condition")}>
          <span class="dnd-via-name">Condition</span>
        </button>
        <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("heal")}>
          <span class="dnd-via-name">Heal</span>
        </button>
        <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("tag")}>
          <span class="dnd-via-name">Tag</span>
          <span class="dnd-via-detail">ongoing effect with reminder</span>
        </button>
        <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("concentration")}>
          <span class="dnd-via-name">Concentration</span>
          <span class="dnd-via-detail">caster must concentrate</span>
        </button>
        <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("failed")}>
          <span class="dnd-via-name">{preset === "attack" ? "Miss" : "Failed"}</span>
          <span class="dnd-via-detail">action has no effect</span>
        </button>
      </div>
    {/if}
  </div>

  <button class="dnd-bar-btn active" onclick={handleCommit}>Commit</button>
</div>

{#if diceHint}
  <div class="dnd-dice-hint">Roll: {diceHint}</div>
{/if}

{#if spellDesc}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dnd-spell-desc"
    bind:this={spellDescEl}
    role="button"
    aria-label="Tap to show spell details"
    onclick={() => { showSpellMeta = !showSpellMeta; }}
  ></div>
  {#if showSpellMeta && selectedLibAction}
    <div class="dnd-spell-meta">
      <div class="dnd-spell-meta-row"><strong>Level:</strong> {selectedLibAction.level === 0 ? "Cantrip" : selectedLibAction.level}</div>
      {#if selectedLibAction.school}
        <div class="dnd-spell-meta-row"><strong>School:</strong> {selectedLibAction.school}</div>
      {/if}
      {#if selectedLibAction.casting_time}
        <div class="dnd-spell-meta-row"><strong>Casting time:</strong> {selectedLibAction.casting_time}</div>
      {/if}
      {#if selectedLibAction.range}
        <div class="dnd-spell-meta-row"><strong>Range:</strong> {selectedLibAction.range}</div>
      {/if}
      {#if selectedLibAction.areaOfEffect}
        <div class="dnd-spell-meta-row"><strong>Area:</strong> {selectedLibAction.areaOfEffect}</div>
      {/if}
      {#if selectedLibAction.duration}
        <div class="dnd-spell-meta-row"><strong>Duration:</strong> {selectedLibAction.duration}</div>
      {/if}
      {#if selectedLibAction.concentration}
        <div class="dnd-spell-meta-row"><strong>Concentration:</strong> Yes</div>
      {/if}
      {#if selectedLibAction.components}
        <div class="dnd-spell-meta-row"><strong>Components:</strong> {selectedLibAction.components}</div>
      {/if}
      {#if selectedLibAction.material}
        <div class="dnd-spell-meta-row"><strong>Material:</strong> {selectedLibAction.material}</div>
      {/if}
      {#if selectedLibAction.ritual}
        <div class="dnd-spell-meta-row"><strong>Ritual:</strong> Yes</div>
      {/if}
      {#if selectedLibAction.damageType}
        <div class="dnd-spell-meta-row"><strong>Damage:</strong> {selectedLibAction.dice ?? ""} {selectedLibAction.damageType}</div>
      {/if}
      {#if selectedLibAction.saveStat}
        <div class="dnd-spell-meta-row"><strong>Save:</strong> {selectedLibAction.saveStat.toUpperCase()}</div>
      {/if}
      {#if selectedLibAction.saveOnSuccess}
        <div class="dnd-spell-meta-row"><strong>On save:</strong> {selectedLibAction.saveOnSuccess}</div>
      {/if}
      {#if selectedLibAction.classes}
        <div class="dnd-spell-meta-row"><strong>Classes:</strong> {selectedLibAction.classes}</div>
      {/if}
      {#if selectedLibAction.higher_level}
        <div class="dnd-spell-meta-row"><strong>At higher levels:</strong> {selectedLibAction.higher_level}</div>
      {/if}
    </div>
  {/if}
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
        {:else if action.note}
          <span class="dnd-via-detail">{action.note}</span>
        {/if}
        {#if action.isSpell}
          <span class="dnd-via-badge">spell</span>
        {:else if action.verb}
          <span class="dnd-via-badge">{action.verb}</span>
        {/if}
        {#if action.source}
          <span class="dnd-via-source">{action.source}</span>
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
    damageType={(() => {
      const dmg = effects.find((e) => e.type === "damage") as DamageEffect | undefined;
      return dmg?.damageType;
    })()}
  />
{/if}
