The sandstorm howls across the deck of the Netherwave as Dreadmaster Rendmarrow's crew closes in. The Rivenheart Twins flank the party while Bruggor blocks the forward path. Skeletal and zombie crew shamble from below deck.

```dnd-combat
encounter: "Netherwave Assault"
combatants:
  - name: Dreadmaster Rendmarrow
    type: npc
    statblock: "Dreadmaster Rendmarrow"
    ac: 18
    toHit: 10
    spellAttack: 10
    hp:
      current: 135
      max: 135
    legendary_actions:
      max: 3
      current: 3
    actions:
      - name: Paralyzing Touch
        type: attack
        dmg: [{dice: "3d6", type: cold}]
        effects:
          - type: tag
            name: paralyzed (Rendmarrow)
            on: target
            trigger: end_of_turn
            note: "DC 18 CON save to end. Repeat save at end of each turn."
      - name: Terrifying Presence
        type: ability
        verb: "unleashes terrifying presence"
        note: "Each creature of choice within 30ft: DC 18 WIS save or frightened 1 min. Repeat save end of each turn (disadv if Rendmarrow in sight)."
        effects:
          - type: condition
            name: frightened
            on: target
      - name: Multiattack
        type: multiattack
        note: "Rendmarrow can cast a cantrip and use Paralyzing Touch, or make two spell attacks."
      - name: Legendary Resistance
        type: ability
        effects:
          - type: tag
            name: Legendary Resistance
            on: self
            trigger: start_of_turn
            note: "Auto-succeed a failed saving throw."
            uses: 3
            active_at_start: true
      - name: Regeneration
        type: ability
        effects:
          - type: heal
            name: Regeneration
            trigger: start_of_turn
            dice: "10"
            note: "Regains 10 HP if above 0 HP. Negated by sunlight or running water."
            active_at_start: true
    spells:
      - Fire Bolt
      - Magic Missile
      - Shield
      - Mirror Image
      - Misty Step
      - Web
      - Counterspell
      - Fireball
      - Fly
      - Greater Invisibility
      - Ice Storm
      - Cone of Cold
      - Wall of Force
      - Circle of Death
      - Disintegrate
      - Finger of Death
      - Dominate Monster
      - Power Word Kill
    spell_slots:
      1: 4
      2: 3
      3: 3
      4: 3
      5: 3
      6: 1
      7: 1
      8: 1
      9: 1
    behavior:
      motive: "Defend the Netherwave. Subdue intruders for servitude or destroy them."
      priority: "Neutralize the biggest magical threat first. Use legendary actions between turns to maintain pressure."
      movement: "Stays near the helm. Uses Misty Step or Fly to reposition. Will not leave the ship."
      notes: |
        Opens with Terrifying Presence to soften the party.
        Legendary actions: Cantrip (1), Paralyzing Touch (2), Cast a Spell (2).
        Uses Counterspell aggressively against healing and high-level spells.
        Uses Power Word Kill on a wounded PC below 100 HP.
      spell_preferences:
        - when: "Multiple PCs clustered"
          cast: "Fireball or Circle of Death"
        - when: "Single high-value target"
          cast: "Disintegrate or Finger of Death"
        - when: "PC caster begins a spell"
          cast: "Counterspell"
        - when: "Losing control of battlefield"
          cast: "Wall of Force to split the party"

  - name: First Mate Omenwave
    type: npc
    statblock: "First Mate Omenwave"
    ac: 17
    toHit: 6
    spellAttack: 8
    hp:
      current: 80
      max: 80
    actions:
      - name: Necrotic Touch
        type: attack
        dmg: [{dice: "3d6+3", type: necrotic}]
      - name: Multiattack
        type: multiattack
        note: "Two Necrotic Touch attacks."
      - name: Waves of Decay
        type: ability
        verb: "emanates Waves of Decay"
        note: "10ft radius necrotic aura. 2d8 necrotic damage per turn to creatures within."
        effects:
          - type: tag
            name: Waves of Decay
            on: self
            trigger: start_of_turn
            note: "10ft radius: 2d8 necrotic to creatures within"
            dice: "2d8"
            damageType: necrotic
            active_at_start: true
      - name: Sandbind
        type: ability
        verb: "sandbinds"
        note: "Reaction. Target must make DC 15 STR save or be restrained for 1 round."
        effects:
          - type: tag
            name: restrained (sand)
            on: target
            trigger: end_of_turn
            note: "Restrained by sand. DC 15 STR to break free."
    spells:
      - Chill Touch
      - Shield
      - Mirror Image
      - Hold Person
      - Counterspell
      - Dispel Magic
      - Blight
      - Phantasmal Killer
      - Cloudkill
    spell_slots:
      1: 4
      2: 3
      3: 3
      4: 3
      5: 1
    behavior:
      motive: "Fanatically loyal to Rendmarrow. Protect the captain at all costs."
      priority: "Hover near Rendmarrow. Use Waves of Decay to punish melee attackers. Hold Person on martial PCs."
      movement: "Hovers 40ft. Incorporeal Movement: passes through creatures and objects (1d10 force if ending inside)."
      notes: |
        Uses Sandbind (reaction) on anyone charging Rendmarrow.
        Uses Counterspell to protect Rendmarrow.
        Incorporeal: can retreat through walls/deck if badly hurt.
      spell_preferences:
        - when: "Melee PC engaging Rendmarrow"
          cast: "Hold Person"
        - when: "PC caster targeting Rendmarrow"
          cast: "Counterspell"
        - when: "Multiple PCs in a group"
          cast: "Cloudkill"

  - name: Captain Eshara Blackvein
    type: npc
    statblock: "Captain Eshara Blackvein"
    ac: 18
    toHit: 7
    hp:
      current: 120
      max: 120
    legendary_actions:
      max: 1
      current: 1
    actions:
      - name: Greatsword
        type: attack
        dmg: [{dice: "2d6+7", type: slashing}, {dice: "2d8", type: necrotic}]
        note: "Grave Smite adds 2d8 necrotic on hit."
      - name: Multiattack
        type: multiattack
        note: "Two Greatsword attacks."
      - name: Aura of Fear
        type: ability
        verb: "projects an Aura of Fear"
        note: "Enemies within 10ft: DC 15 WIS save or frightened 1 min."
        effects:
          - type: condition
            name: frightened
            on: target
          - type: tag
            name: Aura of Fear
            on: self
            trigger: start_of_turn
            note: "Enemies within 10ft must save or be frightened."
            active_at_start: true
      - name: Command Undead
        type: ability
        verb: "commands undead to attack"
        note: "Legendary action (1). Orders one undead to make a single attack as a reaction."
      - name: Legendary Resistance
        type: ability
        effects:
          - type: tag
            name: Legendary Resistance
            on: self
            trigger: start_of_turn
            note: "Auto-succeed a failed saving throw."
            uses: 3
            active_at_start: true
    behavior:
      motive: "Enforce Rendmarrow's will. Relishes combat."
      priority: "Engage the strongest melee PC. Use Aura of Fear on grouped enemies."
      movement: "Aggressive advance. Stays in melee. Does not retreat."
      notes: |
        Opens with Multiattack on the nearest PC.
        Use Command Undead between turns to direct skeleton/zombie attacks.
        If reduced below 40 HP, fights more desperately; focuses on killing downed PCs.

  - name: Varik Rivenheart
    type: npc
    statblock: "Rivenheart Twin"
    ac: 17
    toHit: 8
    spellAttack: 7
    hp:
      current: 98
      max: 98
    actions:
      - name: Enchanted Scimitar
        type: attack
        dmg: [{dice: "1d6+5", type: slashing}, {dice: "1d8", type: necrotic}]
      - name: Multiattack
        type: multiattack
        note: "Two attacks: enchanted scimitar or spell attacks."
    spells:
      - Fire Bolt
      - Magic Missile
      - Shield
      - Mirror Image
      - Misty Step
      - Counterspell
      - Fireball
      - Greater Invisibility
      - Ice Storm
      - Cone of Cold
    spell_slots:
      1: 4
      2: 3
      3: 3
      4: 3
      5: 1
    behavior:
      motive: "Loyal to Rendmarrow; believes service will break their curse."
      priority: "Coordinate with Tolen. Focus fire on the biggest caster threat. Use Counterspell to shut down enemy magic."
      flee_at: 20
      coordinates_with: [tolen-rivenheart]
      movement: "Stays within 30ft of Tolen for coordinated attacks. Uses Misty Step to reposition."
      notes: |
        Opens with Greater Invisibility on self if not surprised.
        Uses Fireball on clustered PCs; avoids hitting Tolen or Bruggor.
        Saves Counterspell for healing or high-level spells.
        If Tolen drops, becomes reckless; burns remaining slots aggressively.
        Tactical Mind: bonus action Dash, Disengage, or Use Object.
      spell_preferences:
        - when: "Three or more enemies clustered"
          cast: "Fireball"
        - when: "Enemy caster begins a spell"
          cast: "Counterspell"
        - when: "First turn, not yet targeted"
          cast: "Greater Invisibility on self"

  - name: Tolen Rivenheart
    type: npc
    statblock: "Rivenheart Twin"
    ac: 17
    toHit: 8
    spellAttack: 7
    hp:
      current: 98
      max: 98
    actions:
      - name: Enchanted Scimitar
        type: attack
        dmg: [{dice: "1d6+5", type: slashing}, {dice: "1d8", type: necrotic}]
      - name: Multiattack
        type: multiattack
        note: "Two attacks: enchanted scimitar or spell attacks."
    spells:
      - Fire Bolt
      - Magic Missile
      - Shield
      - Mirror Image
      - Misty Step
      - Counterspell
      - Fireball
      - Greater Invisibility
      - Ice Storm
      - Cone of Cold
    spell_slots:
      1: 4
      2: 3
      3: 3
      4: 3
      5: 1
    behavior:
      motive: "Loyal to Rendmarrow; believes service will break their curse."
      priority: "Coordinate with Varik. Target isolated PCs with melee. Use Ice Storm for area denial."
      flee_at: 20
      coordinates_with: [varik-rivenheart]
      movement: "Aggressive; closes to melee range. Uses Misty Step to reach backline."
      notes: |
        Opens with Mirror Image, then closes to melee.
        Prefers Enchanted Scimitar over ranged spells when in reach.
        Uses Ice Storm to cut off retreating PCs or block chokepoints.
        If Varik drops, switches to ranged; uses Cone of Cold then retreats.
        Tactical Mind: bonus action Dash, Disengage, or Use Object.
      spell_preferences:
        - when: "First turn"
          cast: "Mirror Image"
        - when: "PCs retreating or clustered near cover"
          cast: "Ice Storm"
        - when: "Varik is down and enemies are in a 60ft cone"
          cast: "Cone of Cold"

  - name: Bruggor the Chainwielder
    type: npc
    statblock: "Bruggor the Chainwielder"
    ac: 15
    toHit: 10
    hp:
      current: 142
      max: 142
    actions:
      - name: Chain Ball Swing
        type: attack
        dmg: [{dice: "2d10+7", type: bludgeoning}]
        note: "Reach 10 ft."
      - name: Mighty Fist
        type: attack
        dmg: [{dice: "2d8+7", type: bludgeoning}]
      - name: Multiattack
        type: multiattack
        note: "Two attacks: one Chain Ball Swing, one Mighty Fist."
      - Grapple
      - name: Brutal Endurance
        type: ability
        effects:
          - type: tag
            name: Brutal Endurance
            on: self
            trigger: start_of_turn
            note: "At 0 HP, CON save DC 5+dmg taken. On success, regain 1 HP instead of dying."
            uses: 1
            active_at_start: true
    behavior:
      motive: "Serves Rendmarrow out of survival instinct, not loyalty. Retains a semblance of honor."
      priority: "Engage the strongest-looking melee PC. Use reach to control the front line."
      flee_at: 30
      movement: "Holds the front line. Will not chase fleeing PCs past 30ft from the twins."
      notes: |
        Opens with Chain Ball Swing against the nearest PC.
        Grapples anyone who tries to slip past to reach the twins.
        Could potentially be convinced to stand down if the twins are defeated.

  - name: Skeletal Crew
    type: npc
    statblock: Skeleton
    ac: 13
    toHit: 4
    hp:
      current: 13
      max: 13
    count: 3
    actions:
      - Shortsword
      - Shortbow

  - name: Zombie Crew
    type: npc
    statblock: Zombie
    ac: 8
    toHit: 3
    hp:
      current: 22
      max: 22
    count: 3
    actions:
      - name: Slam
        type: attack
        dmg: [{dice: "1d6+1", type: bludgeoning}]
      - name: Undead Fortitude
        type: ability
        effects:
          - type: tag
            name: Undead Fortitude
            on: self
            trigger: start_of_turn
            note: "At 0 HP (not radiant/crit), CON save DC 5+dmg. On success, drop to 1 HP."
            active_at_start: true

  - name: Sandstorm / Lair
    type: npc
    ac: 0
    hp:
      current: 999
      max: 999
    init: 20
    actions:
      - name: Sandstorm Damage
        type: attack
        verb: "batters"
        dmg: [{dice: "1d4", type: slashing}]
        note: "Exposed creatures without cover or protection."
      - name: Visibility
        type: reminder
        note: "Visibility limited to 30ft. Disadvantage on Perception checks relying on sight."
        effects:
          - type: tag
            name: Limited Visibility
            on: self
            trigger: start_of_turn
            note: "30ft visibility. Disadvantage on Perception (sight)."
            active_at_start: true
      - name: Sandstorm Fury
        type: attack
        verb: "blasts"
        dmg: [{dice: "3d6", type: bludgeoning}]
        note: "Lair action. 20ft radius, point within 120ft. DEX DC 15 for half."
      - name: Command Ship
        type: attack
        verb: "fires the Netherwave's weapons at"
        dmg: [{dice: "4d10", type: force}]
        note: "Lair action. Ship moves 30ft or fires at one target."
      - name: Necrotic Surge
        type: ability
        verb: "pulses necrotic energy through the ship"
        note: "Lair action. Each undead within 60ft of Rendmarrow regains 10 HP."
      - name: Lair Action
        type: ability
        effects:
          - type: tag
            name: Lair Action
            on: self
            trigger: start_of_turn
            note: "One lair action per round. Can't repeat same two rounds in a row."
            uses: 1
            resetOn: turn
            active_at_start: true
    behavior:
      notes: |
        Init 20: choose one lair action, then apply Sandstorm Damage to exposed creatures.
        Lair actions are chosen by Rendmarrow.
```
