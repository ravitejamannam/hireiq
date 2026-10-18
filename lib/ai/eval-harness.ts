export type PinnedMetric = {
  name: string;
  minimum: number;
  actual: number;
};

export function assertPinnedMetrics(metrics: PinnedMetric[]) {
  const failures = metrics.filter((metric) => metric.actual < metric.minimum);
  if (failures.length > 0) {
    const detail = failures
      .map((metric) => `${metric.name} ${metric.actual} < ${metric.minimum}`)
      .join("; ");
    throw new Error(`Pinned metric regression: ${detail}`);
  }
}
