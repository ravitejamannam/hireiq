import { Prisma } from "@prisma/client";

/**
 * Bundle-safe Prisma error inspection.
 *
 * Why not `instanceof`: the app generates its client to lib/generated/prisma
 * while some modules import helpers from @prisma/client. Under bundling
 * (Turbopack) these can resolve as separate module copies, breaking
 * instanceof across them — which silently converted handled P2002/P2003
 * paths into unhandled 500s (observed on the identity-signal path).
 *
 * Matching by `error.code` is class-identity-independent and safe.
 */
export function getPrismaErrorCode(error: unknown): string | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string")
  ) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function isPrismaKnownRequestError(error: unknown): boolean {
  return getPrismaErrorCode(error) !== null;
}
