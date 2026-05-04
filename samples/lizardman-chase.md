A trio of lizardmen burst from the riverbank reeds clutching a stolen reliquary and bolt across the rope-and-plank bridge spanning the Murkwater. The bridge is old, water-warped, and groans under their weight. Catch them before they reach the far side -- or drop the bridge and pray.

```dnd-combat
encounter: "Lizardman Chase"
combatants:
  - name: Murkwater Bridge
    id: murkwater-bridge
    type: object
    init: 0
    ac: 15
    hp:
      current: 30
      max: 30
    tags:
      - id: bridge-collapse
        name: Bridge Collapse
        trigger: when_destroyed
        damageType: bludgeoning
        dice: "3d6"
        save:
          stat: dex
          onSave: half
        note: "Anyone on the bridge: DEX DC 13 or 3d6 bludgeoning (half on save) and swept downstream 60ft."
  - name: Lizardman
    type: npc
    statblock: Lizardman
    ac: 15
    toHit: 4
    hp:
      current: 22
      max: 22
    count: 3
    actions:
      - name: Bite
        type: attack
        toHit: 4
        dmg: [{dice: "1d6+2", type: piercing}]
      - name: Heavy Club
        type: attack
        toHit: 4
        dmg: [{dice: "1d4+2", type: bludgeoning}]
      - name: Multiattack
        type: multiattack
        note: "Two melee attacks: Heavy Club and Bite."
    behavior:
      motive: "Carry the reliquary back to the chieftain; do not be caught."
      priority: "Run. Engage only what blocks the path."
      flee_at: 6
      movement: "Sprint along the bridge toward the far bank. Swim if knocked off."
      notes: |
        Lizardman 1 carries the reliquary; the other two screen for it.
        If the carrier drops, the nearest survivor scoops it up and keeps running.
        They are at home in the water -- a collapsed bridge slows the party more than them.
```
