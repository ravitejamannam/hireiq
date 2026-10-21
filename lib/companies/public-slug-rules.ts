const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 64;

export function isValidPublicSlug(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_RE.test(value)
  );
}
