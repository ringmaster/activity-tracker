// Compare derived fields between data/5e-SRD-Spells.json and the converted
// data/5e-SRD-PHB-Spells.json. Reports coverage and per-field disagreements
// for spells present in both (matched by case-insensitive name).
//
// Run: node scripts/validate-phb-vs-srd.mjs

import fs from "node:fs";

const ROOT = "/Users/ringmaster/Projects/activity-tracker";
const srd = JSON.parse(fs.readFileSync(`${ROOT}/data/5e-SRD-Spells.json`, "utf8"));
const phb = JSON.parse(fs.readFileSync(`${ROOT}/data/5e-SRD-PHB-Spells.json`, "utf8"));

const srdByName = new Map(srd.map((s) => [s.name.toLowerCase(), s]));
const overlap = phb.filter((p) => srdByName.has(p.name.toLowerCase()));

console.log(`SRD: ${srd.length} spells, PHB: ${phb.length} spells, overlap: ${overlap.length}`);

let dcSuccessAgree = 0,
  dcSuccessDisagree = 0,
  dcSuccessMissing = 0;
let aoeAgree = 0,
  aoeDisagree = 0,
  aoeMissingInPhb = 0,
  aoeMissingInSrd = 0;
let upcastAgree = 0,
  upcastDisagree = 0,
  upcastMissingInPhb = 0,
  upcastMissingInSrd = 0;
const disagreements = { dc_success: [], area_of_effect: [], damage_at_slot_level: [] };

for (const p of overlap) {
  const s = srdByName.get(p.name.toLowerCase());

  const sDc = s.dc?.dc_success;
  const pDc = p.dc?.dc_success;
  if (sDc !== undefined) {
    if (pDc === sDc) dcSuccessAgree++;
    else if (pDc === undefined) dcSuccessMissing++;
    else {
      dcSuccessDisagree++;
      disagreements.dc_success.push({ name: p.name, srd: sDc, phb: pDc });
    }
  }

  const sAoe = s.area_of_effect;
  const pAoe = p.area_of_effect;
  if (sAoe && pAoe) {
    if (sAoe.type === pAoe.type && sAoe.size === pAoe.size) aoeAgree++;
    else {
      aoeDisagree++;
      disagreements.area_of_effect.push({ name: p.name, srd: sAoe, phb: pAoe });
    }
  } else if (sAoe && !pAoe) aoeMissingInPhb++;
  else if (!sAoe && pAoe) aoeMissingInSrd++;

  const sUp = s.damage?.damage_at_slot_level;
  const pUp = p.damage?.damage_at_slot_level;
  if (sUp && pUp) {
    const sKeys = Object.keys(sUp).sort();
    const pKeys = Object.keys(pUp).sort();
    const sameKeys = sKeys.length === pKeys.length && sKeys.every((k, i) => k === pKeys[i]);
    const sameVals = sameKeys && sKeys.every((k) => sUp[k] === pUp[k]);
    if (sameVals) upcastAgree++;
    else {
      upcastDisagree++;
      if (disagreements.damage_at_slot_level.length < 10) {
        disagreements.damage_at_slot_level.push({ name: p.name, srd: sUp, phb: pUp });
      }
    }
  } else if (sUp && !pUp) upcastMissingInPhb++;
  else if (!sUp && pUp) upcastMissingInSrd++;
}

console.log("\ndc_success");
console.log(`  agree:    ${dcSuccessAgree}`);
console.log(`  disagree: ${dcSuccessDisagree}`);
console.log(`  missing in PHB output: ${dcSuccessMissing}`);
if (disagreements.dc_success.length) {
  console.log("  disagreements (first 10):");
  disagreements.dc_success.slice(0, 10).forEach((d) =>
    console.log(`    ${d.name}: SRD=${d.srd} PHB=${d.phb}`),
  );
}

console.log("\narea_of_effect");
console.log(`  agree:    ${aoeAgree}`);
console.log(`  disagree: ${aoeDisagree}`);
console.log(`  missing in PHB output: ${aoeMissingInPhb}`);
console.log(`  PHB has, SRD lacks: ${aoeMissingInSrd}`);
if (disagreements.area_of_effect.length) {
  console.log("  disagreements (first 10):");
  disagreements.area_of_effect.slice(0, 10).forEach((d) =>
    console.log(`    ${d.name}: SRD=${JSON.stringify(d.srd)} PHB=${JSON.stringify(d.phb)}`),
  );
}

console.log("\ndamage_at_slot_level (upcast tables)");
console.log(`  agree:    ${upcastAgree}`);
console.log(`  disagree: ${upcastDisagree}`);
console.log(`  missing in PHB output: ${upcastMissingInPhb}`);
console.log(`  PHB has, SRD lacks: ${upcastMissingInSrd}`);
if (disagreements.damage_at_slot_level.length) {
  console.log("  disagreements (first 10):");
  disagreements.damage_at_slot_level.forEach((d) =>
    console.log(`    ${d.name}: SRD=${JSON.stringify(d.srd)}\n      PHB=${JSON.stringify(d.phb)}`),
  );
}
