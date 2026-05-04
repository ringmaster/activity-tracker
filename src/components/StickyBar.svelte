<script lang="ts">
  import type { EncounterState } from "../state/encounter-state.svelte";
  import type { CombatTag } from "../types/encounter";
  import { commitAttack, commitHeal, dropConcentration } from "../state/action-logger.svelte";
  import { findLibraryAction } from "../state/library-loader";
  import { renderSpellDescription } from "../utils/spell-renderer";
  import { CONDITION_DESCRIPTIONS } from "../utils/condition-descriptions";
  import { summarizeLogEntry } from "../utils/log-summary";
  import DefaultBar from "./bar/DefaultBar.svelte";
  import ActionBar from "./bar/ActionBar.svelte";
  import BannerStack from "./banners/BannerStack.svelte";
  import TargetsDropdown from "./dropdowns/TargetsDropdown.svelte";

  let { encounter }: { encounter: EncounterState } = $props();

  // Track which banner spell descriptions are expanded
  let expandedSpellDescs = $state<Set<string>>(new Set());

  function toggleSpellDesc(tagId: string) {
    const next = new Set(expandedSpellDescs);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    expandedSpellDescs = next;
  }

  /** Get the SRD spell name from a tag (strips "Concentrating: " prefix if present). */
  function getSpellNameFromTag(tag: CombatTag): string | null {
    let name = tag.name;
    if (name.startsWith("Concentrating: ")) {
      name = name.slice("Concentrating: ".length);
    }
    const spell = findLibraryAction(name);
    return spell ? spell.name : null;
  }

  function renderSpellDesc(el: HTMLElement, spellName: string) {
    const spell = findLibraryAction(spellName);
    if (!spell?.desc || !el) return;
    renderSpellDescription(el, spell.desc);
    return {
      update(newName: string) {
        const s = findLibraryAction(newName);
        if (!s?.desc) return;
        renderSpellDescription(el, s.desc);
      },
    };
  }

  interface TagBanner {
    tag: CombatTag;
    combatantId: string;
    combatantName: string;
  }

  /** Check if two combatants are on the same side. */
  function areAllies(a: typeof encounter.combatants[0], b: typeof encounter.combatants[0]): boolean {
    const aIsPC = a.type === "pc" ? !a.friendly : !!a.friendly;
    const bIsPC = b.type === "pc" ? !b.friendly : !!b.friendly;
    return aIsPC === bIsPC;
  }

  // Derive tag banners from combatant tags that match the current trigger moment
  let activeBanners = $derived.by((): TagBanner[] => {
    if (!encounter.active || !encounter.currentTurn) return [];
    const currentActor = encounter.getCombatant(encounter.currentTurn);
    if (!currentActor) return [];

    const banners: TagBanner[] = [];

    for (const combatant of encounter.combatants ?? []) {
      if (!(combatant.tags ?? []).length) continue;
      const isDead = (combatant.conditions ?? []).includes("dead");

      for (const tag of combatant.tags) {
        if (!tag.trigger) continue;

        // when_destroyed: fires once HP is at 0 (combatant marked dead). Surfaces
        // even on dead combatants so destruction effects can be resolved.
        if (tag.trigger === "when_destroyed") {
          if (isDead) {
            banners.push({ tag, combatantId: combatant.id, combatantName: combatant.name });
          }
          continue;
        }

        // All other triggers skip dead combatants
        if (isDead) continue;

        // start_of_turn / end_of_turn: fires for the combatant carrying the tag
        if ((tag.trigger === "start_of_turn" || tag.trigger === "end_of_turn")
            && combatant.id === encounter.currentTurn) {
          banners.push({ tag, combatantId: combatant.id, combatantName: combatant.name });
        }

        // on_ally_turn: fires when any ally of the tag source takes their turn
        if (tag.trigger === "on_ally_turn" && tag.source) {
          const source = encounter.getCombatant(tag.source);
          if (source && areAllies(source, currentActor)) {
            banners.push({
              tag,
              combatantId: currentActor.id,
              combatantName: `${currentActor.name} (${combatant.name})`,
            });
          }
        }

        // on_enemy_turn: fires when any enemy of the tag source takes their turn
        if (tag.trigger === "on_enemy_turn" && tag.source) {
          const source = encounter.getCombatant(tag.source);
          if (source && !areAllies(source, currentActor)) {
            banners.push({
              tag,
              combatantId: currentActor.id,
              combatantName: `${currentActor.name} (${combatant.name})`,
            });
          }
        }

        // when_damaged: concentration save banners surface immediately (any turn)
        if (tag.trigger === "when_damaged" && tag.name.startsWith("Concentration:")) {
          banners.push({ tag, combatantId: combatant.id, combatantName: combatant.name });
        }

        // when_targeted: fires when this combatant is selected as a target in the action bar
        if (tag.trigger === "when_targeted" && encounter.pendingTargetIds.includes(combatant.id)) {
          banners.push({ tag, combatantId: combatant.id, combatantName: combatant.name });
        }
      }
    }

    return banners;
  });

  // Current turn's action log, using the tracked log index
  let turnLog = $derived.by(() => {
    const log = encounter.log;
    const who = encounter.currentTurn;
    if (log.length === 0 || !who) return [];

    // Use the tracked index if valid; otherwise find by searching
    let turnStartIdx = encounter.currentTurnLogIndex;
    if (turnStartIdx < 0 || turnStartIdx >= log.length) {
      for (let i = log.length - 1; i >= 0; i--) {
        const entry = log[i] as any;
        if (entry.start_turn && entry.start_turn.who === who) {
          turnStartIdx = i;
          break;
        }
      }
    }
    if (turnStartIdx < 0) return [];

    // Verify the index points to the right actor
    const startEntry = log[turnStartIdx] as any;
    if (!startEntry?.start_turn || startEntry.start_turn.who !== who) {
      return [];
    }

    const entries: { text: string; logIndex: number; canUndo: boolean }[] = [];
    for (let i = turnStartIdx + 1; i < log.length; i++) {
      if ("start_turn" in log[i]) break;
      const summary = summarizeLogEntry(log[i], encounter);
      const isDeath = "death" in log[i];
      if (summary) entries.push({ text: summary, logIndex: i, canUndo: !isDeath });
    }
    return entries;
  });


  let confirmDeleteIdx = $state<number | null>(null);
  let expandedCondition = $state<string | null>(null);

  function passConcentration(banner: TagBanner) {
    // Remove the concentration save tag; concentration maintained
    const combatant = encounter.getCombatant(banner.combatantId);
    if (combatant) {
      combatant.tags = combatant.tags.filter((t) => t.id !== banner.tag.id);
      encounter.logInsert({
        save: {
          who: banner.combatantId,
          stat: "con",
          dc: parseInt(banner.tag.note?.match(/DC (\d+)/)?.[1] ?? "10", 10),
          result: "pass",
          for: banner.tag.name.replace("Concentration: ", ""),
        },
      });
      encounter.flush();
    }
  }

  function failConcentration(banner: TagBanner) {
    // Remove the save tag and drop concentration
    const combatant = encounter.getCombatant(banner.combatantId);
    if (combatant) {
      combatant.tags = combatant.tags.filter((t) => t.id !== banner.tag.id);
      encounter.logInsert({
        save: {
          who: banner.combatantId,
          stat: "con",
          dc: parseInt(banner.tag.note?.match(/DC (\d+)/)?.[1] ?? "10", 10),
          result: "fail",
          for: banner.tag.name.replace("Concentration: ", ""),
        },
      });
      dropConcentration(encounter, banner.combatantId);
      encounter.flush();
    }
  }

  // Resolve flow state for deferred damage/heal banners
  let resolvingTagId = $state<string | null>(null);
  let resolveAmount = $state<number>(0);
  let resolveTargets = $state<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({});
  let showResolveTargets = $state(false);

  function startResolve(tagId: string) {
    if (resolvingTagId === tagId) {
      resolvingTagId = null;
      showResolveTargets = false;
      return;
    }
    resolvingTagId = tagId;
    resolveAmount = 0;
    showResolveTargets = false;

    // If the tag has a pre-set resolveTarget, seed the selection with it.
    const tag = encounter.combatants
      .flatMap((c) => c.tags)
      .find((t) => t.id === tagId);
    resolveTargets = {};
    if (tag?.resolveTarget) {
      resolveTargets[tag.resolveTarget] = { checked: true, outcome: "full" };
    }
  }

  function commitResolve(banner: TagBanner) {
    const tag = banner.tag;
    const sourceId = tag.source ?? banner.combatantId;

    const checkedTargets = Object.entries(resolveTargets).filter(([_, t]) => t.checked);
    if (checkedTargets.length === 0) return;

    // Check uses; don't resolve if depleted
    if (tag.uses && tag.uses.current <= 0) return;

    if (tag.isHeal && resolveAmount > 0) {
      commitHeal(encounter, {
        by: sourceId,
        via: tag.name,
        resolved: true,
        targets: checkedTargets.map(([id]) => ({ who: id, hp: resolveAmount })),
      });
    } else if (tag.damageType && resolveAmount > 0) {
      // commitAttack scales baseDmg per-target via outcome (Hit/Half/Zero),
      // so a single call covers all selected targets in one log entry.
      commitAttack(encounter, {
        by: sourceId,
        via: tag.name,
        isSpell: true,
        resolved: true,
        baseDmg: [{ n: resolveAmount, type: tag.damageType }],
        targets: checkedTargets.map(([id, t]) => ({ who: id, outcome: t.outcome })),
      });
    }

    // Decrement uses
    if (tag.uses) {
      tag.uses.current = Math.max(0, tag.uses.current - 1);
    }

    resolvingTagId = null;
    resolveTargets = {};
    showResolveTargets = false;
    encounter.flush();
  }

  let resolveCheckedCount = $derived(
    Object.values(resolveTargets).filter((t) => t.checked).length,
  );

  /** Spend one use of a tag without resolving damage/heal. For resources like Legendary Resistance. */
  function spendUse(banner: TagBanner) {
    const tag = banner.tag;
    if (!tag.uses || tag.uses.current <= 0) return;
    tag.uses.current--;

    // Log the use
    encounter.logInsert({
      note: {
        by: banner.combatantId,
        text: `Used ${tag.name} (${tag.uses.current}/${tag.uses.max} remaining).`,
      },
    });

    encounter.flush();
  }

  function renderConditionDesc(el: HTMLElement, cond: string) {
    renderSpellDescription(el, CONDITION_DESCRIPTIONS[cond] ?? "");
    return {
      update(newCond: string) {
        renderSpellDescription(el, CONDITION_DESCRIPTIONS[newCond] ?? "");
      },
    };
  }

  function requestDelete(logIndex: number) {
    if (confirmDeleteIdx === logIndex) {
      revertAndDelete(logIndex);
      confirmDeleteIdx = null;
    } else {
      confirmDeleteIdx = logIndex;
    }
  }

  function revertAndDelete(logIndex: number) {
    const entry = encounter.log[logIndex] as any;
    if (!entry) return;

    // Revert attack/spell damage
    if (entry.attack) {
      for (const t of entry.attack.tgt) {
        if (t.dmg && t.dmg.length > 0) {
          const total = t.dmg.reduce((s: number, d: any) => s + d.n, 0);
          const combatant = encounter.getCombatant(t.who);
          if (combatant) {
            if (combatant.type === "npc" && combatant.hp) {
              combatant.hp.current = Math.min(combatant.hp.current + total, combatant.hp.max);
              // Remove dead condition if HP restored above 0
              if (combatant.hp.current > 0) {
                combatant.conditions = combatant.conditions.filter((c) => c !== "dead");
                // Also remove the death log entry if it immediately follows
                for (let j = logIndex + 1; j < encounter.log.length; j++) {
                  const next = encounter.log[j] as any;
                  if (next.death && next.death.who === t.who) {
                    encounter.log.splice(j, 1);
                    break;
                  }
                  if (next.start_turn) break;
                }
              }
            } else if (combatant.type === "pc") {
              combatant.damage_taken = Math.max(0, (combatant.damage_taken ?? 0) - total);
            }
          }
        }
      }
    }

    // Revert heal
    if (entry.heal) {
      for (const t of entry.heal.tgt) {
        const combatant = encounter.getCombatant(t.who);
        if (!combatant) continue;
        if (combatant.type === "npc" && combatant.hp) {
          combatant.hp.current = Math.max(0, combatant.hp.current - t.hp);
        } else if (combatant.type === "pc") {
          combatant.damage_taken = (combatant.damage_taken ?? 0) + t.hp;
        }
      }
    }

    // Revert condition application
    if (entry.condition) {
      for (const targetId of entry.condition.tgt) {
        const combatant = encounter.getCombatant(targetId);
        if (!combatant) continue;
        for (const cond of entry.condition.conditions) {
          combatant.conditions = combatant.conditions.filter((c) => c !== cond);
        }
      }
    }

    // Revert tag application
    if (entry.tag) {
      for (const targetId of entry.tag.tgt) {
        const combatant = encounter.getCombatant(targetId);
        if (!combatant) continue;
        combatant.tags = combatant.tags.filter((t) => t.name !== entry.tag.name || t.source !== entry.tag.by);
      }
    }

    // Revert effect_ends (re-add the condition/tag)
    if (entry.effect_ends) {
      const combatant = encounter.getCombatant(entry.effect_ends.on);
      if (combatant && entry.effect_ends.reason === "dismissed") {
        // We don't have enough info to fully restore a tag, but we can re-add a condition
        if (!combatant.conditions.includes(entry.effect_ends.what)) {
          combatant.conditions.push(entry.effect_ends.what);
        }
      }
    }

    // Remove the log entry
    encounter.log.splice(logIndex, 1);

    // Adjust currentTurnLogIndex if it shifted
    if (encounter.currentTurnLogIndex > logIndex) {
      encounter.currentTurnLogIndex--;
    }

    encounter.flush();
  }

  function dismissTag(combatantId: string, tagId: string) {
    const combatant = encounter.getCombatant(combatantId);
    if (!combatant) return;

    const tag = combatant.tags.find((t) => t.id === tagId);
    if (!tag) return;

    // Remove the tag
    combatant.tags = combatant.tags.filter((t) => t.id !== tagId);

    // If this tag has a castId, remove all paired tags with the same castId
    if (tag.castId) {
      for (const c of encounter.combatants ?? []) {
        if (c.id === combatantId) continue; // already handled above
        const removed = (c.tags ?? []).filter((t) => t.castId === tag.castId);
        if (removed.length > 0) {
          c.tags = (c.tags ?? []).filter((t) => t.castId !== tag.castId);
          for (const r of removed) {
            encounter.logInsert({
              effect_ends: { what: r.name, on: c.id, reason: "dismissed" },
            });
          }
        }
      }
    }

    // If this tag had a source, check if the source has a concentration tag for this spell
    // and drop it (dismissing the effect ends concentration)
    if (tag.source) {
      const source = encounter.getCombatant(tag.source);
      if (source) {
        const concTagName = `Concentrating: ${tag.name}`;
        const hadConc = source.tags.some((t) => t.name === concTagName);
        if (hadConc) {
          source.tags = source.tags.filter((t) => t.name !== concTagName);
          encounter.logInsert({
            effect_ends: { what: tag.name, on: tag.source, reason: "effect_dismissed" },
          });
        }
      }
    }

    // Log the dismissal
    encounter.logInsert({
      effect_ends: { what: tag.name, on: combatantId, reason: "dismissed" },
    });

    encounter.flush();
  }

  function dismissCondition(combatantId: string, condition: string) {
    const combatant = encounter.getCombatant(combatantId);
    if (!combatant) return;

    combatant.conditions = combatant.conditions.filter((c) => c !== condition);

    encounter.logInsert({
      effect_ends: { what: condition, on: combatantId, reason: "dismissed" },
    });

    encounter.flush();
  }

  // Active tags and conditions for the current actor (shown below the bar)
  let currentActorEffects = $derived.by(() => {
    if (!encounter.active || !encounter.currentTurn) return null;
    const actor = encounter.effectiveActor;
    if (!actor) return null;

    const conditions = actor.conditions.filter((c) => c !== "dead");
    const tags = actor.tags;

    if (conditions.length === 0 && tags.length === 0) return null;

    return { combatantId: actor.id, combatantName: actor.name, conditions, tags };
  });

  // Multiattack / reminder actions for the current actor
  let turnReminders = $derived.by(() => {
    if (!encounter.active || !encounter.currentTurn) return [];
    const actor = encounter.effectiveActor;
    if (!actor?.actions) return [];
    const reminders: string[] = [];
    for (const action of actor.actions) {
      if (typeof action === "string") continue;
      if (action.type === "multiattack" || action.type === "reminder") {
        const label = action.name ?? "Reminder";
        const desc = action.note ?? "";
        reminders.push(desc ? `**${label}:** ${desc}` : `**${label}**`);
      }
    }
    return reminders;
  });

  function renderReminder(el: HTMLElement, text: string) {
    renderSpellDescription(el, text);
    return {
      update(newText: string) {
        renderSpellDescription(el, newText);
      },
    };
  }

  let isActionActive = $derived(encounter.activeAction !== null);
  let combatOver = $derived(encounter.allNPCsDead);
</script>

{#if combatOver}
  <div class="dnd-bar">
    <div class="dnd-combat-over">Combat Over!</div>
  </div>
{:else if isActionActive}
  <ActionBar {encounter} />
{:else}
  <DefaultBar {encounter} />
{/if}

{#if turnReminders.length > 0 && !isActionActive}
  <div class="dnd-turn-reminders">
    {#each turnReminders as reminder}
      <div class="dnd-turn-reminder" use:renderReminder={reminder}></div>
    {/each}
  </div>
{/if}

{#if currentActorEffects}
  <div class="dnd-actor-effects">
    {#each currentActorEffects.conditions as condition}
      <div class="dnd-actor-effect-row">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="dnd-condition-chip"
          class:expanded={expandedCondition === condition}
          onclick={() => { expandedCondition = expandedCondition === condition ? null : condition; }}
        >{condition}</span>
        <button class="dnd-effect-dismiss" onclick={() => dismissCondition(currentActorEffects.combatantId, condition)}>&times;</button>
      </div>
      {#if expandedCondition === condition && CONDITION_DESCRIPTIONS[condition]}
        <div class="dnd-condition-desc-inline" use:renderConditionDesc={condition}></div>
      {/if}
    {/each}
    {#each currentActorEffects.tags as tag (tag.id)}
      <div class="dnd-actor-effect-row">
        <span class="dnd-tag-chip">{tag.name}</span>
        {#if tag.note}
          <span class="dnd-actor-effect-note">{tag.note}</span>
        {/if}
        <button class="dnd-effect-dismiss" onclick={() => dismissTag(currentActorEffects.combatantId, tag.id)}>&times;</button>
      </div>
    {/each}
  </div>
{/if}

{#if turnLog.length > 0}
  <div class="dnd-turn-log">
    {#each turnLog as line (line.logIndex)}
      <div class="dnd-turn-log-entry">
        <span>&raquo; {line.text}</span>
        {#if line.canUndo}
          <button
            class="dnd-turn-log-delete"
            class:confirm={confirmDeleteIdx === line.logIndex}
            title={confirmDeleteIdx === line.logIndex ? "Click again to confirm" : "Undo this action"}
            onclick={() => requestDelete(line.logIndex)}
          >&times;</button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if activeBanners.length > 0}
  <div class="dnd-banner-stack">
    {#each activeBanners as banner (banner.tag.id)}
      {@const srdSpellName = getSpellNameFromTag(banner.tag)}
      {@const isDescExpanded = expandedSpellDescs.has(banner.tag.id)}
      {@const isConcentrationSave = banner.tag.name.startsWith("Concentration:")}
      <div class="dnd-obligation-banner" class:concentration={isConcentrationSave}>
        <div class="dnd-banner-title">
          &#9888; {banner.combatantName}: {banner.tag.name}{#if banner.tag.uses} <span class="dnd-uses-counter" class:depleted={banner.tag.uses.current <= 0}>({banner.tag.uses.current}/{banner.tag.uses.max})</span>{/if}{#if banner.tag.resolveTarget} &rarr; {encounter.getCombatant(banner.tag.resolveTarget)?.name ?? banner.tag.resolveTarget}{/if}
        </div>
        {#if banner.tag.onTrigger}
          <div class="dnd-banner-detail">{banner.tag.onTrigger}</div>
        {/if}
        {#if banner.tag.note && banner.tag.note !== banner.tag.onTrigger}
          <div class="dnd-banner-detail">{banner.tag.note}</div>
        {/if}
        <div class="dnd-banner-actions">
          {#if isConcentrationSave}
            <button class="dnd-banner-btn pass" onclick={() => passConcentration(banner)}>Pass</button>
            <button class="dnd-banner-btn fail" onclick={() => failConcentration(banner)}>Fail</button>
          {/if}
          {#if banner.tag.damageType || banner.tag.isHeal}
            <button
              class="dnd-banner-btn dnd-resolve-btn"
              class:active={resolvingTagId === banner.tag.id}
              disabled={!!banner.tag.uses && banner.tag.uses.current <= 0}
              onclick={() => startResolve(banner.tag.id)}
            >Resolve</button>
          {:else if banner.tag.uses}
            <button
              class="dnd-banner-btn pass"
              disabled={banner.tag.uses.current <= 0}
              onclick={() => spendUse(banner)}
            >Use</button>
          {/if}
          {#if srdSpellName}
            <button
              class="dnd-banner-btn dnd-spell-name-btn"
              class:active={isDescExpanded}
              onclick={() => toggleSpellDesc(banner.tag.id)}
            >{srdSpellName}</button>
          {/if}
          <button class="dnd-banner-btn dismiss" onclick={() => dismissTag(banner.combatantId, banner.tag.id)}>
            Dismiss
          </button>
        </div>

        {#if resolvingTagId === banner.tag.id}
          <div class="dnd-resolve-form">
            {#if banner.tag.dice}
              <span class="dnd-resolve-dice">Roll: {banner.tag.dice} {banner.tag.damageType ?? (banner.tag.isHeal ? "healing" : "")}</span>
            {/if}
            <div class="dnd-resolve-controls">
              <button
                class="dnd-bar-btn"
                class:active={showResolveTargets}
                onclick={() => { showResolveTargets = !showResolveTargets; }}
              >
                {resolveCheckedCount === 0 ? "Targets" : `Targets (${resolveCheckedCount})`}
              </button>
              <input
                type="number"
                inputmode="numeric"
                class="dnd-action-input narrow"
                placeholder={banner.tag.isHeal ? "HP" : "dmg"}
                value={resolveAmount || ""}
                oninput={(e) => { resolveAmount = parseInt((e.target as HTMLInputElement).value, 10) || 0; }}
                onkeydown={(e) => { if (e.key === "Enter") commitResolve(banner); }}
              />
              <button class="dnd-banner-btn active" onclick={() => commitResolve(banner)}>Apply</button>
            </div>
            {#if showResolveTargets}
              <TargetsDropdown
                {encounter}
                bind:selected={resolveTargets}
                onClose={() => { showResolveTargets = false; }}
                damageType={banner.tag.damageType}
              />
            {/if}
          </div>
        {/if}

        {#if isDescExpanded && srdSpellName}
          <div class="dnd-spell-desc dnd-banner-spell-desc" use:renderSpellDesc={srdSpellName}></div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
