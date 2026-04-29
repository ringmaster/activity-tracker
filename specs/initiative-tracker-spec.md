# D&D Initiative Tracker — Obsidian Plugin Specification

## Purpose and scope

This document specifies the design for an Obsidian plugin named "activity-tracker" that provides initiative tracking, action logging, and NPC behavior coaching for D&D 5e games. The primary use case is at-the-table play on an iPad Mini in Obsidian's reading view. Authoring of encounters happens at the desktop, often with AI assistance.

The plugin is being built for personal use by a single DM; design decisions favor that DM's workflow over generality.

This spec covers v1. Several capabilities are deferred to later versions (see "Deferred" at the end), but the schema is designed to support them without migration.

---

## Background and design principles

Several principles emerged during the design discussion and inform downstream decisions. Implementers should treat these as load-bearing.

**Table-smoothness over feature breadth.** A clunky tracker is worse than paper. Every saved tap compounds across an 80-150 action combat. Every unclear state break flow. The iPad Mini at the table is unforgiving of any UI that makes the DM hunt.

**No drag-and-drop.** Touch interaction is the primary input. No hover states. Touch targets are 44pt minimum, preferably 48-56pt.

**No modals.** The active-action UI lives on a single bar (with a fallback to multi-line if it doesn't fit). Drop-downs from the bar are transient overlays that don't reflow the note. Keyboard-occluded modals are a known iPad failure mode and are explicitly avoided.

**Action log as the spine.** Damage tracking, HP, conditions, concentration -- all of these are derived from the action log. The log is the source of truth. This makes undo trivial and retrospectives natural.

**NPCs are fully modeled; PCs are lightly modeled.** This asymmetry pervades the design. The tracker is authoritative for NPCs (HP from stat block, conditions, spell slots, behavior playbook). For PCs, the tracker is a scribe -- the player remains authoritative for their own state, and the tracker only accumulates damage taken (no max HP modeled).

**Coaching is encounter-design surfacing, not AI.** NPC behavior is pre-authored in YAML at encounter design time. The tracker surfaces this prose at the right moment. No LLM calls, no API keys, no network dependency.

**Obligations must surface at the trigger moment.** The current tracker the DM uses has a tag system that doesn't surface at turn time. This is the primary pain point being solved. Obligation banners must be impossible to miss.

---

## Architecture

### Platform

- Obsidian plugin, built with Svelte (per implementer's choice of build).
- Reading view only for the bar UI. Live preview is not supported; switching to live preview hides the tracker.
- Code block processor (`registerMarkdownCodeBlockProcessor`) handles a custom code block language: `dnd-combat` (or similar; final name implementer's choice).
- Plugin renders two distinct UI surfaces:
  1. The **inline view**: rendered in place of the code block in the note. Always visible. Shows encounter dashboard.
  2. The **sticky bar**: fixed-position element at the top of the viewport. Visible only when the encounter is active. Hosts all action interactions.

### Dependencies

- **Fantasy Statblocks** (existing Obsidian plugin) is a soft dependency. Used for:
  - Stat block lookup for NPCs by name
  - Auto-rolling NPC initiative from Dex modifier
  - Populating NPC action buttons from stat block actions
  - Resistance/vulnerability/immunity data for combat hints
- If Fantasy Statblocks is not installed or the looked-up entity is missing, the plugin degrades gracefully: NPCs without stat block data show only authored fields; init must be entered manually; resistance hints are absent.

### Tracker scope

- **One active tracker per note** (the YAML's `active: true` flag). When a tracker is activated, the plugin scans the note for other `active: true` blocks and sets them to `false`. Implementer enforces this; do not rely on YAML being authored correctly.
- **Tracker is note-scoped.** The sticky bar appears only when viewing the note containing the active tracker. Switching away from the note hides the bar; returning shows it again.
- **The bar position**: pinned to the top of the editor viewport (not the top of the note). Scrolls with the viewport, not the note content.
- **Max-width capped and centered**: the bar should be sized for the iPad Mini (roughly 380-768px wide). On larger screens, the bar is centered with empty space around it; same UI everywhere, no special desktop layout.

---

## Data model

### File locations

- **Encounter data**: in code blocks within session notes, language tag `dnd-combat` (or similar).
- **Party data**: in a separate vault-level note, path configured in plugin settings. Default suggested: `party.md` at vault root, or wherever the DM puts it.
- **Plugin settings**: standard Obsidian plugin data.

### Encounter YAML schema

The full shape. Authored fields are noted as such; tracker-managed fields are populated/updated by the plugin.

```yaml
# --- Meta (mixed: authored + tracker-managed) ---
encounter: "Goblin Throne Room"      # authored: display name
active: false                         # tracker-managed: bar visibility flag
round: 0                              # tracker-managed: current round
current_turn: null                    # tracker-managed: id of current actor

# --- Combatants list (mixed) ---
combatants:
  - id: snaggle                       # auto-generated from name; manual override possible
    name: Snaggle
    type: npc                         # npc | pc
    statblock: "Goblin Boss"          # NPC: Fantasy Statblocks lookup key
    init: 18                          # auto-rolled at start; editable
    hp:                               # NPC only
      current: 21
      max: 21
    temp_hp: 0
    conditions: []
    concentration: null               # null or {spell: <spell-key>, line_ref: <log-line>}
    spell_slots:                      # NPC only; from statblock or authored override
      1: 2
      2: 1
    legendary_actions: null           # null or {max: 3, current: 3}
    behavior:                         # NPC only; the playbook
      motive: "Protect the throne; will not leave the dais."
      priority: "Spellcasters first, then heavy armor."
      flee_at: 7
      coordinates_with: [goblin-1, goblin-2]
      movement: "Stays within 15ft of throne."
      notes: |
        Will use Misty Step to escape if cornered.
      extra_actions:                  # additions/overrides to statblock actions
        - name: "Throw caltrops"
          type: attack
          area: "10ft cone"
          save: {stat: dex, dc: 12}
          effect: "Speed halved until next turn"
      spell_preferences:              # ordered hints for spell selection
        - when: "Bloodied"
          cast: "Shield of Faith on self"
        - when: "Two enemies clustered"
          cast: "Spiritual Weapon"

  # Repeated NPC shorthand (authoring convenience):
  - name: Goblin
    statblock: Goblin
    type: npc
    count: 3                          # expands to goblin-1, goblin-2, goblin-3

  # PC shape (much smaller):
  - id: roice
    name: Roice
    type: pc
    init: 14                          # entered at encounter start
    damage_taken: 0                   # accumulator (replaces hp)
    temp_hp: 0
    conditions: []
    concentration: null

# --- Spells library (authored) ---
spells:
  evards-tentacles:
    name: "Evard's Black Tentacles"
    type: debuff
    range: "20ft cube"
    concentration: true
    duration_rounds: 10
    obligation:
      target: affected                # affected | enemies_in_range | allies_in_range | specific
      trigger: end_of_turn            # start_of_turn | end_of_turn | when_damaged | init_20 | start_of_round
      kind: save                      # save | save_for_half | damage | custom
      stat: [str, dex]                # for save; list = target's choice
      dc: 15
      on_fail: "10 bludgeoning, remain restrained"
      on_success: ends                # ends | continues | half | <freeform>

  spirit-guardians:
    name: "Spirit Guardians"
    type: aoe_persistent
    range: "15ft sphere centered on caster"
    concentration: true
    duration_rounds: 10
    obligation:
      target: enemies_in_range
      trigger: start_of_turn
      kind: save_for_half
      stat: wis
      dc: 14
      dmg: [{n: 14, type: radiant}]
      on_save: half
      on_fail: full

  bless:
    name: Bless
    type: buff
    concentration: true
    duration_rounds: 10
    effect: "+1d4 to attack rolls and saves"
    # no obligation; passive effect

  fireball:
    name: Fireball
    type: aoe
    range: "20ft sphere, 150ft"
    save: {stat: dex, dc: 15, on_pass: half}
    dmg: [{n: 28, type: fire}]
    # no obligation; one-shot

# --- Action log (tracker-managed) ---
log:
  - start_combat: {at: "19:12:00"}
  - start_round: {n: 1, at: "19:12:00"}
  - start_turn: {who: snaggle, init: 18, at: "19:12:08"}
  - attack: {by: snaggle, via: scimitar, tgt: [{who: roice, dmg: [{n: 7, type: slashing}]}]}
  - start_turn: {who: roice, init: 14, at: "19:12:30"}
  - attack: {by: roice, via: glaive, tgt: [{who: snaggle, dmg: [{n: 9, type: slashing}]}]}
  - start_turn: {who: cleric, init: 11, at: "19:13:05"}
  - buff: {by: cleric, via: bless, tgt: [roice, lyra, theren], slot: 1, conc: true}
  - note: {by: theren, text: "Picked up the tome from the altar"}
  - start_round: {n: 2, at: "19:14:22"}
  - effect_ends: {what: bless, on: cleric, reason: concentration_dropped}
  - end_combat: {at: "19:51:12"}

# --- Active obligations (tracker-managed) ---
active_obligations:
  - id: ob-001
    spell: evards-tentacles
    cast_line: 14                     # log line that created it
    tgt: [roice]                      # who carries it
    expires: {round: 12}              # absolute round
    last_triggered: null              # log line of last resolution
```

### Party note schema

Stored in a vault-level note configured in plugin settings.

```yaml
party:
  - id: roice
    name: Roice
    player: Joe                       # optional
    notes: "Fighter, 5th"             # optional
    actions:                          # optional templates for common actions
      - name: Glaive
        type: attack
        dmg: [{type: slashing}]
      - name: Polearm Master
        type: attack
        dmg: [{type: bludgeoning}]
        note: "bonus action butt-end"

  - id: lyra
    name: Lyra
    player: Sara
    notes: "Wizard, 5th"
    actions:
      - name: Fire Bolt
        type: attack
        dmg: [{type: fire}]
      - name: Fireball
        type: attack
        dmg: [{type: fire}]
        save: {stat: dex, dc: 15, on_pass: half}
        slot: 3
      - name: Shield
        type: buff
        note: "reaction; +5 AC"
```

PC actions are templates: type, damage type, save info pre-authored; numeric values entered live at the table.

### Schema conventions

**Short keys for high-frequency log fields:**
- `tgt` — targets (always a list, even for single-target)
- `via` — the cause/source of an action (e.g., "scimitar", "Fireball", spell-key reference)
- `stat` — ability score for saves
- `dmg` — damage value or list of damage components
- `by` — who performed the action
- `at` — timestamp (ISO 8601 time, or short HH:MM:SS)
- `dc` — difficulty class for saves
- `conc` — concentration flag
- `slot` — spell slot used
- `init` — initiative
- `dur` — duration in rounds

**Use the same key for the same concept everywhere.** Don't have `damage` in spell definitions if `dmg` is used in the log.

**Damage components are always a list** (even for single-type damage):
```yaml
dmg: [{n: 7, type: slashing}]
dmg: [{n: 8, type: slashing}, {n: 11, type: radiant}]   # multi-type
```
The schema supports multi-type damage from spells like Flame Tongue, Divine Smite, Ice Storm.

**Combatant ID generation:**
- Auto-generated from name as kebab-case slug
- For non-unique combatants (multiple of same stat block), assign a running counter across *all* non-unique NPCs in the encounter
- This matches physical "status rings" used at the table: there's only one ring of each number, so numbering must be unique across all repeated NPCs
- Example: 3 goblins + 2 orcs becomes goblin-1, goblin-2, goblin-3, orc-4, orc-5
- Snaggle (one Goblin Boss) is unique; gets ID `snaggle`, no number
- Numbers are not reused on death within an encounter
- The display name should match the number (Goblin 1, Goblin 2, etc.) so DM can match miniature ring to tracker entry
- Manual override of generated ID and name is allowed

### YAML expansion

When an encounter is first activated, the tracker expands the authored minimum into the full schema (filling in HP from stat blocks, default temp_hp, default empty conditions, etc.). The expanded YAML is written back to the code block. This means the YAML evolves through three states: authored minimum → running encounter → completed encounter with full log.

The minimum authored YAML for a working encounter:

```yaml
encounter: "Goblin Ambush"
combatants:
  - name: Snaggle
    type: npc
    statblock: "Goblin Boss"
  - name: Goblin
    type: npc
    statblock: Goblin
    count: 3
# PCs are added at encounter start via the start UI; not authored in YAML
```

That's it. NPC initiatives auto-roll on activation; PC initiatives are entered at the table.

---

## Action types

Six user-facing action types appear in the bar:

1. **Attack** — single or multi-target, with optional save info. Covers weapon attacks, single-target damage spells, and AoEs (the type formerly called "AoE" is merged here).
2. **Heal** — restores HP for NPCs, reduces damage_taken for PCs.
3. **Buff** — applies a positive ongoing effect.
4. **Debuff/Condition** — applies a negative ongoing effect or condition (including dead/downed).
5. **Save** — a saving throw or ability check.
6. **Note** — freeform narrative or non-mechanical action.

### Modifier flags

Reactions, legendary actions, lair actions, and opportunity attacks are *not* separate types. They are handled via the **actor-swap mechanism**: the bar's actor button can be tapped to temporarily swap to a different combatant, who takes one action, then the bar swaps back. The log entry records the actual actor; the difference between actor and current turn is the signal that this was a reaction/legendary/lair/etc.

The swapped actor is rendered in an alternate color in the bar to indicate "this isn't whose turn it is."

### Structural events (tracker-generated)

These appear in the log but are not user-facing as buttons:
- `start_combat`, `end_combat`
- `start_round`, end_of_round (implicit from next start_round)
- `start_turn`, end_of_turn (implicit from next start_turn or next round)
- `concentration_dropped`
- `effect_ends` — generated when an obligation resolves with the Dismiss option, or when concentration drops, or duration expires
- `add_combatant`, `remove_combatant`
- `death` — generated automatically when NPC HP hits 0; manual when applied as condition

---

## UI: the bar

### Default-state layout

When an encounter is active and no action is in progress:

```
[◂][Actor ▾][⚔][❤][↑][↓][💾][📝][📋][▸]
```

- `◂` — back (previous turn)
- `Actor ▾` — current actor's name with dropdown affordance
- `⚔` — Attack
- `❤` — Heal
- `↑` — Buff
- `↓` — Debuff/Condition
- `💾` — Save (icon distinct from "commit"; final icon implementer's call)
- `📝` — Note
- `📋` — Utility: opens initiative list / log dropdown
- `▸` — next (next turn)

Total: 10 elements. Tight on Mini width (~380px); each element ~38px. May fall back to two-row layout if comfortable touch targets can't be achieved.

Specific icons listed are placeholders; implementer chooses final icons. They should be distinct, recognizable at small size, and consistent in visual weight.

### Active-action layout

When an action button is tapped, the bar transforms into a context-sensitive sub-bar. Back/next are disabled during action entry. The action button highlights to indicate the active mode; tapping it again cancels (returns to default state without logging).

For Attack:
```
[~][Actor][*⚔][tgt][via][dmg][type][commit][~]
```

- `*⚔` — highlighted attack button; tap to cancel
- `tgt` — opens targets dropdown (see below)
- `via` — autocomplete field for source (scimitar, Fireball, etc.)
- `dmg` — numeric damage entry
- `type` — damage type (autofills from `via` when possible)
- `commit` — logs the attack; named "commit" not "save" to avoid conflict with the Save action

Field order matters: `via` before `dmg` and `type` so `type` can autofill from the selected source. For multi-type damage, a "+" affordance next to `dmg` adds another damage component (this expands the bar to a second row, accepted as a fallback for the rare case).

### Targets dropdown

Used by Attack, Heal, Buff, Debuff/Condition (Save and Note don't need it).

The targets button shows: nothing if zero selected, target name if one selected, "N targets" if multiple.

Tapping opens a dropdown listing all combatants in initiative order:

```
☑ Goblin 1   🛡fire           ◯Hit  ◯Half  ◯Zero
☑ Goblin 2   ⚠fire vulnerable ◯Hit  ◯Half  ◯Zero
☐ Roice                       (Hit/Half/Zero hidden)
```

**Interaction model:**
- Left checkbox: "this combatant is affected" (target inclusion)
- Tap a combatant's *name*: selects that one as the sole target and closes the dropdown (fast single-target path)
- Tap a checkbox: toggles target inclusion, dropdown stays open (multi-select path)
- Hit/Half/Zero radios: only shown when the action has save info (Attack with save). Hidden for non-save attacks, Heal, Buff, Condition.
- Default outcome: Hit
- Tap a Hit/Half/Zero radio: sets that target's outcome; does not close the dropdown
- Dropdown closes on: tap-name (single select), tap outside, explicit Done button

**Resistance/vulnerability/immunity hints:** rendered as compact icons next to combatant name when the action's damage type has an interaction. Strongest interaction shown if multiple (immunity > vulnerability > resistance). Hints are *informational*; the tracker does not auto-compute. The DM picks Half/Zero based on the hint.

**Damage application from outcomes:**
- `hit: full` → target takes full base_dmg
- `hit: half` → target takes half base_dmg
- `hit: zero` → target takes 0 (still logged as targeted)

The log entry records both the outcome and the resulting damage:
```yaml
- attack: {by: lyra, via: fireball, save: {stat: dex, dc: 15, on_pass: half},
           tgt: [{who: goblin-1, hit: full, dmg: [{n: 24, type: fire}]},
                 {who: goblin-2, hit: half, dmg: [{n: 12, type: fire}]},
                 {who: goblin-3, hit: zero}]}
```

### Actor dropdown

Tapping the actor button opens a dropdown showing:
- Current actor's full state: HP (or damage_taken for PC), conditions, concentration, spell slots, legendary actions
- A swap-to list of all combatants in initiative order (for actor-swap)
- An "Add combatant" affordance at the bottom

**Add combatant form** (single row in the dropdown):
```
[name (autocomplete)][init][HP][AC][🎲 roll init][add]
```

- Name autocomplete pulls from Fantasy Statblocks bestiary
- Selecting a stat block from autocomplete: auto-fills HP and AC; auto-rolls init from Dex modifier
- DM can override any field by tapping and typing
- For PC additions (no stat block), the form just takes name, init; HP and AC fields hidden or zeroed
- Form lives in the dropdown at top of viewport; iPad keyboard appears at bottom and does not occlude the form

### Utility dropdown

Tapping the utility button (`📋`) opens a dropdown showing:
- Initiative list with all combatants, current actor highlighted, HP/damage_taken visible per combatant
- Recent log entries (last 10-20), with per-action undo affordances
- Maybe: a "show full log" affordance that scrolls the note to the encounter block (where the inline view shows the full log)

---

## UI: the inline view

The inline view is what's rendered in place of the code block in the note. It's always visible (regardless of bar state) and serves as a dashboard.

### Inactive state

```
┌──────────────────────────────────────────────┐
│ Encounter: Goblin Throne Room                │
│ Round 0 / Inactive                            │
│                                                │
│ Combatants:                                   │
│  • Snaggle (Goblin Boss)    init -    HP 21/21│
│  • Goblin 1                  init -    HP 7/7 │
│  • Goblin 2                  init -    HP 7/7 │
│  • Goblin 3                  init -    HP 7/7 │
│                                                │
│ [ ▶ Run encounter ]                            │
└──────────────────────────────────────────────┘
```

PCs may be absent from the inactive view since they're added at start time.

### Active state

```
┌──────────────────────────────────────────────┐
│ Encounter: Goblin Throne Room                │
│ Round 3 / Active                              │
│                                                │
│ Combatants (initiative order):                │
│ ▶ Snaggle                  init 18  HP 14/21  │ ← current turn highlighted
│   Roice                    init 14  dmg 7     │
│   Goblin 1                 init 12  HP 4/7    │
│   Lyra                     init 11  dmg 0     │
│   Goblin 2     [DEAD]      init 9   HP 0/7    │
│                                                │
│ [ ⏸ Stop encounter ]                          │
└──────────────────────────────────────────────┘
```

- Current actor highlighted (visual treatment; bold + leading caret)
- NPCs show `HP current/max`; PCs show `dmg N` (damage_taken accumulator)
- Dead combatants visually distinct (strikethrough, gray, "[DEAD]" label)
- Conditions could be shown as small chips next to name (optional for v1; defer if it crowds layout)

### Run encounter flow

Tapping "Run encounter" opens a roster confirmation drop-down (overlaying the inline view or as a flyout):

```
┌──────────────────────────────────────────────┐
│ Roster for: Goblin Throne Room               │
│                                                │
│ Party (from party.md):                        │
│   Roice         init: [    ]                  │
│   Lyra          init: [    ]                  │
│   Theren        init: [    ]                  │
│   Bram          init: [    ]                  │
│   <guest>       name: [        ] init: [   ] │
│                                                │
│ NPCs (auto-rolled):                           │
│   Snaggle       init: 18    [edit]            │
│   Goblin 1      init: 14    [edit]            │
│   Goblin 2      init: 11    [edit]            │
│   Goblin 3      init: 9     [edit]            │
│                                                │
│ [ Start ]                                      │
└──────────────────────────────────────────────┘
```

- **Party list** populated from party note. Each PC has an init field. Empty init = not in this encounter; entered init = added.
- **Guest slot** at bottom for one-off PCs; can optionally save to party note.
- **NPCs auto-rolled** from Dex modifiers; tap edit to override.
- **Start** activates the encounter, sets `active: true`, deactivates other trackers in the note, advances to first turn.

### Inline view updates

The inline view re-renders when:
- Tracker activates/deactivates
- Round advances
- Current turn changes
- A combatant's HP or status changes meaningfully

Re-render scope is the inline view's rendered DOM only; do not re-render the entire note. Be conservative with update frequency: avoid re-rendering on every action commit if not visible state-changing.

---

## Obligation system

### Background

The DM's current tracker has an obligation/tag system that **fails to surface during play**. The DM doesn't notice tagged information in time. This is the primary pain point this plugin solves.

**Design priority: prompt at the trigger moment, prominently enough to not be missed at the table.**

### Authored obligations

Obligations are authored on spells in the encounter YAML's `spells` section. When a spell with an obligation is cast (logged as a buff/debuff/attack via that spell key), the tracker creates an entry in `active_obligations` with:
- The spell key
- The log line that created it (`cast_line`)
- The targets carrying it
- The expiration (computed from cast round + duration)

### Trigger types

The tracker scans `active_obligations` at these moments:
- Start of a turn (for `trigger: start_of_turn`)
- End of a turn (for `trigger: end_of_turn`)
- Start of a round (for `trigger: start_of_round`)
- Initiative 20 of a round (for `trigger: init_20`) — handled via lair-as-combatant pattern
- Damage applied to a concentrating combatant (for concentration saves; `trigger: when_damaged`)

For each obligation whose trigger matches the current state transition, the tracker generates a banner.

### Obligation banner

Banners drop down from the bar, below the bar's main row, above the rest of the page content. They appear automatically (no DM tap to summon).

Banner shape:

```
┌──────────────────────────────────────────────┐
│ ⚠ Roice: Evard's Tentacles save              │
│   (Str/Dex DC 15) at end of turn              │
│   [Pass] [Fail]    [Dismiss] [Recur]          │
└──────────────────────────────────────────────┘
```

- Visually distinct (amber or red border/background)
- Names the obligated combatant (which may not be the current actor — concentration saves and similar)
- States the trigger and parameters
- Four resolution buttons: Pass, Fail, Dismiss, Recur

### Resolution model

The four buttons capture two orthogonal decisions:
- **Pass / Fail**: the result of *this* instance of the obligation
- **Dismiss / Recur**: what happens *next time* the trigger fires

Pass/Fail toggles record the result; selected state highlighted. Dismiss/Recur commit the resolution.

**Smart defaults from spell definitions:**
- Authored obligations specify `on_success: ends` or `on_success: continues`, etc.
- For these, the tracker implies the future-state from the result: Pass on Evard's auto-Dismisses (because `on_success: ends`); Pass on Spirit Guardians auto-Recurs (because the spell continues regardless).
- DM can override the implicit Dismiss/Recur by tapping explicitly.

**Ad hoc obligations** (created at the table, not from authored spells) require explicit Dismiss/Recur tap.

### Resolution effects

When resolved:
- Pass/Fail logs a `save` entry (or relevant resolution entry) in the log, referencing the obligation
- Dismiss removes the obligation from `active_obligations` and logs an `effect_ends` entry with `reason: dismissed` or `reason: save_succeeded` (etc.)
- Recur leaves the obligation active; updates `last_triggered` to current log line

### Stacking and ordering

Multiple obligations can trigger on one turn or one event. Banners stack vertically. Each is resolved independently; order is DM's choice.

If banners crowd the layout, v1 accepts the layout stress. Future versions may add compact mode or sequential resolution flow.

### Obligation cleanup

The tracker removes obligations from `active_obligations` when:
- Resolved with Dismiss
- Source spell's concentration drops
- Duration expires (round count exceeded)
- The carrying combatant dies (some obligations; not all — lingering effects should remain if appropriate)
- The encounter ends

Cleanup logic should be conservative: when in doubt, leave the obligation. The DM can manually dismiss.

### Ad hoc obligation creation (deferred for v1 if scope-pressed)

The DM should be able to attach an obligation to any logged action ad hoc (poisoned scimitar, environmental effect, etc.). Schema supports this; v1 UI may limit to authored-only obligations. Add an "+ obligation" affordance to the action commit step in v1.5 or v2.

---

## Behaviors and edge cases

### Death

- **NPC HP reaches 0**: tracker auto-applies `dead` condition. Combatant is skipped in turn order. Log entry: `- death: {who: <id>, at: <time>}`.
- **PC at 0 (downed)**: tracker cannot detect (no max HP modeled). DM applies `downed` condition manually via the Condition action when player announces it.
- **Dead/downed are conditions**: applied via Condition action like any other condition. Auto-application for NPCs at 0 HP is a convenience.
- **Dead combatants remain in the initiative list**: visible but skipped, can still be targeted (raise dead, healing).

### Combat over

- When all NPCs are dead, the bar shows "Combat Over" and the encounter ends.
- `active: false` is set; bar disappears.
- Inline view shifts to inactive state with full log visible.
- Follow-on activities (loot, healing, etc.) happen in normal Obsidian; tracker is not involved.

### Adding combatants mid-encounter

- Via the actor dropdown's "Add combatant" form
- Fields: name (autocomplete from Fantasy Statblocks for NPCs), init, HP, AC
- Auto-roll init when a stat block is selected from autocomplete
- Manual override of any field
- For repeated NPCs: the running counter continues; new combatant gets next available number
- Log entry: `- add_combatant: {who: <id>, name: <name>, init: <init>, at: <time>}`

### Removing combatants

- Different from death; combatant is gone, not killed
- Accessed via actor dropdown (long-press a combatant or per-row remove affordance)
- Confirmation step (don't accidentally remove)
- Log entry: `- remove_combatant: {who: <id>, reason: <text>, at: <time>}`

### Misses and crits (deferred for v1 UI; schema supports)

- Schema supports miss entries and crit flags
- v1 UI: only hits are logged; misses are not entered
- Future versions will add hit/miss toggle to the attack flow for completeness (needed for narrative reconstruction)

### Recharge abilities

- NPC state field `recharge` per ability that has it (e.g., dragon breath)
- At the start of an NPC's turn, if a recharge ability is spent, the bar shows "Roll recharge for <ability>" as a prompt above the action bar
- DM taps to record result (recharged / still spent)
- Not a log entry unless DM wants to add a Note

### Concentration

- When a concentrating combatant takes damage, the tracker generates a concentration save obligation immediately (trigger: when_damaged)
- DC = max(10, damage_taken / 2)
- Banner shows: `⚠ <Name>: Concentration save (Con DC <X>) for <spell>`
- Pass/Fail → effect continues or ends
- Effect ends → `effect_ends` log entry with `reason: concentration_dropped`; the buff/debuff is removed from any active conditions/obligations

### Multi-type damage

- Schema: `dmg` is always a list; multi-type adds entries
- UI: `dmg` field has a "+" to add additional components
- Most attacks have one component; the "+" is unobtrusive when unused

### Spell slot tracking

- NPCs: tracker decrements `spell_slots[level]` when an action is logged with `slot: <n>`
- PCs: `slot` is logged for narrative purposes; no tracking (player handles their own slots)

---

## Plugin settings

Configurable in plugin settings:
- **Party note path**: path to the vault note containing party data (default: `party.md`)
- **Code block language**: the tag used for encounter blocks (default: `dnd-combat`)
- **Theme variables**: optional CSS overrides for colors, sizing, etc. (low priority for v1)

No API keys, no network configuration. The plugin is fully offline.

---

## Implementation guidance

### Project structure

Implementer's choice; suggested:
- Svelte components for the bar, inline view, dropdowns, banners
- Plain TypeScript for state management and YAML parsing
- Use `js-yaml` or similar for YAML round-tripping
- Use Obsidian's `MarkdownPostProcessorContext` for code block updates

### State management

- Encounter state is stored in the YAML; YAML is the source of truth
- In-memory state mirrors YAML during interaction; flushed on action commits
- Debounce YAML writes to avoid clobbering cursor position (though reading view interaction is the primary case, edge cases exist)

### Update strategy

- Action commits: write to log, recompute derived state, re-render bar and inline view
- Avoid full-note re-renders; scope updates to the tracker's DOM elements
- Inline view should not re-render on every keystroke; only on meaningful state changes

### Fantasy Statblocks API

- Soft-dependency check at plugin load: `app.plugins.plugins["obsidian-5e-statblocks"]` (verify exact key)
- API methods used: bestiary lookup by name, stat block field access (HP, AC, Dex modifier, actions, resistances)
- Graceful degradation when unavailable

### Performance

- Action log can grow long over a 4-hour session (100-200 entries). Rendering should be performant. Consider:
  - Pagination for log views
  - Indexed lookup of `active_obligations` by combatant
  - Avoid full-log scans on every state update

### iPad-specific concerns

- Test on actual iPad Mini hardware; do not trust desktop parity
- Reading view code block processor is the primary surface; live preview is not supported
- Touch targets ≥ 44pt, preferably 48-56pt
- Keyboard occlusion: forms live in dropdowns at the top of the viewport; do not place input fields where the keyboard will cover them
- No drag-and-drop interactions
- No hover-dependent UI

### Accessibility

- Standard considerations apply but iPad reading-view-at-table is the primary concern
- Color is used for status (current actor, dead, obligation banner); ensure sufficient contrast in both light and dark Obsidian themes
- Icons should be paired with labels or have clear semantic association

---

## Glossary

- **Actor**: who is performing the current action. May differ from current-turn-holder when reactions/legendary/lair occur (actor-swap).
- **Bar**: the sticky tracker UI at the top of the viewport.
- **Combatant**: any entry in the encounter's combatants list (NPC or PC).
- **Inline view**: the rendered code block in the note; the dashboard.
- **Obligation**: a deferred mechanical consequence (save, damage, etc.) that fires at a specific trigger.
- **Playbook**: NPC behavior fields in the encounter YAML (motive, priority, flee_at, etc.).
- **Status ring**: physical numbered ring placed on a miniature's base to identify which of several identical NPCs is which. Drives the unique-numbering scheme for non-unique NPC IDs.
- **Tracker**: the running encounter (an active code block + the bar it produces).

---

## Deferred for v1

The schema supports these but v1 UI does not:
- **Misses and crit flags**: schema includes; UI omits hit/miss toggle and crit affordance
- **Ad hoc obligations**: schema includes; UI v1 only handles authored obligations
- **Prose generation**: log structure designed to support future narrative reconstruction
- **Hidden NPCs**: `hidden: true` flag for unrevealed combatants
- **Spatial/range tracking**: not modeled; DM identifies who is "in range" when relevant
- **Full spell effect modeling**: only saves and damage are first-class; complex effects (Hex moves on kill, Hunter's Mark transfer, etc.) are notes/manual
- **Cover/concealment**: not modeled
- **Action economy enforcement** (bonus action tracking, reaction tracking): not enforced; trust the DM
- **Ad-hoc encounter creation in-app**: encounters authored as YAML; no in-app encounter builder

---

## Acknowledgments and caveats for the implementer

This spec is the output of an extended design conversation. Several decisions were made through pushback and iteration; the rationale for each is included where it informs implementation. Where this spec is silent on a detail, prefer the principle "table-smoothness over feature breadth" and ask the DM (Owen) before guessing.

Particularly: the obligation system is the *most important feature* and the place where the existing tracker fails. Get this right before polishing other surfaces. The auto-prompt at trigger moment is the load-bearing UX.

The iPad Mini in reading view at the table is the primary use case. If a feature works there, it works everywhere; if it doesn't work there, it doesn't matter that it works elsewhere.
