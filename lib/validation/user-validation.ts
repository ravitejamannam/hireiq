import { PortalRole } from "@prisma/client";

import {
  isPlausibleIdentityEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/email-normalization";
import { prisma } from "@/lib/prisma";

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserValidationError";
  }
}

export type UserAccountInput = {
  name: unknown;
  email: unknown;
  role: unknown;
  companyId?: unknown;
  interviewerId?: unknown;
};

export type ValidatedUserAccountInput = {
  name: string;
  email: string;
  role: PortalRole;
  companyId: number | null;
  interviewerId: number | null;
};

export function validateUserId(id: unknown) {
  if (
    typeof id !== "number" ||
    !Number.isFinite(id) ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new UserValidationError("User ID must be a positive integer.");
  }

  return id;
}

function validateName(name: unknown) {
  if (typeof name !== "string" || !name.trim()) {
    throw new UserValidationError("Name is required.");
  }

  return name.trim();
}

function validateEmail(email: unknown) {
  if (typeof email !== "string" || !email.trim()) {
    throw new UserValidationError("Email is required.");
  }

  const normalized = normalizeIdentityEmail(email);

  if (!isPlausibleIdentityEmail(normalized)) {
    throw new UserValidationError("Email is invalid.");
  }

  return normalized;
}

export type LoginCredentialsInput = {
  email: unknown;
  password: unknown;
};

export type ValidatedLoginCredentials = {
  email: string;
  password: string;
};

const MIN_PASSWORD_LENGTH = 8;

export function validateLoginCredentials(
  input: LoginCredentialsInput,
): ValidatedLoginCredentials {
  const email = validateEmail(input.email);

  if (typeof input.password !== "string" || !input.password) {
    throw new UserValidationError("Invalid email or password.");
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new UserValidationError("Invalid email or password.");
  }

  return {
    email,
    password: input.password,
  };
}

export function validateBootstrapPassword(password: unknown) {
  if (typeof password !== "string" || !password) {
    throw new UserValidationError("Password is required.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UserValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  return password;
}

function validatePortalRole(role: unknown) {
  if (
    typeof role !== "string" ||
    !Object.values(PortalRole).includes(role as PortalRole)
  ) {
    throw new UserValidationError("Portal role is invalid.");
  }

  return role as PortalRole;
}

function validateOptionalPositiveInteger(
  value: unknown,
  message: string,
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new UserValidationError(message);
  }

  return value;
}

export async function validateUserAccountInput(
  input: UserAccountInput,
): Promise<ValidatedUserAccountInput> {
  const name = validateName(input.name);
  const email = validateEmail(input.email);
  const role = validatePortalRole(input.role);
  const companyId = validateOptionalPositiveInteger(
    input.companyId,
    "Company ID must be a positive integer.",
  );
  const interviewerId = validateOptionalPositiveInteger(
    input.interviewerId,
    "Interviewer ID must be a positive integer.",
  );

  if (role === PortalRole.ADMIN) {
    if (companyId !== null || interviewerId !== null) {
      throw new UserValidationError(
        "Admin accounts cannot be linked to a company or interviewer.",
      );
    }

    return {
      name,
      email,
      role,
      companyId: null,
      interviewerId: null,
    };
  }

  if (role === PortalRole.CLIENT) {
    if (companyId === null) {
      throw new UserValidationError("Client accounts require a company.");
    }

    if (interviewerId !== null) {
      throw new UserValidationError(
        "Client accounts cannot be linked to an interviewer.",
      );
    }

    await ensureCompanyExists(companyId);

    return {
      name,
      email,
      role,
      companyId,
      interviewerId: null,
    };
  }

  // INTERVIEWER
  if (interviewerId === null) {
    throw new UserValidationError(
      "Interviewer accounts require an interviewer profile.",
    );
  }

  if (companyId !== null) {
    throw new UserValidationError(
      "Interviewer accounts cannot be linked directly to a company.",
    );
  }

  await ensureInterviewerExists(interviewerId);

  return {
    name,
    email,
    role,
    companyId: null,
    interviewerId,
  };
}

export async function ensureUserExists(id: number) {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new UserValidationError("User not found.");
  }

  return user;
}

async function ensureCompanyExists(id: number) {
  const company = await prisma.company.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!company) {
    throw new UserValidationError("Company not found.");
  }

  return company;
}

async function ensureInterviewerExists(id: number) {
  const interviewer = await prisma.interviewer.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!interviewer) {
    throw new UserValidationError("Interviewer not found.");
  }

  return interviewer;
}
