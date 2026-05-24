// Convert 5etools-format spell JSON (TCE/XGE) into:
//   1. samples/<book>-library.yaml -- plugin-loadable YAML library
//   2. data/5e-SRD-<BOOK>-Spells.json -- archived in the 5e-bits-API shape
//
// Run: node scripts/convert-5etools-spells.mjs

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const SCHOOL = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
  V: "Evocation",
};

const SAVE_ABBR = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

const ATK_KIND = {
  mw: "Melee Weapon Attack:",
  rw: "Ranged Weapon Attack:",
  ms: "Melee Spell Attack:",
  rs: "Ranged Spell Attack:",
};

const AREA_TAG_SHAPE = {
  S: "sphere",
  N: "cone",
  C: "cube",
  L: "line",
  Y: "cylinder",
  H: "hemisphere",
};

const ABILITY_NAMES = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
];

const ABILITY_DOWNCASE_RE = new RegExp(
  `\\b(${ABILITY_NAMES.join("|")})\\b(?=\\s+(?:saving|check|score|ability|modifier))`,
  "g",
);

function lowerAbilityInContext(text) {
  return text.replace(ABILITY_DOWNCASE_RE, (m) => m.toLowerCase());
}

function stripTags(input) {
  return input.replace(/\{@(\w+)(?:\s+([^}]*))?\}/g, (_m, tag, raw) => {
    const body = raw ?? "";
    const parts = body.split("|");
    switch (tag) {
      case "h":
        return "Hit: ";
      case "atk":
        return ATK_KIND[body] ?? body;
      case "chance":
        return `${parts[0]} percent`;
      case "recharge":
        return body ? `(Recharge ${body}-6)` : "(Recharge 6)";
      case "damage":
      case "dice":
      case "d20":
      case "hit":
        return parts[0] ?? "";
      case "scaledice":
      case "scaledamage":
        return parts[2] ?? parts[0] ?? "";
      default:
        return parts[0] ?? "";
    }
  });
}

function entriesToParagraphs(entries) {
  const out = [];
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    if (typeof entry === "string") {
      out.push(stripTags(entry));
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    if (entry.type === "entries" && Array.isArray(entry.entries)) {
      const child = entriesToParagraphs(entry.entries);
      if (entry.name) {
        const head = `***${entry.name}.*** `;
        if (child.length) {
          child[0] = head + child[0];
          out.push(...child);
        } else {
          out.push(head.trim());
        }
      } else {
        out.push(...child);
      }
      continue;
    }

    if (entry.type === "list" && Array.isArray(entry.items)) {
      for (const item of entry.items) {
        if (typeof item === "string") {
          out.push("- " + stripTags(item));
        } else if (item && item.type === "item") {
          const sub = entriesToParagraphs(item.entries ?? []);
          const head = item.name ? `**${item.name}.** ` : "";
          out.push("- " + head + sub.join(" "));
        }
      }
      continue;
    }

    if (entry.type === "table") {
      if (entry.caption) out.push(`[Table: ${entry.caption}]`);
      else out.push("[Table omitted]");
      continue;
    }

    if (entry.type === "inset" || entry.type === "insetReadaloud") {
      const child = entriesToParagraphs(entry.entries ?? []);
      out.push(...child);
      continue;
    }

    if (entry.type === "quote" && Array.isArray(entry.entries)) {
      out.push(...entriesToParagraphs(entry.entries));
      continue;
    }
  }

  return out.map((s) => lowerAbilityInContext(s.trim())).filter(Boolean);
}

function formatTime(time) {
  if (!Array.isArray(time)) return undefined;
  return time
    .map((t) => {
      const rawUnit = t.unit === "bonus" ? "bonus action" : t.unit;
      const unit = t.number === 1 ? rawUnit : `${rawUnit}s`;
      const base = `${t.number} ${unit}`;
      return t.condition ? `${base}, ${t.condition}` : base;
    })
    .join(" or ");
}

function formatRange(range) {
  if (!range) return undefined;
  if (range.type === "special") return "Special";
  const d = range.distance ?? {};
  if (d.type === "self") return "Self";
  if (d.type === "touch") return "Touch";
  if (d.type === "sight") return "Sight";
  if (d.type === "unlimited") return "Unlimited";
  if (d.type === "feet" || d.type === "miles") {
    const unit = d.type === "feet" ? "feet" : "miles";
    if (range.type === "point") return `${d.amount} ${unit}`;
    const shape = range.type; // radius, cone, line, cube, sphere, hemisphere
    return `Self (${d.amount}-${d.type === "feet" ? "foot" : "mile"} ${shape})`;
  }
  return undefined;
}

function formatDuration(duration) {
  if (!Array.isArray(duration) || duration.length === 0) return "Instantaneous";
  const d = duration[0];
  switch (d.type) {
    case "instant":
      return "Instantaneous";
    case "permanent":
      return "Until dispelled";
    case "special":
      return "Special";
    case "timed": {
      const amount = d.duration?.amount ?? 1;
      const baseUnit = d.duration?.type ?? "round";
      const unit = amount === 1 ? baseUnit : `${baseUnit}s`;
      const base = `${amount} ${unit}`;
      return d.concentration ? `Up to ${base}` : base;
    }
    default:
      return "Instantaneous";
  }
}

function componentsArray(components) {
  const arr = [];
  if (components?.v) arr.push("V");
  if (components?.s) arr.push("S");
  if (components?.m) arr.push("M");
  return arr;
}

function materialText(components) {
  if (!components?.m) return undefined;
  if (typeof components.m === "string") return components.m;
  if (typeof components.m === "object" && components.m.text) return components.m.text;
  return undefined;
}

function isConcentration(duration) {
  return !!(Array.isArray(duration) && duration[0]?.concentration);
}

function extractFirstDamageDice(entries) {
  const text = JSON.stringify(entries ?? []);
  const m = text.match(/\{@damage\s+([^}|]+)/);
  return m ? m[1].trim() : undefined;
}

function indexify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeMaterial(text) {
  if (!text) return text;
  let s = text.trim();
  if (!s) return undefined;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += ".";
  return s;
}

function extractDcSuccess(spell) {
  if (!spell.savingThrow?.[0]) return undefined;
  const text = entriesToParagraphs(spell.entries ?? []).join(" ");
  if (/\bhalf\b[^.]{0,80}success/i.test(text)) return "half";
  if (/success[^.]{0,40}\bhalf\b/i.test(text)) return "half";
  if (/\btakes?\s+half(\s+as\s+much)?\s+damage\b/i.test(text)) return "half";
  return "none";
}

function extractAreaOfEffect(spell) {
  if (spell.range && spell.range.distance?.type === "feet") {
    const shape = spell.range.type;
    if (["sphere", "cone", "cube", "line", "cylinder", "hemisphere"].includes(shape)) {
      return { type: shape, size: spell.range.distance.amount };
    }
    if (shape === "radius") {
      return { type: "sphere", size: spell.range.distance.amount };
    }
  }
  const tags = Array.isArray(spell.areaTags) ? spell.areaTags : [];
  if (!tags.length) return undefined;
  const text = entriesToParagraphs(spell.entries ?? []).join(" ");
  for (const tag of tags) {
    const shape = AREA_TAG_SHAPE[tag];
    if (!shape) continue;
    const specific = new RegExp(
      `(\\d+)[-\\s]foot(?:[-\\s](?:radius|wide|long|tall|high|thick))?\\s+${shape}`,
      "i",
    );
    const m = text.match(specific);
    if (m) return { type: shape, size: parseInt(m[1], 10) };
  }
  for (const tag of tags) {
    const shape = AREA_TAG_SHAPE[tag];
    if (!shape) continue;
    const generic = text.match(/(\d+)[-\s]foot/);
    if (generic) return { type: shape, size: parseInt(generic[1], 10) };
  }
  return undefined;
}

function parseDice(s) {
  const m = s.match(/^(\d+)d(\d+)/);
  if (!m) return undefined;
  return { count: parseInt(m[1], 10), faces: parseInt(m[2], 10) };
}

function projectUpcastDamage(spell, baseDice) {
  if (!baseDice || !Array.isArray(spell.entriesHigherLevel)) return undefined;
  const baseLevel = spell.level ?? 0;
  if (baseLevel < 1) return undefined;
  const base = parseDice(baseDice);
  if (!base) return undefined;

  const merged = [];
  for (const block of spell.entriesHigherLevel) {
    if (Array.isArray(block.entries)) merged.push(...block.entries);
  }
  const text = entriesToParagraphs(merged).join(" ");

  const everyN = text.match(
    /increases?\s+by\s+(\d+)d(\d+)[^.]{0,150}?for\s+every\s+(two|three|four)\s+(?:spell\s+)?(?:slot\s+)?levels?\s+above\s+(\d+)/i,
  );
  if (everyN) {
    const extraCount = parseInt(everyN[1], 10);
    const extraFaces = parseInt(everyN[2], 10);
    const stride = { two: 2, three: 3, four: 4 }[everyN[3].toLowerCase()];
    const refLevel = parseInt(everyN[4], 10);
    if (extraFaces === base.faces && stride) {
      const result = {};
      for (let slot = baseLevel; slot <= 9; slot += stride) {
        const stepsAbove = Math.floor((slot - refLevel) / stride);
        const total = base.count + extraCount * Math.max(0, stepsAbove);
        result[String(slot)] = `${total}d${base.faces}`;
      }
      return result;
    }
  }

  const m = text.match(
    /increases?\s+by\s+(\d+)d(\d+)[^.]{0,150}?for\s+each\s+(?:spell\s+)?(?:slot\s+)?level\s+above\s+(\d+)/i,
  );
  if (!m) return undefined;

  const extraCount = parseInt(m[1], 10);
  const extraFaces = parseInt(m[2], 10);
  const refLevel = parseInt(m[3], 10);
  if (extraFaces !== base.faces) return undefined;

  const result = {};
  for (let slot = baseLevel; slot <= 9; slot++) {
    const levelsAbove = Math.max(0, slot - refLevel);
    const total = base.count + extraCount * levelsAbove;
    result[String(slot)] = `${total}d${base.faces}`;
  }
  return result;
}

function projectCantripDamage(spell, baseDice) {
  if (!baseDice || (spell.level ?? 0) !== 0) return undefined;
  const text = entriesToParagraphs(spell.entries ?? []).join(" ");
  const result = { 1: baseDice };
  const re = /(\d+)(?:st|nd|rd|th)\s+level\s*\((\d+d\d+)\)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    result[m[1]] = m[2];
  }
  return Object.keys(result).length > 1 ? result : undefined;
}

function formatAreaOfEffectYaml(aoe) {
  if (!aoe) return undefined;
  return `${aoe.size}ft ${aoe.type}`;
}

function toYamlSpell(s) {
  const out = {};
  out.name = s.name;
  out.level = s.level;
  if (SCHOOL[s.school]) out.school = SCHOOL[s.school];
  const ct = formatTime(s.time);
  if (ct) out.casting_time = ct;
  out.duration = formatDuration(s.duration);
  const comps = componentsArray(s.components);
  if (comps.length) out.components = comps.join(", ");
  const desc = entriesToParagraphs(s.entries).join("\n\n");
  if (desc) out.desc = desc;
  if (Array.isArray(s.entriesHigherLevel)) {
    const merged = [];
    for (const block of s.entriesHigherLevel) {
      if (Array.isArray(block.entries)) merged.push(...block.entries);
    }
    const h = entriesToParagraphs(merged).join("\n\n");
    if (h) out.higher_level = h;
  }
  const mat = normalizeMaterial(materialText(s.components));
  if (mat) out.material = mat;
  const range = formatRange(s.range);
  if (range) out.range = range;
  const aoeStr = formatAreaOfEffectYaml(extractAreaOfEffect(s));
  if (aoeStr) out.areaOfEffect = aoeStr;
  if (s.meta?.ritual) out.ritual = true;
  if (isConcentration(s.duration)) out.concentration = true;
  if (s.damageInflict?.[0]) out.damageType = s.damageInflict[0];
  const dice = extractFirstDamageDice(s.entries);
  if (dice) out.dice = dice;
  if (s.savingThrow?.[0] && SAVE_ABBR[s.savingThrow[0]]) {
    out.saveStat = SAVE_ABBR[s.savingThrow[0]];
    const dcSuccess = extractDcSuccess(s);
    if (dcSuccess) out.saveOnSuccess = dcSuccess;
  }
  return out;
}

function toJsonSpell(s) {
  const out = {};
  out.index = indexify(s.name);
  out.name = s.name;
  out.desc = entriesToParagraphs(s.entries);
  if (Array.isArray(s.entriesHigherLevel)) {
    const merged = [];
    for (const block of s.entriesHigherLevel) {
      if (Array.isArray(block.entries)) merged.push(...block.entries);
    }
    const h = entriesToParagraphs(merged);
    if (h.length) out.higher_level = h;
  }
  const range = formatRange(s.range);
  if (range) out.range = range;
  out.components = componentsArray(s.components);
  const mat = normalizeMaterial(materialText(s.components));
  if (mat) out.material = mat;
  out.ritual = !!s.meta?.ritual;
  out.duration = formatDuration(s.duration);
  out.concentration = isConcentration(s.duration);
  const ct = formatTime(s.time);
  if (ct) out.casting_time = ct;
  out.level = s.level;
  if (s.spellAttack?.[0]) {
    out.attack_type = s.spellAttack[0] === "M" ? "melee" : "ranged";
  }
  if (s.damageInflict?.[0]) {
    const dt = s.damageInflict[0];
    out.damage = {
      damage_type: {
        index: dt.toLowerCase(),
        name: dt.charAt(0).toUpperCase() + dt.slice(1),
        url: `/api/2014/damage-types/${dt.toLowerCase()}`,
      },
    };
    const dice = extractFirstDamageDice(s.entries);
    if (dice) {
      if ((s.level ?? 0) === 0) {
        const cantrip = projectCantripDamage(s, dice);
        out.damage.damage_at_character_level = cantrip ?? { "1": dice };
      } else {
        const upcast = projectUpcastDamage(s, dice);
        out.damage.damage_at_slot_level = upcast ?? { [String(s.level)]: dice };
      }
    }
  }
  const aoe = extractAreaOfEffect(s);
  if (aoe) out.area_of_effect = aoe;
  if (s.savingThrow?.[0] && SAVE_ABBR[s.savingThrow[0]]) {
    const abbr = SAVE_ABBR[s.savingThrow[0]];
    out.dc = {
      dc_type: {
        index: abbr,
        name: abbr.toUpperCase(),
        url: `/api/2014/ability-scores/${abbr}`,
      },
    };
    const dcSuccess = extractDcSuccess(s);
    if (dcSuccess) out.dc.dc_success = dcSuccess;
  }
  if (SCHOOL[s.school]) {
    const schoolName = SCHOOL[s.school];
    out.school = {
      index: schoolName.toLowerCase(),
      name: schoolName,
      url: `/api/2014/magic-schools/${schoolName.toLowerCase()}`,
    };
  }
  out.url = `/api/2014/spells/${out.index}`;
  return out;
}

function convert(sourcePath, yamlOutPath, jsonOutPath, label) {
  const raw = fs.readFileSync(sourcePath, "utf8");
  const data = JSON.parse(raw);
  const spells = (data.spell ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const yamlPayload = { spells: spells.map(toYamlSpell) };
  const yamlText = yaml.dump(yamlPayload, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
  });
  fs.writeFileSync(yamlOutPath, yamlText);

  const jsonPayload = spells.map(toJsonSpell);
  fs.writeFileSync(jsonOutPath, JSON.stringify(jsonPayload, null, 2) + "\n");

  console.log(
    `${label}: ${spells.length} spells -> ${path.basename(yamlOutPath)}, ${path.basename(jsonOutPath)}`,
  );
}

const SOURCES = "/Users/ringmaster/Obsidian/Owen/Projects/D&D Adventures/Samples";
const ROOT = "/Users/ringmaster/Projects/activity-tracker";

convert(
  `${SOURCES}/spells-tce.json`,
  `${ROOT}/samples/tce-library.yaml`,
  `${ROOT}/data/5e-SRD-TCE-Spells.json`,
  "TCE",
);
convert(
  `${SOURCES}/spells-xge.json`,
  `${ROOT}/samples/xge-library.yaml`,
  `${ROOT}/data/5e-SRD-XGE-Spells.json`,
  "XGE",
);
convert(
  `${SOURCES}/spells-phb.json`,
  `${ROOT}/samples/phb-library.yaml`,
  `${ROOT}/data/5e-SRD-PHB-Spells.json`,
  "PHB",
);
