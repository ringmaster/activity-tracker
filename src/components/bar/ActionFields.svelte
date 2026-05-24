<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { DamageComponent, AuthoredDamage, TagTrigger, ActionEffect, CombatAction, ZonePosition } from "../../types/encounter";
  import type { Rider } from "../../types/party";
  import { renderSpellDescription } from "../../utils/spell-renderer";
  import { commitAttack, commitHeal, dropConcentration } from "../../state/action-logger.svelte";
  import { tickCounter } from "../../state/counter-engine.svelte";
  import { generateSpellTag, generateConcentrationTag } from "../../data/spell-tag-generator";
  import { findLibraryAction, searchLibrary } from "../../state/library-loader";
  import TargetsDropdown from "../dropdowns/TargetsDropdown.svelte";
  import DamageTypeIcon from "../shared/DamageTypeIcon.svelte";
  import AddTargetForm from "./AddTargetForm.svelte";
  import { PREPOSITION_ICONS, BUILTIN_PREPOSITIONS } from "../../icons/preposition-icons";

  type EffectType = "damage" | "condition" | "heal" | "tag" | "concentration" | "counter" | "failed";

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

  interface CounterEffect {
    type: "counter";
    counterId: string;
  }

  interface FailedEffect {
    type: "failed";
  }

  type SpellEffect = DamageEffect | ConditionEffect | HealEffect | TagEffect | ConcentrationEffect | CounterEffect | FailedEffect;

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
  let showAutoTags = $state(false);
  let addingTarget = $state(false);

  // Implicit move state -- when the chosen action requires melee range and the
  // selected target is in a different zone, surface a tile suggesting movement.
  // The DM can edit the destination via disclosure or dismiss the move entirely.
  let implicitMoveDismissed = $state(false);
  let implicitMoveOverride = $state<ZonePosition | null>(null);
  let showImplicitMoveDetails = $state(false);
  /** Track which tag indices are auto-populated from the library definition. */
  let autoTagIndices = $state<Set<number>>(new Set());

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
  let actionNote = $state<string | null>(null);
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


  let autoTagCount = $derived(
    effects.filter((_, idx) => autoTagIndices.has(idx) && effects[idx]?.type === "tag").length,
  );

  // Rider toggles: which of the actor's authored riders are active for this
  // commit. Keyed by rider name. Reset whenever the action selection changes.
  let activeRiderNames = $state<Set<string>>(new Set());
  // Damage-rider damage value entry, keyed by rider name. Each damage rider
  // has at most one damage effect in its chip.
  let riderDamageValues = $state<Record<string, number>>({});

  /** Riders authored on the current actor, gated by `when:` against the
   *  current preset. Depleted (uses.current === 0) riders are excluded so
   *  they can't be re-toggled mid-turn. */
  let availableRiders = $derived.by((): Rider[] => {
    const actor = encounter.effectiveActor;
    if (!actor?.riders) return [];
    return actor.riders.filter((r) => {
      if (r.when?.action_type && r.when.action_type !== preset) return false;
      const uses = actor.rider_uses?.[r.name];
      if (uses && uses.current <= 0) return false;
      return true;
    });
  });

  let activeRiders = $derived(
    availableRiders.filter((r) => activeRiderNames.has(r.name)),
  );

  let inactiveRiders = $derived(
    availableRiders.filter((r) => !activeRiderNames.has(r.name)),
  );

  /** The damage type a damage rider with `inherit_type: true` uses: the first
   *  damage type of the currently-selected action. */
  let inheritedDamageType = $derived.by(() => {
    const dmgEffect = effects.find((e) => e.type === "damage") as DamageEffect | undefined;
    return dmgEffect?.damageType ?? "";
  });

  function toggleRider(rider: Rider) {
    const next = new Set(activeRiderNames);
    if (next.has(rider.name)) {
      next.delete(rider.name);
    } else {
      next.add(rider.name);
      // Seed a damage value entry so the input renders empty (not "undefined").
      if (rider.effects.some((e) => e.type === "damage")
          && riderDamageValues[rider.name] == null) {
        riderDamageValues[rider.name] = 0;
      }
    }
    activeRiderNames = next;
  }

  function clearRiderState() {
    activeRiderNames = new Set();
    riderDamageValues = {};
  }

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
    toHit?: number;
    actionEffects?: ActionEffect[];
    libAction?: CombatAction;
    note?: string;
    source?: string;
  }

  /** Build authoredDmg from either the dmg array or the top-level damageType/dice fields.
   *  Skips top-level damageType when effects already include deferred damage via a tag. */
  function getDmgFromAction(action: CombatAction): AuthoredDamage[] | undefined {
    if (action.dmg && action.dmg.length > 0) return action.dmg;
    if (action.damageType) {
      // If the action has effects with deferred damage tags, the top-level
      // damageType is just spell card metadata; damage resolves from the banner.
      const hasDeferredDamage = action.effects?.some(
        (e) => e.type === "tag" && (e.dice || e.damageType),
      );
      if (hasDeferredDamage) return undefined;
      return [{ dice: action.dice ?? "", type: action.damageType }];
    }
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
        toHit: libAction.toHit,
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
      toHit: action.toHit,
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
    // Skip multiattack/reminder actions; they surface as turn reminders, not via options
    if (preset === "attack" && actor.actions) {
      for (const entry of actor.actions) {
        if (typeof entry === "string") {
          const resolved = resolveAction(entry);
          if (resolved) results.push(resolved);
          else results.push({ name: entry });
        } else if (entry.type !== "multiattack" && entry.type !== "reminder") {
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
          toHit: action.toHit,
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

  // Sync selected targets to encounter state for when_targeted banners
  $effect(() => {
    encounter.pendingTargetIds = checkedTargetIds;
    return () => { encounter.pendingTargetIds = []; };
  });

  let selfTargetWarning = $derived(
    checkedTargetIds.length === 1
    && checkedTargetIds[0] === encounter.effectiveActor?.id
    && effects.some((e) => e.type === "damage"),
  );

  /** True for spells whose SRD range is Touch or 5 feet -- caster must be adjacent. */
  let requiresMelee = $derived.by(() => {
    const range = (selectedLibAction?.range ?? "").toLowerCase().trim();
    return range === "touch" || range === "5 feet" || range === "5 ft";
  });

  /** Auto-suggested implicit move: first checked target whose zone differs from actor's. */
  let suggestedImplicitMove = $derived.by((): ZonePosition | null => {
    const actor = encounter.effectiveActor;
    if (!actor?.zone) return null;
    if (!requiresMelee) return null;
    for (const id of checkedTargetIds) {
      const c = encounter.getCombatant(id);
      if (c?.zone && c.zone.id !== actor.zone.id) {
        return { id: c.zone.id };
      }
    }
    return null;
  });

  /** The move that will actually be logged on commit (override > suggestion, unless dismissed). */
  let activeImplicitMove = $derived.by((): ZonePosition | null => {
    if (implicitMoveDismissed) return null;
    if (implicitMoveOverride) return implicitMoveOverride;
    return suggestedImplicitMove;
  });

  let activeImplicitMoveLabel = $derived.by(() => {
    const m = activeImplicitMove;
    if (!m) return null;
    const zoneName = encounter.zones.find((z) => z.id === m.id)?.name ?? m.id;
    return m.preposition ? `${m.preposition} ${zoneName}` : zoneName;
  });

  let targetLabel = $derived.by(() => {
    const checked = checkedTargetIds;
    const actorName = encounter.effectiveActor?.name ?? "?";
    const warn = selfTargetWarning ? " \u26A0\uFE0F" : "";
    if (checked.length === 0) {
      return preset === "attack" ? `${actorName} \u2192` : `${actorName} \u2192 Self`;
    }
    if (checked.length === 1) {
      const c = encounter.getCombatant(checked[0]);
      const name = c?.name ?? checked[0];
      const ac = c?.ac != null ? ` (${c.ac})` : "";
      return `\u2192 ${name}${ac}${warn}`;
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
    actionNote = action.note ?? action.libAction?.note ?? null;
    implicitMoveDismissed = false;
    implicitMoveOverride = null;
    showImplicitMoveDetails = false;
    clearRiderState();

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
      // Skip if damage is deferred via a tag effect (e.g., Spiritual Weapon)
      const hasDeferredDamage = action.libAction.effects?.some(
        (e) => e.type === "tag" && (e.dice || e.damageType),
      );
      if (!hasDeferredDamage) {
        diceHint = action.libAction.dice
          ? `${action.libAction.dice} ${action.libAction.damageType}`
          : null;
        if (preset !== "heal") setDamageEffects([{ dice: "", type: action.libAction.damageType }]);
      }
    } else if (action.spellDmg && action.spellDmg.length > 0) {
      diceHint = null;
      if (preset !== "heal") setDamageEffects(action.spellDmg.map((d) => ({ dice: "", type: d.type })));
    } else {
      // Selected action has no damage data; clear the default empty damage
      // chit (added at component init for the "attack" preset) so abilities
      // like Dissonant Hush don't show a useless 0 dmg slot.
      diceHint = null;
      if (preset !== "heal") setDamageEffects([]);
    }

    // Prepend attack bonus to dice hint.
    // Priority: action's own toHit > combatant's spellAttack (for spells) > combatant's toHit
    const actor = encounter.effectiveActor;
    const actionToHit = action.toHit ?? action.libAction?.toHit;
    const defaultToHit = action.isSpell
      ? (actor?.spellAttack ?? actor?.toHit)
      : actor?.toHit;
    const toHit = actionToHit ?? defaultToHit;
    if (toHit != null) {
      const bonus = toHit >= 0 ? `+${toHit} to hit` : `${toHit} to hit`;
      diceHint = diceHint ? `${bonus}; ${diceHint}` : bonus;
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

    // Drop any counter chips left over from a previously-selected action, so
    // re-selecting doesn't accumulate stale ticks.
    effects = effects.filter((e) => e.type !== "counter");

    // --- Auto-populate structured effects from action definition ---
    if (action.actionEffects && action.actionEffects.length > 0) {
      for (const ae of action.actionEffects) {
        if (ae.type === "counter" && ae.counter) {
          // Show authored counter ticks as visible chips so the DM doesn't
          // double-add manually. Skip duplicates.
          if (!effects.some((e) => e.type === "counter" && (e as CounterEffect).counterId === ae.counter)) {
            effects = [...effects, { type: "counter", counterId: ae.counter }];
          }
          continue;
        }
        if (ae.type === "tag" && !effects.some((e) => e.type === "tag" && (e as TagEffect).name === ae.name)) {
          const newIdx = effects.length;
          effects = [...effects, {
            type: "tag",
            name: ae.name ?? via,
            note: ae.note ?? "",
            trigger: ae.trigger ?? "",
            _on: ae.on ?? "target",
            _damageType: ae.damageType,
            _dice: ae.dice,
            _save: ae.save,
            _uses: ae.uses,
            _resetOn: ae.resetOn,
            _auto: true,
          } as any];
          autoTagIndices = new Set([...autoTagIndices, newIdx]);
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
            _auto: true,
          } as any];
          autoTagIndices = new Set([...autoTagIndices, effects.length - 1]);
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
            _auto: true,
          } as any];
          autoTagIndices = new Set([...autoTagIndices, effects.length - 1]);
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
    actionNote = null;
    implicitMoveDismissed = false;
    implicitMoveOverride = null;
    showImplicitMoveDetails = false;
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
    } else if (effectType === "counter") {
      // Default to the first authored counter; user can swap via the chip dropdown
      const firstCounterId = encounter.counters[0]?.id ?? "";
      if (firstCounterId) {
        effects = [...effects, { type: "counter", counterId: firstCounterId }];
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

    // Log the implicit move BEFORE the action, so the timeline reads:
    // "Wex moves from South of Bridge to On Bridge.  Wex cast Cure Wounds on Lizardman 1."
    const moveTo = activeImplicitMove;
    if (moveTo && actor.zone) {
      const from = { ...actor.zone };
      actor.zone = moveTo;
      encounter.logInsert({
        move: { by: actor.id, from, to: moveTo },
      });
    }

    // --- Rider SETUP phase ---
    // Apply each active rider's tag/condition effects BEFORE the action commit,
    // so the prose reads "Wex hides (Cunning Action). Wex attacks ...".
    // Track applied tags so the CONSUMED phase below can emit effect_ends
    // and pull them back off after the action.
    type AppliedRiderTag = {
      riderName: string;
      tagName: string;
      combatantId: string;
      tagId: string;
      consumed: boolean;
    };
    const appliedRiderTags: AppliedRiderTag[] = [];

    for (const rider of activeRiders) {
      for (const eff of rider.effects) {
        if (eff.type === "tag") {
          const tagName = eff.name ?? rider.name;
          const on = eff.on ?? "self";
          const recipients: string[] = [];
          if (on === "self" || on === "ally") {
            recipients.push(actor.id);
          } else {
            // target/enemy: apply to each selected target
            for (const t of selectedTargets) recipients.push(t.who);
          }
          const ids: string[] = [];
          for (const rid of recipients) {
            const c = encounter.getCombatant(rid);
            if (!c) continue;
            const tagId = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            c.tags.push({
              id: tagId,
              name: tagName,
              source: actor.id,
              note: eff.note,
              trigger: (eff.trigger || undefined) as any,
              onTrigger: eff.note,
              autoRemove: "manual",
            });
            ids.push(tagId);
            appliedRiderTags.push({
              riderName: rider.name,
              tagName,
              combatantId: rid,
              tagId,
              consumed: !!eff.consumed,
            });
          }
          encounter.logInsert({
            tag: {
              by: actor.id,
              tgt: recipients,
              name: tagName,
              note: eff.note,
              via: rider.name,
              ids,
            },
          });
        } else if (eff.type === "condition") {
          const condName = eff.name;
          if (!condName) continue;
          const on = eff.on ?? "target";
          const recipients: string[] = [];
          if (on === "self" || on === "ally") {
            recipients.push(actor.id);
          } else {
            for (const t of selectedTargets) recipients.push(t.who);
          }
          for (const rid of recipients) {
            const c = encounter.getCombatant(rid);
            if (!c) continue;
            if (!c.conditions.includes(condName)) c.conditions.push(condName);
          }
          encounter.logInsert({
            condition: {
              by: actor.id,
              tgt: recipients,
              conditions: [condName],
              via: rider.name,
            },
          });
        }
      }
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

    // Bake rider damage contributions into baseDmg, source-labeled, so the
    // attack log entry carries them and the prose reads
    // "15 slashing + 7 slashing (Sneak Attack)".
    for (const rider of activeRiders) {
      for (const eff of rider.effects) {
        if (eff.type !== "damage") continue;
        const n = riderDamageValues[rider.name] ?? 0;
        if (n <= 0) continue;
        const dmgType = eff.inherit_type ? inheritedDamageType : (eff.damageType ?? "");
        baseDmg.push({ n, type: dmgType, source: rider.name });
      }
    }

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
    // All tags from this commit share a castId for cascade cleanup
    const castId = `cast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // Tag ids generated per tagEffect, in target order. Captured so the log
    // entry below records them and the rewind path can dismiss precisely.
    const tagIdsPerEffect = new Map<TagEffect, { tgt: string[]; ids: string[] }>();
    function newTagId() {
      return `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }
    if (tagEffects.length > 0) {
      const affectedTargetIds = selectedTargets.map((t) => t.who);
      for (const tagEffect of tagEffects) {
        if (!tagEffect.name) continue;
        const tagAny = tagEffect as any;
        const hasDeferredEffect = !!(tagAny._damageType || tagAny._isHeal);
        const effectOn = tagAny._on ?? "target";

        const tagUses = tagAny._uses ? { current: tagAny._uses, max: tagAny._uses } : undefined;
        const tagResetOn = tagAny._resetOn || undefined;

        if (hasDeferredEffect && (effectOn === "self" || effectOn === "enemy" || effectOn === "ally")) {
          // Deferred effect on self/enemy/ally: tag goes on the ACTOR
          // with resolveTarget pointing to the selected target(s)
          const firstTarget = affectedTargetIds.find((id) => id !== actor.id) ?? affectedTargetIds[0];
          const tagId = newTagId();
          actor.tags.push({
            id: tagId,
            name: tagEffect.name,
            source: actor.id,
            note: tagEffect.note || undefined,
            trigger: tagEffect.trigger || undefined,
            onTrigger: tagEffect.note || undefined,
            autoRemove: "manual",
            castId,
            damageType: tagAny._damageType || undefined,
            dice: tagAny._dice || undefined,
            save: tagAny._save || undefined,
            isHeal: tagAny._isHeal || undefined,
            resolveTarget: firstTarget !== actor.id ? firstTarget : undefined,
            uses: tagUses,
            resetOn: tagResetOn,
          });
          tagIdsPerEffect.set(tagEffect, { tgt: [actor.id], ids: [tagId] });
        } else if (effectOn === "self") {
          // Tag goes on the actor
          const tagId = newTagId();
          actor.tags.push({
            id: tagId,
            name: tagEffect.name,
            source: actor.id,
            note: tagEffect.note || undefined,
            trigger: tagEffect.trigger || undefined,
            onTrigger: tagEffect.note || undefined,
            autoRemove: "manual",
            castId,
            uses: tagUses,
            resetOn: tagResetOn,
          });
          tagIdsPerEffect.set(tagEffect, { tgt: [actor.id], ids: [tagId] });
        } else {
          // Tag goes on each selected target
          const tgtOrder: string[] = [];
          const ids: string[] = [];
          for (const targetId of affectedTargetIds) {
            const combatant = encounter.getCombatant(targetId);
            if (!combatant) continue;
            const tagId = newTagId();
            combatant.tags.push({
              id: tagId,
              name: tagEffect.name,
              source: actor.id,
              note: tagEffect.note || undefined,
              trigger: tagEffect.trigger || undefined,
              onTrigger: tagEffect.note || undefined,
              autoRemove: "manual",
              castId,
              uses: tagUses,
              resetOn: tagResetOn,
            });
            tgtOrder.push(targetId);
            ids.push(tagId);
          }
          tagIdsPerEffect.set(tagEffect, { tgt: tgtOrder, ids });
        }
      }
      // Log once per tag effect, but skip auto-populated tags from library
      for (let i = 0; i < tagEffects.length; i++) {
        const tagEffect = tagEffects[i];
        if (!tagEffect.name) continue;
        const effectIdx = effects.indexOf(tagEffect as any);
        if (effectIdx >= 0 && autoTagIndices.has(effectIdx)) continue;
        const captured = tagIdsPerEffect.get(tagEffect);
        encounter.logInsert({
          tag: {
            by: actor.id,
            tgt: captured?.tgt ?? affectedTargetIds,
            name: tagEffect.name,
            note: tagEffect.note || undefined,
            via: via || undefined,
            ids: captured?.ids,
          },
        });
      }
    }

    // Auto-add concentration tag to the caster
    if (isConc) {
      const concTag = generateConcentrationTag(via, actor.id);
      concTag.castId = castId;
      actor.tags.push(concTag);
    }

    // Tick any counters this action contributes to. Counter chips in `effects`
    // cover both authored counter effects (auto-populated on selection) and
    // ones the DM added via the "+" menu.
    const counterIdsToTick = effects
      .filter((e): e is CounterEffect => e.type === "counter")
      .map((e) => e.counterId)
      .filter((id) => id);
    for (const counterId of counterIdsToTick) {
      tickCounter(encounter, counterId, 1, actor.id, via || undefined);
    }

    // --- Rider CONSUMED phase ---
    // For any rider setup tag that authored `consumed: true`, remove it from
    // the recipient and emit an effect_ends entry AFTER the attack, so the
    // prose closes with "Wex is no longer hidden."
    for (const t of appliedRiderTags) {
      if (!t.consumed) continue;
      const c = encounter.getCombatant(t.combatantId);
      if (c) {
        c.tags = c.tags.filter((tag) => tag.id !== t.tagId);
      }
      encounter.logInsert({
        effect_ends: {
          what: t.tagName,
          on: t.combatantId,
          reason: "action_consumed",
        },
      });
    }

    // Decrement rider uses (one per active rider, not per effect).
    if (actor.rider_uses) {
      for (const rider of activeRiders) {
        const u = actor.rider_uses[rider.name];
        if (u && u.current > 0) u.current--;
      }
    }

    encounter.lastTargetIds = selectedTargets.map((t) => t.who);
    encounter.flush();
    onDone();
  }
</script>

{#if addingTarget}
  <AddTargetForm
    {encounter}
    onCancel={() => {
      addingTarget = false;
      showTargets = true;
    }}
    onCreate={(combatantId) => {
      targets[combatantId] = { checked: true, outcome: "full" };
      addingTarget = false;
    }}
  />
{:else}
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
    {:else if effect.type === "tag" && autoTagIndices.has(idx) && !showAutoTags}
      <!-- Auto tags hidden; shown via pill -->
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
    {:else if effect.type === "counter"}
      <div class="dnd-effect-widget dnd-counter-widget">
        <span class="dnd-effect-label">+1</span>
        <select
          class="dnd-action-input"
          value={(effect as CounterEffect).counterId}
          onchange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            effects = effects.map((eff, i) => i === idx && eff.type === "counter" ? { ...eff, counterId: v } : eff);
          }}
        >
          {#each encounter.counters as counter (counter.id)}
            <option value={counter.id}>{counter.name}</option>
          {/each}
        </select>
        <button class="dnd-effect-remove" onclick={() => removeEffect(idx)}>&times;</button>
      </div>
    {:else if effect.type === "failed"}
      <div class="dnd-effect-widget dnd-failed-widget">
        <span class="dnd-effect-label">{preset === "attack" ? "Miss" : "Failed"}</span>
        <button class="dnd-effect-remove" onclick={() => removeEffect(idx)}>&times;</button>
      </div>
    {/if}
  {/each}

  <!-- Auto-tags pill -->
  {#if autoTagCount > 0 && !showAutoTags}
    <button
      class="dnd-auto-tags-pill"
      onclick={() => { showAutoTags = true; }}
      title="Show auto-applied tags"
    >{autoTagCount} tag{autoTagCount > 1 ? "s" : ""} &#9656;</button>
  {:else if autoTagCount > 0 && showAutoTags}
    <button
      class="dnd-auto-tags-pill active"
      onclick={() => { showAutoTags = false; }}
      title="Collapse auto-applied tags"
    >{autoTagCount} tag{autoTagCount > 1 ? "s" : ""} &#9662;</button>
  {/if}

  <!-- Implicit move tile (touch/5ft spell into a different zone) -->
  {#if activeImplicitMove}
    <button
      class="dnd-implicit-move-pill"
      class:active={showImplicitMoveDetails}
      onclick={() => { showImplicitMoveDetails = !showImplicitMoveDetails; }}
      title="Tap to edit or remove the implicit move"
    >&#x21A6; {activeImplicitMoveLabel} {showImplicitMoveDetails ? "▾" : "▸"}</button>
  {/if}

  <!-- Active rider chips (sit to the left of `+`) -->
  {#each activeRiders as rider (rider.name)}
    {@const hasDamage = rider.effects.some((e) => e.type === "damage")}
    {@const dmgEffect = rider.effects.find((e) => e.type === "damage")}
    {@const dmgType = dmgEffect?.inherit_type ? inheritedDamageType : (dmgEffect?.damageType ?? "")}
    {#if hasDamage}
      <button
        class="dnd-rider-chip dnd-rider-active dnd-rider-damage"
        onclick={() => toggleRider(rider)}
        title="Tap to deactivate {rider.name}"
      >
        <span class="dnd-rider-name">{rider.name}</span>
        {#if dmgEffect?.dice}
          <span class="dnd-rider-dice">{dmgEffect.dice}</span>
        {/if}
        <input
          type="number"
          inputmode="numeric"
          class="dnd-action-input narrow"
          placeholder="dmg"
          value={riderDamageValues[rider.name] || ""}
          onclick={(e) => e.stopPropagation()}
          oninput={(e) => { riderDamageValues[rider.name] = parseInt((e.target as HTMLInputElement).value, 10) || 0; }}
        />
        {#if dmgType}
          <span class="dnd-rider-dmg-type">{dmgType}</span>
        {/if}
      </button>
    {:else}
      <button
        class="dnd-rider-chip dnd-rider-active"
        onclick={() => toggleRider(rider)}
        title="Tap to deactivate {rider.name}"
      >
        <span class="dnd-rider-name">{rider.name}</span>
        <span class="dnd-rider-check">&#10003;</span>
      </button>
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
        {#if encounter.counters.length > 0}
          <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("counter")}>
            <span class="dnd-via-name">Counter</span>
            <span class="dnd-via-detail">tick an encounter counter (+1)</span>
          </button>
        {/if}
        <button class="dnd-dropdown-row dnd-via-suggestion" onmousedown={() => addEffect("failed")}>
          <span class="dnd-via-name">{preset === "attack" ? "Miss" : "Failed"}</span>
          <span class="dnd-via-detail">action has no effect</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Inactive rider chips (right of `+`, behind a visual separator) -->
  {#if inactiveRiders.length > 0}
    <span class="dnd-rider-separator" aria-hidden="true"></span>
    {#each inactiveRiders as rider (rider.name)}
      {@const uses = encounter.effectiveActor?.rider_uses?.[rider.name]}
      {@const riderDice = rider.effects.find((e) => e.type === "damage")?.dice}
      <button
        class="dnd-rider-chip dnd-rider-inactive"
        onclick={() => toggleRider(rider)}
        title="Tap to add {rider.name} to this action"
      >
        <span class="dnd-rider-q">?</span>
        <span class="dnd-rider-name">{rider.name}</span>
        {#if riderDice}
          <span class="dnd-rider-dice">{riderDice}</span>
        {/if}
        {#if uses}
          <span class="dnd-rider-uses">({uses.current}/{uses.max})</span>
        {/if}
      </button>
    {/each}
  {/if}

  <button class="dnd-bar-btn active" onclick={handleCommit}>Commit</button>
</div>

{#if showImplicitMoveDetails && activeImplicitMove}
  <div class="dnd-implicit-move-details">
    <div class="dnd-move-row">
      <span class="dnd-effect-label">Move to:</span>
      {#each encounter.zones as zone (zone.id)}
        <button
          class="dnd-bar-btn dnd-zone-btn"
          class:selected={activeImplicitMove.id === zone.id}
          onclick={() => { implicitMoveOverride = { id: zone.id, preposition: activeImplicitMove?.preposition }; }}
        >{zone.name}</button>
      {/each}
    </div>
    <div class="dnd-move-row">
      <span class="dnd-effect-label">Position:</span>
      {#each BUILTIN_PREPOSITIONS as prep}
        <button
          class="dnd-bar-btn dnd-prep-btn"
          class:selected={activeImplicitMove.preposition === prep}
          title={prep}
          onclick={() => {
            const same = activeImplicitMove?.preposition === prep;
            implicitMoveOverride = {
              id: activeImplicitMove!.id,
              preposition: same ? undefined : prep,
            };
          }}
        ><span class="dnd-prep-icon">{@html PREPOSITION_ICONS[prep]}</span></button>
      {/each}
      {#each encounter.prepositions as prep}
        <button
          class="dnd-bar-btn dnd-prep-btn"
          class:selected={activeImplicitMove.preposition === prep}
          title={prep}
          onclick={() => {
            const same = activeImplicitMove?.preposition === prep;
            implicitMoveOverride = {
              id: activeImplicitMove!.id,
              preposition: same ? undefined : prep,
            };
          }}
        >{prep}</button>
      {/each}
      <button
        class="dnd-bar-btn"
        style="margin-left: auto; border-color: var(--text-error); color: var(--text-error);"
        onclick={() => {
          implicitMoveDismissed = true;
          showImplicitMoveDetails = false;
        }}
      >Remove move</button>
    </div>
  </div>
{/if}

{#if diceHint}
  <div class="dnd-dice-hint">Roll: {diceHint}</div>
{:else if actionNote}
  <div class="dnd-dice-hint">{actionNote}</div>
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
        {#if (action.toHit ?? action.libAction?.toHit ?? (action.isSpell ? encounter.effectiveActor?.spellAttack : encounter.effectiveActor?.toHit)) != null}
          {@const effectiveToHit = action.toHit ?? action.libAction?.toHit ?? (action.isSpell ? (encounter.effectiveActor?.spellAttack ?? encounter.effectiveActor?.toHit) : encounter.effectiveActor?.toHit)}
          <span class="dnd-via-tohit">+{effectiveToHit}</span>
        {/if}
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
    onAddTarget={() => {
      showTargets = false;
      addingTarget = true;
    }}
    damageType={(() => {
      const dmg = effects.find((e) => e.type === "damage") as DamageEffect | undefined;
      return dmg?.damageType;
    })()}
  />
{/if}
{/if}
