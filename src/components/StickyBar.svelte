<script lang="ts">
  import { MarkdownRenderer } from "obsidian";
  import type { EncounterState } from "../state/encounter-state.svelte";
  import type { CombatTag } from "../types/encounter";
  import { findSpell } from "../data/spell-lookup";
  import DefaultBar from "./bar/DefaultBar.svelte";
  import ActionBar from "./bar/ActionBar.svelte";
  import BannerStack from "./banners/BannerStack.svelte";

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
    const spell = findSpell(name);
    return spell ? spell.name : null;
  }

  function renderSpellDesc(el: HTMLElement, spellName: string) {
    const spell = findSpell(spellName);
    if (!spell || !el) return;
    el.innerHTML = "";
    MarkdownRenderer.renderMarkdown(spell.desc, el, "", null as any);
    return {
      update(newName: string) {
        const s = findSpell(newName);
        if (!s) return;
        el.innerHTML = "";
        MarkdownRenderer.renderMarkdown(s.desc, el, "", null as any);
      },
    };
  }

  interface TagBanner {
    tag: CombatTag;
    combatantId: string;
    combatantName: string;
  }

  // Derive tag banners from combatant tags that match the current trigger moment
  let activeBanners = $derived.by((): TagBanner[] => {
    if (!encounter.active || !encounter.currentTurn) return [];

    const banners: TagBanner[] = [];

    for (const combatant of encounter.combatants) {
      if (!combatant.tags || combatant.conditions.includes("dead")) continue;

      for (const tag of combatant.tags) {
        if (!tag.trigger) continue;

        // Show start_of_turn and when_damaged tags for the current actor
        if (tag.trigger === "start_of_turn" && combatant.id === encounter.currentTurn) {
          banners.push({ tag, combatantId: combatant.id, combatantName: combatant.name });
        }

        // Show end_of_turn tags for the current actor (proactive so DM doesn't forget)
        if (tag.trigger === "end_of_turn" && combatant.id === encounter.currentTurn) {
          banners.push({ tag, combatantId: combatant.id, combatantName: combatant.name });
        }

        // Concentration (when_damaged) tags show for whoever has them, always visible
        if (tag.trigger === "when_damaged") {
          // Only show if the combatant just took damage this turn
          // (checked by looking for damage in the current turn's log)
          // For now, always show concentration tags as a reminder
          if (tag.name.startsWith("Concentrating:")) {
            // Don't clutter; only show if this is the current actor
            // (concentration saves happen when damaged, not on turn start)
          }
        }
      }
    }

    return banners;
  });

  // Current turn's action log
  let turnLog = $derived.by(() => {
    const log = encounter.log;
    const who = encounter.currentTurn;
    if (log.length === 0 || !who) return [];

    let turnStartIdx = -1;
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i] as any;
      if (entry.start_turn && entry.start_turn.who === who) {
        turnStartIdx = i;
        break;
      }
    }
    if (turnStartIdx < 0) return [];

    const entries: string[] = [];
    for (let i = turnStartIdx + 1; i < log.length; i++) {
      if ("start_turn" in log[i]) break;
      const summary = summarizeLogEntry(log[i]);
      if (summary) entries.push(summary);
    }
    return entries;
  });

  function summarizeLogEntry(entry: any): string | null {
    if (entry.attack) {
      const actorName = encounter.getCombatant(entry.attack.by)?.name ?? entry.attack.by;
      const isSpell = !!entry.attack.spell;
      const isFailed = !!entry.attack.failed;
      const allNoDamage = entry.attack.tgt.every((t: any) => !t.dmg || t.dmg.length === 0);

      const targetNames = entry.attack.tgt
        .map((t: any) => encounter.getCombatant(t.who)?.name ?? t.who)
        .join(", ");

      // Failed/miss: no effects applied
      if (isFailed) {
        if (isSpell) {
          return `${actorName} cast ${entry.attack.via} on ${targetNames}. Failed.`;
        }
        return `${actorName} missed ${targetNames} with ${entry.attack.via}.`;
      }

      const targetParts = entry.attack.tgt
        .map((t: any) => {
          const name = encounter.getCombatant(t.who)?.name ?? t.who;
          if (t.dmg && t.dmg.length > 0) {
            const dmgParts = t.dmg.map((d: any) => `${d.n} ${d.type}`).join(" + ");
            return `${name} dealing ${dmgParts}`;
          }
          return name;
        })
        .join(", ");

      if (isSpell) {
        return `${actorName} cast ${entry.attack.via} on ${targetParts}.`;
      }
      if (allNoDamage) {
        return `${actorName} missed ${targetParts} with ${entry.attack.via}.`;
      }
      return `${actorName} attacked ${targetParts} with ${entry.attack.via}.`;
    }
    if (entry.heal) {
      const actorName = encounter.getCombatant(entry.heal.by)?.name ?? entry.heal.by;
      const targets = entry.heal.tgt.map((t: any) => {
        const name = encounter.getCombatant(t.who)?.name ?? t.who;
        return `${name} for ${t.hp}`;
      }).join(", ");
      return `${actorName} healed ${targets}.`;
    }
    if (entry.condition) {
      const targets = entry.condition.tgt
        .map((id: string) => encounter.getCombatant(id)?.name ?? id)
        .join(", ");
      const conds = entry.condition.conditions.join(", ");
      return `${targets} ${entry.condition.tgt.length === 1 ? "is" : "are"} ${conds}.`;
    }
    if (entry.tag) {
      const actorName = encounter.getCombatant(entry.tag.by)?.name ?? entry.tag.by;
      const targets = entry.tag.tgt
        .map((id: string) => encounter.getCombatant(id)?.name ?? id)
        .join(", ");
      return `${actorName} tags ${targets} with ${entry.tag.name}${entry.tag.note ? ` (${entry.tag.note})` : ""}.`;
    }
    if (entry.note) {
      const actorName = encounter.getCombatant(entry.note.by)?.name ?? entry.note.by;
      return `${actorName}: ${entry.note.text}`;
    }
    if (entry.death) {
      const name = encounter.getCombatant(entry.death.who)?.name ?? entry.death.who;
      return `${name} died.`;
    }
    if (entry.effect_ends) {
      return `${entry.effect_ends.what} ended on ${encounter.getCombatant(entry.effect_ends.on)?.name ?? entry.effect_ends.on}.`;
    }
    return null;
  }

  function dismissTag(combatantId: string, tagId: string) {
    const combatant = encounter.getCombatant(combatantId);
    if (!combatant) return;

    const tag = combatant.tags.find((t) => t.id === tagId);
    if (!tag) return;

    // Remove the tag
    combatant.tags = combatant.tags.filter((t) => t.id !== tagId);

    // If this tag had a source, check if the source has a concentration tag for this spell
    // and drop it (dismissing the effect ends concentration)
    if (tag.source) {
      const source = encounter.getCombatant(tag.source);
      if (source) {
        const concTagName = `Concentrating: ${tag.name}`;
        const hadConc = source.tags.some((t) => t.name === concTagName);
        if (hadConc) {
          source.tags = source.tags.filter((t) => t.name !== concTagName);
          encounter.log.push({
            effect_ends: { what: tag.name, on: tag.source, reason: "effect_dismissed" },
          });
        }
      }
    }

    // Log the dismissal
    encounter.log.push({
      effect_ends: { what: tag.name, on: combatantId, reason: "dismissed" },
    });

    encounter.flush();
  }

  function dismissCondition(combatantId: string, condition: string) {
    const combatant = encounter.getCombatant(combatantId);
    if (!combatant) return;

    combatant.conditions = combatant.conditions.filter((c) => c !== condition);

    encounter.log.push({
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

{#if currentActorEffects}
  <div class="dnd-actor-effects">
    {#each currentActorEffects.conditions as condition}
      <div class="dnd-actor-effect-row">
        <span class="dnd-condition-chip">{condition}</span>
        <button class="dnd-effect-dismiss" onclick={() => dismissCondition(currentActorEffects.combatantId, condition)}>&times;</button>
      </div>
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
    {#each turnLog as line}
      <div class="dnd-turn-log-entry">&raquo; {line}</div>
    {/each}
  </div>
{/if}

{#if activeBanners.length > 0}
  <div class="dnd-banner-stack">
    {#each activeBanners as banner (banner.tag.id)}
      {@const srdSpellName = getSpellNameFromTag(banner.tag)}
      {@const isDescExpanded = expandedSpellDescs.has(banner.tag.id)}
      <div class="dnd-obligation-banner" class:concentration={banner.tag.name.startsWith("Concentrating:")}>
        <div class="dnd-banner-title">
          &#9888; {banner.combatantName}: {banner.tag.name}
        </div>
        {#if banner.tag.onTrigger}
          <div class="dnd-banner-detail">{banner.tag.onTrigger}</div>
        {/if}
        {#if banner.tag.note && banner.tag.note !== banner.tag.onTrigger}
          <div class="dnd-banner-detail">{banner.tag.note}</div>
        {/if}
        <div class="dnd-banner-actions">
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
        {#if isDescExpanded && srdSpellName}
          <div class="dnd-spell-desc dnd-banner-spell-desc" use:renderSpellDesc={srdSpellName}></div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
