import { DistributionProvider } from "@prisma/client";

import type { JobDistributionProviderAdapter } from "@/lib/jobs/distribution/adapter";
import { ManualProvider } from "@/lib/jobs/distribution/manual-provider";
import { UnavailableProvider } from "@/lib/jobs/distribution/unavailable-provider";

const adapters: Record<DistributionProvider, JobDistributionProviderAdapter> = {
  LINKEDIN: new UnavailableProvider(DistributionProvider.LINKEDIN),
  INDEED: new UnavailableProvider(DistributionProvider.INDEED),
  NAUKRI: new UnavailableProvider(DistributionProvider.NAUKRI),
  MANUAL: new ManualProvider(),
};

let adapterOverride: Partial<
  Record<DistributionProvider, JobDistributionProviderAdapter>
> = {};

export function getDistributionAdapter(
  provider: DistributionProvider,
): JobDistributionProviderAdapter {
  return adapterOverride[provider] ?? adapters[provider];
}

export function setDistributionAdapterForTests(
  provider: DistributionProvider,
  adapter: JobDistributionProviderAdapter | null,
) {
  if (adapter) {
    adapterOverride[provider] = adapter;
    return;
  }

  delete adapterOverride[provider];
}

export function resetDistributionAdaptersForTests() {
  adapterOverride = {};
}

export function providerRequiresActiveConnection(
  provider: DistributionProvider,
) {
  return provider !== DistributionProvider.MANUAL;
}
