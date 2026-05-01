# D&D Initiative Tracker

An Obsidian plugin for tracking initiative, actions, and NPC behavior during D&D 5e combat encounters. Designed for at-the-table use on an iPad Mini in reading view.

## Installation

1. Build the plugin: `npm install && npm run build`
2. Symlink or copy the `build/` directory into your vault's `.obsidian/plugins/activity-tracker/`
3. Enable the plugin in Obsidian's Community Plugins settings

## How it works

Write encounter data as YAML inside a `` ```dnd-combat `` code block in any note. In reading view, the plugin renders an interactive encounter dashboard with a sticky action bar at the top of the viewport.

## Encounter YAML

### Minimal example

```yaml
encounter: "Goblin Ambush"
combatants:
  - name: Goblin
    type: npc
    statblock: Goblin
    ac: 15
    hp: {current: 7, max: 7}
    count: 3
    actions:
      - name: Scimitar
        type: attack
        dmg: [{dice: "1d6+2", type: slashing}]
```

PCs are added from your party note when you start the encounter.

### Full NPC shape

```yaml
combatants:
  - name: Bandit Captain
    type: npc
    ac: 15
    hp: {current: 65, max: 65}
    actions:
      - name: Flame Tongue Scimitar
        type: attack
        dmg: [{dice: "1d6+3", type: slashing}, {dice: "2d6", type: fire}]
      - name: Multiattack
        type: attack
        dmg: [{dice: "1d6+3", type: slashing}]
        note: "Three melee attacks"
    spells:
      - Shield              # SRD lookup by name
      - Burning Hands       # SRD lookup by name
      - name: "Hex Blast"   # fully defined custom spell
        type: attack
        range: "60ft"
        dmg: [{n: 9, type: necrotic}]
        effect: "Target has disadvantage on next attack"
    spell_slots:
      1: 3
      2: 2
    behavior:
      motive: "Wants the party's goods."
      priority: "Isolated targets first."
      flee_at: 15
      movement: "Stays behind the bandit line."
      notes: |
        Opens with Multiattack on the nearest PC.
      spell_preferences:
        - when: "Two enemies clustered"
          cast: "Burning Hands"
```

### Combatant fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `type` | `npc` or `pc` | NPCs have HP tracking; PCs track damage taken |
| `ac` | number | Armor class (shown in target picker) |
| `hp` | `{current, max}` | Hit points (NPC only) |
| `count` | number | Expands into numbered copies (e.g., Goblin 1, Goblin 2) |
| `actions` | array | Weapon/ability templates with dice damage |
| `spells` | array | Strings (SRD lookup) or full spell objects |
| `spell_slots` | map | Level to count, e.g., `1: 3` means 3 first-level slots |
| `behavior` | object | NPC coaching: motive, priority, flee_at, movement, notes |

### Actions format

Actions define what appears in the "via" autocomplete. Damage uses dice notation for display; the actual rolled number is entered manually at the table.

```yaml
actions:
  - name: Scimitar
    type: attack
    dmg: [{dice: "1d6+2", type: slashing}]
  - name: Javelin
    type: attack
    dmg: [{dice: "1d6+2", type: piercing}]
```

### Spells

Spells on a combatant can be a simple string (looked up from the SRD database of 319 spells) or a full object for custom spells.

```yaml
spells:
  - Fire Bolt          # looked up from SRD
  - Shield             # looked up from SRD
  - name: "Dark Bolt"  # custom definition
    type: attack
    dmg: [{n: 8, type: necrotic}]
```

When an SRD spell is selected from the via autocomplete, its full description appears below the action bar as rendered markdown.

## Party note

Create a note with a YAML code block containing your party roster. Configure the path in plugin settings (default: `party.md`).

```yaml
party:
  - id: wex
    name: Wex
    player: Owen
    notes: "Rogue, 5th"
    actions:
      - name: Shortsword
        type: attack
        dmg: [{type: piercing}]
      - name: Shortbow
        type: attack
        dmg: [{type: piercing}]

  - id: roice
    name: Roice
    player: Joe
    notes: "Fighter, 5th"
    actions:
      - name: Glaive
        type: attack
        dmg: [{type: slashing}]
```

When a PC uses a new action or spell during combat, it's automatically saved back to the party note for future encounters.

## The action bar

The sticky bar appears at the top of the reading view when an encounter is active. Buttons from left to right:

| Button | Action |
|--------|--------|
| **&#9664;** | Previous turn (navigate log history) |
| **Actor** | Current actor name; tap to swap actor or add combatants |
| **&#9876;** | Attack: select target, weapon/spell, enter damage |
| **&#10024;** | Cast: cast a spell with stackable effects |
| **&#10084;** | Heal: restore HP |
| **&#128694;** | Move: record movement (closes, separates, distances, flies, flees) |
| **&#128221;** | Note: freeform text entry |
| **&#9654;** | Next turn |

### Attack flow

1. Target picker opens automatically; tap a name for single-select, or check multiple
2. The "via" field autocompletes from the actor's actions, spells, and the SRD (after 3 characters)
3. Selecting a via populates the damage type icon and shows dice notation below the bar
4. Enter the rolled damage amount; press Enter or tap Commit
5. Typing a number directly into the via field moves it to the damage field

### Cast flow

Same as attack but starts with no effects and shows only spells in the via list. Use the **+** button to add effects:

- **Damage**: amount + damage type (icon picker)
- **Condition**: select from 5e conditions
- **Heal**: HP restoration amount
- **Tag**: ongoing effect with trigger timing and reminder text
- **Failed**: marks the action as failed (no effects applied)

Multiple effects can be stacked on a single cast.

### Tags and obligations

When a spell with ongoing effects is selected, the plugin auto-generates a tag from the SRD description:

- Detects "start of turn" / "end of turn" timing from the description text
- Builds a concise reminder (e.g., "start of turn: WIS save; 2d6 fire")
- Concentration spells auto-tag the caster as "Concentrating: [spell]"

Tags appear as blue chips on combatant rows. When a tagged combatant's trigger fires, a banner drops below the action bar with the reminder text and a Dismiss button.

Dismissing a target's spell tag also drops the caster's concentration tag.

### Move actions

Each movement button commits immediately (no separate Commit step):

- **Closes**: actor moves toward target/encounter
- **Separates**: actor moves away
- **Distances**: actor puts distance between
- **Flies**: actor flies over
- **Flees**: actor flees; marked as "fled" and skipped in initiative

### Turn log

Actions committed during a turn appear below the bar as a compact log. Each entry has a small X for undo (reverts damage, healing, conditions, tags, and removes the log entry). Navigate back/forward to see any turn's log.

### Actor swap

Tap the actor name to open the actor dropdown. Shows the current actor's full state (HP, conditions, tags, spell slots, behavior coaching). Tap another combatant to temporarily swap the actor for reactions or legendary actions; the name shows as "&#8617; Roice" until swapped back.

## Encounter lifecycle

1. **Author** the encounter YAML in a note
2. **Run encounter** in reading view; enter PC initiatives, NPC initiatives auto-roll
3. **Play** using the action bar; all actions are logged to the YAML
4. **Stop** pauses the encounter; **Continue** resumes it
5. **Show log** (when paused) displays the full encounter log with copy-to-clipboard
6. **Reset** restores all NPCs to full HP, clears the log, removes PCs

## Plugin settings

| Setting | Default | Description |
|---------|---------|-------------|
| Party note path | `party.md` | Path to the vault note with party data |
| Code block language | `dnd-combat` | The language tag for encounter code blocks |

## Development

```sh
npm install
npm run dev     # watch mode
npm run build   # production build to build/
```

Output files in `build/`: `main.js`, `manifest.json`, `styles.css`.
