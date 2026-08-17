import {
  DistributionProvider,
  Prisma,
  ProviderConnectionStatus,
} from "@prisma/client";

import {
  encryptCredentialSecret,
  CredentialEncryptionError,
} from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/prisma";
import {
  JobDistributionError,
  validateCredentialSecret,
  validateDistributionProvider,
  validateOptionalAccountId,
} from "@/lib/validation/job-distribution-validation";
import { providerRequiresActiveConnection } from "@/lib/jobs/distribution/registry";

export type SafeProviderConnection = {
  id: number;
  companyId: number;
  provider: DistributionProvider;
  status: ProviderConnectionStatus;
  providerAccountId: string | null;
  hasCredential: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const connectionSelect = {
  id: true,
  companyId: true,
  provider: true,
  status: true,
  providerAccountId: true,
  credentialCiphertext: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProviderConnectionSelect;

function toSafeConnection(
  row: Prisma.ProviderConnectionGetPayload<{ select: typeof connectionSelect }>,
): SafeProviderConnection {
  return {
    id: row.id,
    companyId: row.companyId,
    provider: row.provider,
    status: row.status,
    providerAccountId: row.providerAccountId,
    hasCredential: Boolean(row.credentialCiphertext),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProviderConnectionsForCompany(companyId: number) {
  const rows = await prisma.providerConnection.findMany({
    where: { companyId },
    select: connectionSelect,
    orderBy: { provider: "asc" },
  });

  return rows.map(toSafeConnection);
}

export async function upsertProviderConnectionForCompany(input: {
  companyId: number;
  provider: unknown;
  providerAccountId?: unknown;
  credential?: unknown;
}) {
  const provider = validateDistributionProvider(input.provider);
  const providerAccountId = validateOptionalAccountId(input.providerAccountId);

  let credentialCiphertext: string | null = null;
  if (providerRequiresActiveConnection(provider)) {
    const secret = validateCredentialSecret(input.credential);
    try {
      credentialCiphertext = encryptCredentialSecret(secret);
    } catch (error) {
      if (error instanceof CredentialEncryptionError) {
        throw new JobDistributionError(error.message);
      }
      throw error;
    }
  } else if (typeof input.credential === "string" && input.credential.trim()) {
    try {
      credentialCiphertext = encryptCredentialSecret(input.credential.trim());
    } catch (error) {
      if (error instanceof CredentialEncryptionError) {
        throw new JobDistributionError(error.message);
      }
      throw error;
    }
  }

  const row = await prisma.providerConnection.upsert({
    where: {
      companyId_provider: {
        companyId: input.companyId,
        provider,
      },
    },
    create: {
      companyId: input.companyId,
      provider,
      status: ProviderConnectionStatus.ACTIVE,
      providerAccountId,
      credentialCiphertext,
    },
    update: {
      status: ProviderConnectionStatus.ACTIVE,
      providerAccountId,
      ...(credentialCiphertext
        ? { credentialCiphertext }
        : providerRequiresActiveConnection(provider)
          ? { credentialCiphertext }
          : {}),
    },
    select: connectionSelect,
  });

  return toSafeConnection(row);
}

export async function disconnectProviderConnectionForCompany(input: {
  companyId: number;
  provider: unknown;
}) {
  const provider = validateDistributionProvider(input.provider);

  const existing = await prisma.providerConnection.findUnique({
    where: {
      companyId_provider: {
        companyId: input.companyId,
        provider,
      },
    },
    select: { id: true },
  });

  if (!existing) {
    throw new JobDistributionError("Provider connection not found.");
  }

  const row = await prisma.providerConnection.update({
    where: { id: existing.id },
    data: {
      status: ProviderConnectionStatus.INACTIVE,
      credentialCiphertext: null,
    },
    select: connectionSelect,
  });

  return toSafeConnection(row);
}

export async function loadActiveConnection(input: {
  companyId: number;
  provider: DistributionProvider;
}) {
  const row = await prisma.providerConnection.findUnique({
    where: {
      companyId_provider: {
        companyId: input.companyId,
        provider: input.provider,
      },
    },
    select: connectionSelect,
  });

  if (!row || row.status !== ProviderConnectionStatus.ACTIVE) {
    return null;
  }

  return toSafeConnection(row);
}
