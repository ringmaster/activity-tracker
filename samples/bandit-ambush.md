The party rounds a bend in the forest road and finds a fallen cart blocking the path. As they approach, bandits emerge from the treeline.

```dnd-combat
encounter: "Bandit Ambush"
combatants:
  - name: Bandit Captain
    type: npc
    statblock: "Bandit Captain"
    ac: 15
    hp:
      current: 65
      max: 65
    actions:
      - name: Flame Tongue Scimitar
        type: attack
        dmg: [{dice: "1d6+3", type: slashing}, {dice: "2d6", type: fire}]
      - name: Dagger
        type: attack
        dmg: [{dice: "1d4+3", type: piercing}]
      - name: Multiattack
        type: attack
        dmg: [{dice: "1d6+3", type: slashing}, {dice: "2d6", type: fire}]
        note: "Three melee attacks: two flame tongue scimitars, one dagger"
      - Grapple
      - name: Shapeshift
        type: ability
        verb: "shapeshifts"
        concentration: true
        note: "Transforms into a dire wolf (AC 14, HP 37, bite 2d6+3 piercing). Equipment melds into new form."
        effects:
          - type: tag
            name: Shapeshifted
            on: self
            note: "Dire wolf form; AC 14, HP 37, bite 2d6+3 piercing"
          - type: concentration
    behavior:
      motive: "Wants the party's goods; will negotiate if outmatched."
      priority: "Isolated targets first. Avoids heavy armor."
      flee_at: 15
      coordinates_with: [bandit-1, bandit-2, bandit-3]
      movement: "Stays behind the bandit line. Will not charge alone."
      notes: |
        Opens with Multiattack on the nearest PC.
        If two bandits drop, shouts for retreat.
        Will Shapeshift into dire wolf if bloodied.
  - name: Bandit
    type: npc
    statblock: Bandit
    ac: 12
    hp:
      current: 11
      max: 11
    count: 3
    actions:
      - name: Scimitar
        type: attack
        dmg: [{dice: "1d6+1", type: slashing}]
      - name: Light Crossbow
        type: attack
        dmg: [{dice: "1d8+1", type: piercing}]
      - Grapple
  - name: Bandit Mage
    type: npc
    statblock: "Bandit Mage"
    ac: 12
    hp:
      current: 22
      max: 22
    actions:
      - name: Dagger
        type: attack
        dmg: [{dice: "1d4+1", type: piercing}]
    spells:
      - Fire Bolt
      - Burning Hands
      - Shield
      - Healing Word
      - name: "Hex Blast"
        type: spell
        verb: "casts"
        range: "60ft"
        dmg: [{n: 9, type: necrotic}]
        effect: "Target has disadvantage on next attack"
    behavior:
      motive: "Loyal to the captain; stays at range."
      priority: "Cluster targets for Burning Hands. Otherwise Fire Bolt the biggest threat."
      flee_at: 8
      movement: "Stays 30ft+ from melee. Uses cover."
      notes: |
        Will cast Shield as a reaction if targeted.
      spell_preferences:
        - when: "Three enemies within 15ft cone"
          cast: "Burning Hands"
        - when: "Ally down"
          cast: "Healing Word on ally"
    spell_slots:
      1: 3
      2: 2
```
