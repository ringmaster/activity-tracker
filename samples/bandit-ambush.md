# Bandit Ambush

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
      - name: Scimitar
        type: attack
        dmg: [{dice: "1d6+3", type: slashing}]
      - name: Dagger
        type: attack
        dmg: [{dice: "1d4+3", type: piercing}]
      - name: Multiattack
        type: attack
        dmg: [{dice: "1d6+3", type: slashing}]
        note: "Three melee attacks: two scimitars, one dagger"
    behavior:
      motive: "Wants the party's goods; will negotiate if outmatched."
      priority: "Isolated targets first. Avoids heavy armor."
      flee_at: 15
      coordinates_with: [bandit-1, bandit-2, bandit-3]
      movement: "Stays behind the bandit line. Will not charge alone."
      notes: |
        Opens with Multiattack on the nearest PC.
        If two bandits drop, shouts for retreat.
    spell_slots:
      1: 0
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
      - name: Fire Bolt
        type: attack
        dmg: [{dice: "2d10", type: fire}]
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

spells:
  burning-hands:
    name: "Burning Hands"
    type: aoe
    range: "15ft cone"
    save: {stat: dex, dc: 13, on_pass: half}
    dmg: [{n: 14, type: fire}]
  shield:
    name: Shield
    type: buff
    effect: "+5 AC until start of next turn"
  healing-word:
    name: "Healing Word"
    type: heal
    range: "60ft"
    effect: "1d4+3 healing"
```
