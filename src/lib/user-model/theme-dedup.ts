const THEME_GROUPS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Business ownership", patterns: [/business|startup|saas|scalable business|build a business|entrepreneur/i] },
  { label: "Financial freedom", patterns: [/financial freedom|wealth|financial independence|freedom early|passive income/i] },
  { label: "Real estate", patterns: [/real estate|property invest|realtor|rental yield/i] },
  { label: "Fitness", patterns: [/body fat|fat loss|fitness|workout|lose \d|weight loss/i] },
  { label: "Learning", patterns: [/learn|study|exam|certification|upsc|course/i] },
  { label: "Career", patterns: [/career|job search|interview|promotion|salary/i] },
];

/** Collapse redundant goal titles into human-readable themes. */
export function dedupeSemanticThemes(titles: string[]): string[] {
  const cleaned = titles.map((t) => t.trim()).filter((t) => t.length > 2);
  const found = new Set<string>();

  for (const group of THEME_GROUPS) {
    if (cleaned.some((t) => group.patterns.some((p) => p.test(t)))) {
      found.add(group.label);
    }
  }

  for (const t of cleaned) {
    const alreadyCovered = [...found].some((label) => {
      const group = THEME_GROUPS.find((g) => g.label === label);
      return group?.patterns.some((p) => p.test(t));
    });
    if (!alreadyCovered && t.length < 60) {
      found.add(t);
    }
  }

  return [...found];
}

export function matchGoalToTheme(goalTitle: string, theme: string): boolean {
  const group = THEME_GROUPS.find((g) => g.label === theme);
  if (group) return group.patterns.some((p) => p.test(goalTitle));
  return goalTitle.trim() === theme;
}

export function groupGoalsByTheme<T extends { id: string; title: string }>(
  goals: T[]
): Array<{ theme: string; goals: T[] }> {
  const themes = dedupeSemanticThemes(goals.map((g) => g.title));
  return themes.map((theme) => ({
    theme,
    goals: goals.filter((g) => matchGoalToTheme(g.title, theme)),
  }));
}
