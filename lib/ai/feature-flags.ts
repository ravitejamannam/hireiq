export type FeatureFlag = { feature: string; enabled: boolean };

/** Flags are read on each call. There is no cache TTL. */
export function isFeatureEnabled(flags: FeatureFlag[], feature: string) {
  return flags.some((flag) => flag.feature === feature && flag.enabled);
}

/** Evidence matching stays off until a measured name-swap flip rate is under this. */
export const NAME_SWAP_FLIP_THRESHOLD = 0.05;

export function evidenceFlagMayDefaultOn(flipRate: number) {
  return flipRate < NAME_SWAP_FLIP_THRESHOLD;
}
