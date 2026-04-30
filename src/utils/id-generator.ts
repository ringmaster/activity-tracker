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
 */
export function expandCombatants<
  T extends { name: string; id?: string; count?: number },
>(authored: T[]): (Omit<T, "count"> & { id: string; name: string })[] {
  let counter = 0;
  const result: (Omit<T, "count"> & { id: string; name: string })[] = [];

  for (const entry of authored) {
    const count = entry.count ?? 1;
    const isUnique = count === 1 && !entry.count;

    if (isUnique) {
      const { count: _, ...rest } = entry;
      result.push({
        ...rest,
        id: entry.id ?? toSlug(entry.name),
        name: entry.name,
      });
    } else {
      const slug = toSlug(entry.name);
      for (let i = 0; i < count; i++) {
        counter++;
        const { count: _, ...rest } = entry;
        result.push({
          ...rest,
          id: `${slug}-${counter}`,
          name: `${entry.name} ${counter}`,
        });
      }
    }
  }

  return result;
}
