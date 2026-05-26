import type { CombatAction, AuthoredDamage } from "../types/encounter";

const ABILITY_ABBR: Record<string, string> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

/**
 * Parse one bestiary action description into a CombatAction. Graceful
 * degradation: whatever fields parse out get populated; the full description
 * is always stashed in `desc` so the DM sees the prose even when structured
 * extraction fails. Unparseable actions still surface in the via dropdown
 * with their text visible under the bar; the DM composes chits from the +
 * menu for the mechanical parts.
 */
export function parseStatblockAction(name: string, descRaw: string): CombatAction {
  const desc = (descRaw ?? "").trim();
  const action: CombatAction = { name, type: "attack" };
  if (desc) action.desc = desc;

  // Multiattack: surface as a turn reminder rather than an attack chit.
  // The plugin's multiattack handling already skips this in the via list.
  if (/^multi-?attack$/i.test(name)) {
    action.type = "multiattack";
    action.note = condense(desc);
    return action;
  }

  // Attack header + to-hit. Covers Melee/Ranged Weapon Attack and
  // Melee/Ranged Spell Attack (and the "Melee or Ranged" variant).
  const header = desc.match(
    /(Melee|Ranged|Melee or Ranged)\s+(Weapon|Spell)\s+Attack:\s*\+(\d+)\s+to\s+hit/i,
  );
  if (header) {
    action.toHit = parseInt(header[3], 10);
    if (header[2].toLowerCase() === "spell") {
      action.type = "spell";
    }
  }

  // Range / reach. Most specific match first so the dual-range form
  // doesn't get clobbered by the bare reach pattern.
  const dual = desc.match(/reach\s+(\d+)\s*ft\.\s*or\s+range\s+(\d+)\/(\d+)\s*ft\./i);
  const reach = desc.match(/reach\s+(\d+)\s*ft\./i);
  const ranged = desc.match(/range\s+(\d+)\/(\d+)\s*ft\./i);
  if (dual) {
    action.range = `${dual[1]} feet or ${dual[2]}/${dual[3]} feet`;
  } else if (reach) {
    action.range = `${reach[1]} feet`;
  } else if (ranged) {
    action.range = `${ranged[1]}/${ranged[2]} feet`;
  }

  // Damage components, scoped to a single hit so "or" alternatives don't
  // get double-counted. See collectDamagePairs() for the scoping rules.
  const dmg = collectDamagePairs(desc);
  if (dmg.length > 0) action.dmg = dmg;

  // Saving throw: "DC 14 Dexterity saving throw"
  const save = desc.match(
    /DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving\s+throw/i,
  );
  if (save) {
    const stat = ABILITY_ABBR[save[2].toLowerCase()];
    if (stat) action.save = { stat, dc: parseInt(save[1], 10) };
  }

  // Save outcome. Only meaningful when a save was parsed.
  if (action.save) {
    if (/half(?:\s+as\s+much)?\s+(?:damage\s+)?on\s+a\s+successful\s+(?:save|one)/i.test(desc)) {
      action.saveOnSuccess = "half";
    } else if (/on\s+a\s+successful\s+save/i.test(desc) || /successful\s+save/i.test(desc)) {
      action.saveOnSuccess = "none";
    }
  }

  // Concentration is uncommon in monster actions but exists (some lairs,
  // some legendary effects). Cheap to detect.
  if (/\bconcentrat(?:e|ion|ing)\b/i.test(desc)) {
    action.concentration = true;
  }

  return action;
}

/**
 * Pull "(NdM[+B]) type damage" pairs from a single hit.
 *
 * Anchors on "Hit:" and stops at the first sentence break or "or", so
 * alternative-mode statblocks ("7 (1d10+2) bludgeoning in melee, or 3
 * (1d4+2) at range") emit only the primary mode instead of additive
 * doubling. Combined-damage attacks ("8 slashing plus 7 fire") emit both.
 */
function collectDamagePairs(desc: string): AuthoredDamage[] {
  const hitMatch = desc.match(/Hit:\s*([^.]*\.)/i);
  const scope = hitMatch ? hitMatch[1].split(/\bor\b/i)[0] : desc;
  const re = /\(\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\)\s*(\w+)\s+damage/gi;
  const out: AuthoredDamage[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) {
    out.push({
      dice: m[1].replace(/\s+/g, ""),
      type: m[2].toLowerCase(),
    });
  }
  return out;
}

function condense(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
