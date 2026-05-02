import { MarkdownRenderer } from "obsidian";

const HIGHLIGHT_WORDS = new Set([
  "str", "strength",
  "dex", "dexterity",
  "con", "constitution",
  "int", "intelligence",
  "wis", "wisdom",
  "cha", "charisma",
  "ac", "hp",
  "dc",
]);

/**
 * Render a spell/action description into an element with markdown rendering,
 * number highlighting, and attribute name highlighting.
 */
export function renderSpellDescription(el: HTMLElement, desc: string): void {
  el.innerHTML = "";
  MarkdownRenderer.renderMarkdown(desc, el, "", null as any);

  // Post-process: highlight numbers and attribute names
  requestAnimationFrame(() => highlightContent(el));
}

function highlightContent(el: HTMLElement) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const replacements: { node: Text; html: string }[] = [];
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    if (!text.trim()) continue;

    // Match words containing digits OR whole words that are attribute names
    const html = text.replace(/\b(\S+)\b/g, (match) => {
      // Numbers: any token containing a digit (e.g., "2d6", "30", "DC15", "1d4+3")
      if (/\d/.test(match)) {
        return `<span class="dnd-numeric">${match}</span>`;
      }
      // Attribute names (case-insensitive)
      if (HIGHLIGHT_WORDS.has(match.toLowerCase())) {
        return `<span class="dnd-numeric">${match}</span>`;
      }
      return match;
    });

    if (html !== text) {
      replacements.push({ node, html });
    }
  }

  for (const { node, html } of replacements) {
    const span = document.createElement("span");
    span.innerHTML = html;
    node.parentNode?.replaceChild(span, node);
  }
}
