export type HireEvent = {
  applicationId: number;
  appliedAt: string;
  hiredAt: string | null;
  status: string;
  source: string | null;
};

export function timeToHireDays(events: HireEvent[]) {
  const hired = events.filter((event) => event.hiredAt);
  if (hired.length === 0) return null;
  const total = hired.reduce((sum, event) => sum + (Date.parse(event.hiredAt!) - Date.parse(event.appliedAt)) / 86_400_000, 0);
  return Math.round((total / hired.length) * 10) / 10;
}

export function dropOff(events: HireEvent[]) {
  const order = ["CV_POOL", "EXPERT_REVIEW", "TECH_EVALUATION", "SHORTLISTED", "HIRED", "REJECTED"];
  return order.map((status) => ({
    status,
    count: events.filter((event) => event.status === status).length,
  }));
}

export function sourceQuality(events: HireEvent[]) {
  const groups = new Map<string, { people: number; hired: number }>();
  for (const event of events) {
    const source = event.source ?? "unknown";
    const group = groups.get(source) ?? { people: 0, hired: 0 };
    group.people += 1;
    if (event.hiredAt || event.status === "HIRED") group.hired += 1;
    groups.set(source, group);
  }
  return [...groups.entries()]
    .map(([source, group]) => ({
      source,
      people: group.people,
      hired: group.hired,
      hireRate: group.people === 0 ? 0 : group.hired / group.people,
    }))
    .sort((left, right) => right.hireRate - left.hireRate || right.people - left.people);
}
