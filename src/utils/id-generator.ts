/** Convert a name to a kebab-case slug. */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Expand combatants with `count` into individual entries.
 * Non-unique NPCs get a running counter across ALL non-unique NPCs
 * (matching physical status rings at the table).
 *
 * Unique combatants (no `count` or `count: 1`) get a plain slug ID.
 *
 * If two unique combatants would derive the same slug ID (same name, neither
 * with an explicit `id:`), later ones get a `-2`, `-3`, ... suffix so they
 * never collide.
 */
export function expandCombatants<
  T extends { name: string; id?: string; count?: number },
>(authored: T[]): (Omit<T, "count"> & { id: string; name: string })[] {
  let counter = 0;
  const result: (Omit<T, "count"> & { id: string; name: string })[] = [];
  const usedIds = new Set<string>();

  function reserve(base: string): string {
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    let n = 2;
    while (usedIds.has(`${base}-${n}`)) n++;
    const id = `${base}-${n}`;
    usedIds.add(id);
    return id;
  }

  for (const entry of authored) {
    const count = entry.count ?? 1;
    const isUnique = count === 1 && !entry.count;

    if (isUnique) {
      const { count: _, ...rest } = entry;
      const desired = entry.id ?? toSlug(entry.name);
      result.push({
        ...rest,
        id: reserve(desired),
        name: entry.name,
      });
    } else {
      const slug = toSlug(entry.name);
      for (let i = 0; i < count; i++) {
        counter++;
        const { count: _, ...rest } = entry;
        result.push({
          ...rest,
          id: reserve(`${slug}-${counter}`),
          name: `${entry.name} ${counter}`,
        });
      }
    }
  }

  return result;
}
