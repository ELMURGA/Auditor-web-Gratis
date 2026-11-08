// Lee robots.txt por grupos (como Google): usa el grupo de Googlebot si existe, si no el de "*".
// El sitio está bloqueado solo si ese grupo tiene "Disallow: /" sin un "Allow" que lo abra.
export function robotsBlocksGoogle(txt: string): boolean {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "allow" || key === "disallow")) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  const pick = groups.filter((g) => g.agents.some((a) => a === "googlebot"));
  const target = pick.length ? pick : groups.filter((g) => g.agents.includes("*"));
  const rules = target.flatMap((g) => g.rules);
  const blocked = rules.some((r) => !r.allow && r.path === "/");
  const reopened = rules.some((r) => r.allow && (r.path === "/" || r.path === "/$" || r.path === "/*"));
  return blocked && !reopened;
}
