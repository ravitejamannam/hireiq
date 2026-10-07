export const M11_NOT_FOUND = "M11_NOT_FOUND";
export const M11_TENANT_MISMATCH = "M11_TENANT_MISMATCH";
export const M11_BASELINE_INCOMPATIBLE = "M11_BASELINE_INCOMPATIBLE";

export class M11RerankError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "M11RerankError";
    this.code = code;
  }
}
