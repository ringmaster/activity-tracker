# `dnd-combat` YAML Schema Reference

This is the **live reference** for the YAML shapes consumed and produced by the
activity-tracker plugin. The v1 design rationale lives in
[`initiative-tracker-spec.md`](./initiative-tracker-spec.md); when the spec and
this document disagree, **this document is correct** and the spec is historical.

Three YAML documents are involved:

1. **Encounter code block** — a `` ```dnd-combat `` fenced block inside an
   Obsidian note. One per note may be active at a time. This is the primary
   schema and the only document the tracker writes back to.
2. **Party note** — a single vault note (default `party.yaml`) listing PCs.
   Read on encounter start; written when a PC uses a new action or spell.
3. **Action library files** — one or more vault YAML files (default
   `library.yaml, weapons.yaml, srd-library.yaml`) holding reusable action and
   spell templates. Read at plugin load and refreshed on demand; written when
   a PC's newly-used action is persisted.

Authoritative TypeScript types live in `src/types/encounter.ts`,
`src/types/actions.ts`, `src/types/obligations.ts`, and `src/types/party.ts`.

---

## 1. The encounter code block

### Container

The plugin registers a markdown code-block processor for the language tag
configured in plugin settings (default `dnd-combat`). The block contains a
single YAML document.

````markdown
```dnd-combat
encounter: "Goblin Throne Room"
combatants: ...
```
````

When the encounter activates, the plugin scans the note for any other
`dnd-combat` blocks with `active: true` and clears them. Only one active
tracker per note is supported.

### Top-level fields

| Field                | Type                          | Authored?           | Notes |
|----------------------|-------------------------------|---------------------|-------|
| `encounter`          | string                        | yes                 | Display name. |
| `active`             | boolean                       | tracker-managed     | Bar visibility flag. Defaults to `false`. |
| `round`              | integer                       | tracker-managed     | Current round number. `0` before start; `1` after `start_combat`. |
| `current_turn`       | string &#124; null            | tracker-managed     | Combatant id of the actor whose turn it is. |
| `combatants`         | `Combatant[]`                 | yes                 | See §1.1. Required. |
| `zones`              | `Zone[]`                      | yes (optional)      | See §1.4. When omitted, combatants are zoneless. |
| `prepositions`       | `string[]`                    | runtime-extended    | Custom preposition labels added through the move bar's `+` button. Built-in prepositions (`above`, `beside`, `inside`, `under`) are **not** stored here. |
| `log`                | `LogEntry[]`                  | tracker-managed     | See §1.7. Defaults to `[]`. |
| `active_obligations` | `ActiveObligation[]`          | tracker-managed     | See §1.8. Defaults to `[]`. |

`zones` and `prepositions` are written back only when non-empty. The expanded,
post-start YAML always contains the full set of fields above; the authored
minimum is much smaller (see §1.9).

---

### 1.1 Combatants

Three kinds, distinguished by `type`:

- `npc` — full tracker model: HP, conditions, tags, concentration, spell
  slots, legendary actions, behavior coaching.
- `pc` — light tracker model: tracks damage accumulated, conditions, tags,
  concentration. No max HP, no spell slots.
- `object` — like an NPC for damage purposes (has `hp.current/max`), but is
  **skipped in turn order**. Used for breakable scenery (bridges, doors,
  brittle pillars). Authored tags survive `reset`; this is intentional so that
  `when_destroyed` triggers persist across replays of the same encounter.

#### Authored vs runtime shape

Authored combatants may omit nearly every field. Runtime combatants are the
expanded shape after `loadFromData`:

- Tracker fills `init: null`, `temp_hp: 0`, `conditions: []`, `tags: []`,
  `concentration: null`.
- NPCs get `hp: {current: 0, max: 0}` if absent, plus `legendary_actions: null`.
- Objects get `hp: {current: 0, max: 0}` if absent.
- PCs get `damage_taken: 0`.
- `spell_slots`, if authored as plain numbers, is normalized to
  `{current, max}` entries (see §1.1.4).
- Tags without an `id` are backfilled with a generated string id.
- Combatants without an `id` get a slug derived from `name`; collisions get
  `-2`, `-3`, ... suffixes (see §1.1.5).

#### 1.1.1 Combatant fields

| Field                | Type                                                   | Notes |
|----------------------|--------------------------------------------------------|-------|
| `id`                 | string                                                 | Optional in authored YAML; auto-derived if missing. Must be unique per encounter. |
| `name`               | string                                                 | Display name. |
| `type`               | `"npc" \| "pc" \| "object"`                            | Required. |
| `statblock`          | string                                                 | NPC only. Fantasy Statblocks bestiary key for HP/AC/Dex lookup. |
| `init`               | number &#124; null                                     | Auto-rolled at encounter start for NPCs; entered at start for PCs. |
| `ac`                 | number                                                 | Armor class. Shown in target picker. |
| `toHit`              | number                                                 | Default attack roll bonus for the combatant's non-spell actions. |
| `spellAttack`        | number                                                 | Default spell attack bonus for the combatant's spells. |
| `hp`                 | `{current: number, max: number}`                       | NPC and object only. |
| `damage_taken`       | number                                                 | PC only. Damage accumulator (replaces HP for PCs). |
| `temp_hp`            | number                                                 | Defaults to 0. |
| `conditions`         | `string[]`                                             | Active condition names. Sentinel values `"dead"` (auto-applied at 0 HP for NPCs/objects) and `"fled"` mark a combatant as out of combat. |
| `tags`               | `CombatTag[]`                                          | See §1.1.6. |
| `concentration`      | `{spell: string, line_ref: number} \| null`            | Tracked separately from the `Concentrating: <spell>` tag for backwards compatibility. `line_ref` is the index in `log` of the cast. |
| `spell_slots`        | `Record<level, number \| {current, max}>`              | NPC only. See §1.1.4. |
| `legendary_actions`  | `{max: number, current: number} \| null`               | NPC only. `current` resets to `max` at the start of the carrier's turn. |
| `actions`            | `(string \| CombatAction)[]`                           | See §1.1.2. |
| `spells`             | `(string \| Spell)[]`                                  | See §1.1.3. |
| `behavior`           | `Behavior`                                             | NPC only. See §1.1.7. |
| `recharge`           | `Record<string, boolean>`                              | NPC only. Map of ability name -> whether it's currently available. |
| `hidden`             | boolean                                                | Deferred for v1; reserved. |
| `friendly`           | boolean                                                | When set, an NPC is treated as a party ally; a PC marked `friendly: false` is treated as hostile. |
| `zone`               | `{id: string, preposition?: string}`                   | See §1.4. Combatants without a zone default to the first declared zone. |
| `count`              | integer                                                | **Authored only.** Expands the entry into `count` copies; consumed at load time. See §1.1.5. |

#### 1.1.2 Actions array

`actions:` is a list whose entries may be either a **string** (resolves by
case-insensitive name match against the merged library) or a **full
`CombatAction` object**. Library lookup falls back to the SRD if no library
match is found.

```yaml
actions:
  - Dagger                          # library lookup ("Dagger" from weapons.yaml)
  - name: Flame Tongue Scimitar     # inline definition
    type: attack
    dmg: [{dice: "1d6+3", type: slashing}, {dice: "2d6", type: fire}]
```

`CombatAction` fields:

| Field           | Type                                | Notes |
|-----------------|-------------------------------------|-------|
| `name`          | string                              | Required. |
| `type`          | string                              | Common values: `attack`, `ability`, `spell`, `multiattack`, `reminder`. Free-form. |
| `verb`          | string                              | Optional override of the action's log verb (`"grapples"`, `"shoves"`). |
| `toHit`         | number                              | Per-action attack bonus; overrides the combatant default. |
| `dmg`           | `AuthoredDamage[]`                  | See §1.10. Authored as `{dice: "1d6+3", type: slashing}`. |
| `save`          | `SaveInfo`                          | `{stat, dc, on_pass?}`. `stat` may be a list to indicate "target's choice". |
| `area`          | string                              | Display label, e.g. `"15ft cone"`. |
| `effects`       | `ActionEffect[]`                    | See §1.1.8. Auto-populate the action bar on selection. |
| `effect`        | string                              | Legacy free-text effect description. |
| `note`          | string                              | Reminder shown in the action bar / actor dropdown. |
| `slot`          | number                              | Spell slot level used (1-9). |
| `concentration` | boolean                             | When true, casting tags the actor as `Concentrating: <spell>`. |

The following are **display/reference fields** populated from the SRD or
authored for reference. They have no semantic effect on the tracker:

`desc` (alias `description`), `higher_level`, `level`, `school`,
`casting_time`, `duration`, `components`, `material`, `ritual`, `range`,
`damageType`, `dice`, `saveStat`, `saveOnSuccess`, `areaOfEffect`, `classes`.

`_source` is a runtime-only field set by the library loader to indicate which
library file an entry was loaded from; do not author it.

#### 1.1.3 Spells array

`spells:` is the same dual-shape (`string` or full `Spell` object) as
`actions:`. String entries first hit the loaded library; library entries with
no `type:` are normalized to `type: spell` at load. If the library has no
match, the SRD database (`data/5e-SRD-Spells.json`, 319 spells) is consulted.

`Spell` extends `CombatAction` with an optional `obligation:` block (§1.3).

```yaml
spells:
  - Fire Bolt              # library/SRD lookup
  - Shield
  - name: "Hex Blast"      # inline custom spell
    type: spell
    verb: "casts"
    toHit: 5
    range: "60ft"
    dmg: [{n: 9, type: necrotic}]
    effect: "Target has disadvantage on next attack"
```

#### 1.1.4 Spell slots

Authored as plain integers (the max slot count at that level):

```yaml
spell_slots:
  1: 4
  2: 3
  3: 3
```

Normalized at load to:

```yaml
spell_slots:
  1: {current: 4, max: 4}
  2: {current: 3, max: 3}
  3: {current: 3, max: 3}
```

The tracker decrements `current` when a logged spell entry includes
`slot: <n>`. PCs never have `spell_slots`; PC slot expenditure is logged for
narrative purposes only.

#### 1.1.5 Combatant id derivation

For each authored combatant in document order:

- If `count` is absent or `1`, the entry is **unique**. Its id is `entry.id`
  if set, otherwise `toSlug(name)` (kebab-case). If the desired id collides
  with an earlier combatant's id, the loader appends `-2`, `-3`, ... until
  unique.
- If `count > 1`, the entry expands into `count` copies. A **running counter
  across all non-unique entries in the encounter** numbers them: 3 Goblins +
  2 Orcs become `goblin-1`, `goblin-2`, `goblin-3`, `orc-4`, `orc-5`. The
  display name appends the number: `"Goblin 1"`, `"Goblin 2"`, etc. The
  counter is *not* recycled when combatants die.

This matches the physical "status ring" convention at the table: each ring is
unique across the whole encounter, so multiple identical NPCs of different
species never share a number.

#### 1.1.6 Tags

Tags are the primary mechanism for **ongoing effects, reminders, and deferred
damage**. They live on the carrying combatant in `tags: []` and surface as
chips in the inline view and as banners at trigger moments.

```yaml
tags:
  - name: Legendary Resistance
    trigger: start_of_turn
    note: "Auto-succeed a failed saving throw."
    uses: { current: 3, max: 3 }
  - name: paralyzed (Rendmarrow)
    source: rendmarrow
    trigger: end_of_turn
    note: "DC 18 CON save to end."
```

`CombatTag` fields:

| Field           | Type                                                   | Notes |
|-----------------|--------------------------------------------------------|-------|
| `id`            | string                                                 | Auto-backfilled when missing. Required for keyed re-render. |
| `name`          | string                                                 | Display name. Tags whose name starts with `Concentrating: ` denote spell concentration; tags whose name starts with `Concentration:` are pending concentration saves. |
| `source`        | string                                                 | Combatant id that produced this tag (typically the caster or the tagged combatant itself). Used for cascade cleanup on concentration drop. |
| `note`          | string                                                 | Free-text reminder shown in the chip and banner. |
| `trigger`       | `TagTrigger`                                           | See §1.5. Tags without a trigger never raise a banner. |
| `onTrigger`     | string                                                 | Banner text; defaults to `note` when absent. |
| `autoRemove`    | `"on_save" \| "on_source_end" \| "manual"`             | Cleanup hint; default is `"manual"`. |
| `dice`          | string                                                 | Display-only dice expression for deferred damage/heal. |
| `damageType`    | string                                                 | For deferred damage tags. |
| `save`          | `{stat: string, onSave?: string}`                      | For tags that resolve by save (e.g., `{stat: "dex", onSave: "half"}`). |
| `isHeal`        | boolean                                                | Marks a deferred-heal tag (vs. deferred-damage). |
| `resolveTarget` | string                                                 | Combatant id the deferred effect resolves against. |
| `castId`        | string                                                 | Groups tags created from the same cast for cascade cleanup on concentration drop. |
| `uses`          | `{current: number, max: number}`                       | Limited-use tag. The banner disables when `current === 0`. |
| `resetOn`       | `"turn"`                                               | When set to `"turn"`, `uses.current` is restored to `uses.max` at the start of the carrier's turn. Absent = never auto-reset. |

#### 1.1.7 Behavior block (NPC coaching)

Free-form authored prose surfaced in the actor dropdown. None of these fields
affect tracker mechanics.

```yaml
behavior:
  motive: "Protect the throne; will not leave the dais."
  priority: "Spellcasters first, then heavy armor."
  flee_at: 7
  coordinates_with: [goblin-1, goblin-2]
  movement: "Stays within 15ft of throne."
  notes: |
    Will use Misty Step to escape if cornered.
  extra_actions:
    - name: "Throw caltrops"
      type: attack
      area: "10ft cone"
      save: {stat: dex, dc: 12}
      effect: "Speed halved until next turn"
  spell_preferences:
    - when: "Bloodied"
      cast: "Shield of Faith on self"
```

`Behavior` fields: `motive`, `priority`, `flee_at` (HP threshold),
`coordinates_with` (list of combatant ids), `movement`, `notes`,
`extra_actions` (`ExtraAction[]`), `spell_preferences` (`SpellPreference[]`).

`ExtraAction`: `{name, type, area?, save?, effect?, dmg?}` (subset of
`CombatAction`).

`SpellPreference`: `{when: string, cast: string}`.

#### 1.1.8 ActionEffect

Effects attached to a `CombatAction` auto-populate the action bar when the
action is selected, and (for `active_at_start: true`) seed the combatant with
a tag when the encounter starts.

```yaml
effects:
  - type: tag
    name: Waves of Decay
    on: self
    trigger: start_of_turn
    note: "10ft radius: 2d8 necrotic to creatures within"
    dice: "2d8"
    damageType: necrotic
    active_at_start: true
```

`ActionEffect` fields:

| Field             | Type                                                                            | Notes |
|-------------------|---------------------------------------------------------------------------------|-------|
| `type`            | `"tag" \| "condition" \| "concentration" \| "damage" \| "heal"`                | Required. `concentration` is the shorthand that applies a `Concentrating: <action name>` tag to self. |
| `name`            | string                                                                          | Name of the tag or condition. |
| `on`              | `"target" \| "self" \| "enemy" \| "ally"`                                       | Recipient. Defaults vary by effect type. |
| `trigger`         | `TagTrigger`                                                                    | When the resulting tag fires. Absent = passive/immediate. |
| `note`            | string                                                                          | Reminder shown in banners. |
| `dice`            | string                                                                          | Deferred damage/heal dice expression. |
| `damageType`      | string                                                                          | Deferred damage type. |
| `save`            | `{stat: string, onSave?: string}`                                               | Deferred save info. |
| `active_at_start` | boolean                                                                         | If true, this effect is auto-applied as a tag on the host combatant when the encounter starts. Applies only to `type: tag`, `heal`, or `damage`. |
| `uses`            | number                                                                          | Limited-use cap, copied to the resulting tag's `{current, max}`. |
| `resetOn`         | `"turn"`                                                                        | Copied to the resulting tag. |

---

### 1.2 Damage shapes

The plugin distinguishes **authored damage** (rolled live at the table; the
dice expression is for display only) from **logged damage** (the actual number
that landed).

- **`AuthoredDamage`** — appears in `actions[].dmg` and most `effects[].dmg`:
  `{dice: "2d6+3", type: "fire"}`. The dice string is shown next to the
  damage field in the bar; the DM types the rolled total.
- **`DamageComponent`** — appears in log entries and `spell.dmg` / spell
  `obligation.dmg`: `{n: 28, type: "fire"}`. `n` is the rolled number.

`dmg` is **always a list**, even for single-type damage. Multi-type damage
appends entries:

```yaml
dmg: [{dice: "2d6+7", type: slashing}, {dice: "2d8", type: necrotic}]
```

The two shapes are tolerated in the same field in handwritten YAML, but
new content should follow the convention above.

---

### 1.3 Spell `obligation` block

Authored on a full `Spell` object to declare a recurring trigger. When such a
spell is cast through the bar, the tracker creates an entry in
`active_obligations` (§1.8).

```yaml
spells:
  - name: "Evard's Black Tentacles"
    type: debuff
    range: "20ft cube"
    concentration: true
    duration_rounds: 10
    obligation:
      target: affected
      trigger: end_of_turn
      kind: save
      stat: [str, dex]
      dc: 15
      on_fail: "10 bludgeoning, remain restrained"
      on_success: ends
```

| Field         | Type                                                                                                  | Notes |
|---------------|-------------------------------------------------------------------------------------------------------|-------|
| `target`      | `"affected" \| "enemies_in_range" \| "allies_in_range" \| "specific"`                                 | Who carries the obligation. |
| `trigger`     | `"start_of_turn" \| "end_of_turn" \| "when_damaged" \| "init_20" \| "start_of_round"`                 | When the banner fires. |
| `kind`        | `"save" \| "save_for_half" \| "damage" \| "custom"`                                                   | Resolution model. |
| `stat`        | string &#124; string[]                                                                                | Save stat. List = target picks. |
| `dc`          | number                                                                                                | Save DC. |
| `dmg`         | `DamageComponent[]`                                                                                   | Damage on trigger; uses `n` form (pre-rolled / fixed). |
| `on_fail`     | string                                                                                                | Reminder shown when the target fails the save. |
| `on_success`  | `"ends" \| "continues" \| "half" \| <free-form>`                                                      | Drives smart-default Dismiss/Recur in the banner. |
| `on_save`     | string                                                                                                | Alternative label for save outcome (`"half"` used by Spirit Guardians). |

Concentration-save obligations are generated at runtime when damage is dealt
to a concentrating combatant; they are not authored.

---

### 1.4 Zones

Optional positional grouping. Each zone is a named slot; each combatant has
at most one `zone`.

```yaml
zones:
  - id: south
    name: South of Bridge
  - id: bridge
    name: On Bridge
  - id: north
    name: North of Bridge
combatants:
  - name: Murkwater Bridge
    type: object
    zone: { id: bridge }
  - name: Lizardman
    type: npc
    count: 3
    # zone omitted -> defaults to first declared zone
```

`Zone`: `{id: string, name: string}`.

`ZonePosition` (the `zone:` field on a combatant): `{id: string, preposition?: string}`.

`preposition` is a label like `above`, `beside`, `inside`, `under`, or any
custom label the DM has added through the move bar's `+` button. The four
built-ins are rendered with icons and **are not stored** in
`encounter.prepositions`; only custom labels are.

When `zones` is declared, any combatant without an explicit `zone` is
defaulted to the first zone's id at load time.

---

### 1.5 Trigger types

`TagTrigger` (used by `CombatTag.trigger`, `ActionEffect.trigger`, and
`SpellObligation.trigger`):

| Trigger          | Fires |
|------------------|-------|
| `start_of_turn`  | At the start of the carrier's turn. |
| `end_of_turn`    | At the end of the carrier's turn. |
| `when_damaged`   | When the carrier takes damage. Used for concentration saves. |
| `when_targeted`  | When the carrier is selected as a target during action entry. |
| `when_destroyed` | When the carrier (typically a `type: object` combatant) reaches 0 HP. |
| `on_ally_turn`   | When any ally takes a turn. |
| `on_enemy_turn`  | When any enemy takes a turn. |
| `init_20`        | At initiative 20 of each round (lair-action pattern). Obligations only. |
| `start_of_round` | At the start of each round. Obligations only. |

---

### 1.6 Friend/foe sides

Each combatant has an implicit side based on `type`:

- PCs are **friendly to the party**.
- NPCs are **hostile to the party**.
- Objects are sideless.

`friendly: true` on an NPC flips it to the party side; `friendly: false` on
a PC flips it to the NPC side. The flag drives the `on: enemy` /  `on: ally`
resolution in `ActionEffect`.

---

### 1.7 Log entries

`log` is an append-only array of `LogEntry` objects, one key per entry,
written by the tracker. Each shape is a single-key object so YAML reads as a
list of named events.

The 17 supported entry shapes:

| Key                | Payload |
|--------------------|---------|
| `start_combat`     | `{at: string}` |
| `end_combat`       | `{at: string}` |
| `start_round`      | `{n: number, at: string}` |
| `start_turn`       | `{who: string, init: number, at: string}` |
| `attack`           | `{by, via, verb?, spell?, failed?, save?, tgt: AttackTargetResult[]}` |
| `heal`             | `{by, via?, tgt: {who: string, hp: number}[]}` |
| `buff`             | `{by, via, tgt: string[], slot?, conc?}` |
| `debuff`           | `{by, via, tgt: string[], slot?, conc?}` |
| `condition`        | `{by, tgt: string[], conditions: string[], via?}` |
| `tag`              | `{by, tgt: string[], name, note?, via?}` |
| `save`             | `{who, stat, dc, result: "pass" \| "fail", for?}` |
| `note`             | `{by, text}` |
| `death`            | `{who, at}` |
| `effect_ends`      | `{what, on, reason}` |
| `add_combatant`    | `{who, name, init, at}` |
| `remove_combatant` | `{who, reason?, at}` |
| `move`             | `{by, from?: ZonePosition \| null, to?: ZonePosition, fled?: boolean}` |

`AttackTargetResult`: `{who: string, hit?: "full" | "half" | "zero", dmg?: DamageComponent[]}`.

`at` is a short timestamp (HH:MM:SS) emitted by `nowTimestamp()`.

The `attack.failed` flag marks an action that committed structurally but had
no mechanical effect (used by the `Failed` effect in the cast flow). The
`attack.spell` flag flags a spell action vs. a weapon attack. The
`attack.resolved` flag (also present as `heal.resolved`) marks an entry that
resolves a previously-deferred tag rather than introducing a new action.

`effect_ends.reason` values produced by the tracker include
`concentration_dropped`, `source_concentration_lost`, `dismissed`, and
`save_succeeded`.

---

### 1.8 Active obligations

```yaml
active_obligations:
  - id: ob-1722901234-abcd
    spell: evards-tentacles
    cast_line: 14
    tgt: [roice]
    expires: { round: 12 }
    last_triggered: null
```

`ActiveObligation`:

| Field            | Type                  | Notes |
|------------------|-----------------------|-------|
| `id`             | string                | Auto-generated. Concentration-save obligations carry an id prefixed `conc-`. |
| `spell`          | string                | Spell key (looked up across all combatants' `spells`). |
| `cast_line`      | number                | Index in `log` of the cast entry. |
| `tgt`            | string[]              | Combatant ids carrying the obligation. |
| `expires`        | `{round: number}`     | Absolute round number; the obligation is cleaned up when `state.round > expires.round`. Optional. |
| `last_triggered` | number &#124; null    | Index in `log` of the last resolution. Updated on `Recur`. |

Cleanup happens on resolution (`Dismiss`), on expiry, when all carriers are
dead, or at `end_combat` (which clears the whole list).

---

### 1.9 Authored minimum

This is the smallest valid encounter block:

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
```

NPC initiatives auto-roll from Fantasy Statblocks; HP fills from the
stat block (or `{0, 0}` if no stat block); PCs are added at start time from
the party note.

---

### 1.10 Field key conventions

High-frequency log fields use short keys. **Use the same key for the same
concept everywhere**; do not introduce `damage` if `dmg` is used in the log.

| Key   | Meaning |
|-------|---------|
| `tgt` | Targets. Always a list. |
| `via` | Source of an action (weapon, spell, ability name). |
| `by`  | Actor performing the action. |
| `who` | Subject of a single-target entry. |
| `at`  | Timestamp (HH:MM:SS). |
| `dc`  | Save DC. |
| `stat`| Save stat (or list of stats for target's choice). |
| `dmg` | Damage list. `[{n, type}]` in log; `[{dice, type}]` in authored actions. |
| `n`   | Rolled damage number. |
| `slot`| Spell slot level used. |
| `conc`| Concentration flag on a buff/debuff entry. |
| `init`| Initiative roll. |
| `dur` | Duration in rounds (reserved). |

---

## 2. Party note

Default path: `party.yaml` (configurable as `partyNotePath` in plugin
settings). The loader accepts the data in any of three locations within the
note (tried in order):

1. The entire file parsed as YAML.
2. A fenced ```yaml or ```yml code block.
3. The YAML frontmatter (`---` block at file top).

The recognized key is `party:`.

```yaml
party:
  - id: wex
    name: Wex
    player: Owen
    notes: "Rogue, 5th"
    actions:
      - Shortsword                      # library reference
      - Shortbow
      - name: Sneak Attack              # inline custom action
        type: attack
        dmg: [{dice: "2d6", type: piercing}]
        note: "once per turn"
    spells:
      - Mage Hand                       # SRD/library lookup; learned spells stored as strings
```

`PartyMember`:

| Field     | Type                                       | Notes |
|-----------|--------------------------------------------|-------|
| `id`      | string                                     | Required. Used to identify the PC across encounters. |
| `name`    | string                                     | Required. |
| `player`  | string                                     | Optional. |
| `notes`   | string                                     | Optional free-text. |
| `actions` | `(string \| PartyAction)[]`                | Optional. Strings reference the action library. |
| `spells`  | `string[]`                                 | Optional. Learned spells (appended at runtime). |

`PartyAction`: `{name, type, dmg?: DamageComponent[], save?: SaveInfo, slot?: number, note?: string}`.

When a PC uses a new (unknown) action or spell during combat:

1. If the via is already in the library, a string reference is added to the
   PC's `actions` or `spells` in the party note.
2. Otherwise, a stub action is added to the **first configured library file**
   (so it's reusable), and a string reference is added to the PC.

The party note is rewritten preserving its original format (bare YAML, code
block, or frontmatter).

---

## 3. Action library files

Default paths: `library.yaml, weapons.yaml, srd-library.yaml` (configurable
as comma-separated `libraryPaths` in plugin settings). Loaded once at plugin
start and cached; the cache invalidates when `libraryPaths` changes or the
`Reload libraries` setting button fires.

Each file is parsed flexibly: bare YAML, fenced ```yaml block, or
frontmatter. Recognized top-level keys:

- `actions:` — `CombatAction[]` (full schema from §1.1.2).
- `spells:` — `CombatAction[]`; entries without `type:` are normalized to
  `type: spell` at load.

```yaml
actions:
  - name: Scimitar
    type: attack
    dmg: [{dice: "1d6", type: slashing}]
  - name: Net
    type: attack
    verb: "throws a net at"
    note: "DC 10 STR or 5 slashing to net (AC 10) to escape"
    effects:
      - type: tag
        name: restrained (net)
        on: target
        note: "DC 10 STR or 5 slashing to net (AC 10) to escape"

spells:
  - name: Fire Bolt
    range: "120ft"
    dmg: [{n: 10, type: fire}]
```

The library loader:

- Decorates each loaded entry with `_source` (a derived label from the
  filename, e.g. `"Srd Library"`). This is runtime-only; do not author it.
- Accepts `description:` as an alias for `desc:` and renames it on load.
- Lookups are case-insensitive by name; the first match across all files
  wins.

When a new action is added programmatically (PC learning flow), it is written
to the **first path in `libraryPaths`**, preserving that file's format (bare
YAML vs. fenced code block).

---

## 4. Plugin settings

Stored as plugin data through Obsidian's standard settings persistence.

| Setting               | Default                                       | Notes |
|-----------------------|-----------------------------------------------|-------|
| `partyNotePath`       | `party.yaml`                                  | Vault path to the party note. |
| `libraryPaths`        | `library.yaml, weapons.yaml, srd-library.yaml`| Comma-separated list of library file paths. The first path is the write target. |
| `codeBlockLanguage`   | `dnd-combat`                                  | The fenced-code-block language the processor binds to. |
| `debugOverlay`        | `false`                                       | Renders an in-block diagnostic log. |

---

## 5. YAML round-trip notes

- The plugin writes via `app.vault.process()` for atomic read-modify-write,
  rescanning fence positions on each write so cursor edits in the surrounding
  prose don't corrupt the block.
- `js-yaml` is used with `lineWidth: -1, sortKeys: false, noRefs: true,
  quotingType: '"', forceQuotes: false`. Field order is preserved by serializing
  the in-memory shape, which is hand-ordered in `EncounterState.toData()`.
- Optional collections (`zones`, `prepositions`) are emitted only when
  non-empty.
- Reactive Svelte proxies are stripped with a JSON round-trip in `toData()`
  before serializing.

---

## 6. Open caveats

- Hidden combatants (`hidden: true`) are reserved in the schema but not
  surfaced in the UI.
- Misses and crits remain deferred from the v1 UI; the `failed` flag and the
  `hit: zero` outcome cover the current behavior.
- Ad-hoc obligation creation (attaching an obligation to a one-off action) is
  still authored-only.
- Recharge tracking is per-NPC and not yet wired to a UI flow.

When these gaps close, update both this document and the affected sample
files in `samples/`.
