"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { requireAdmin, requireUser } from "@/lib/auth/authorization";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForIp,
  rateLimitKeyForUser,
} from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { InterviewerInvitationError } from "@/lib/interviewers/interviewer-invitation-errors";
import {
  acceptInterviewerInvitationAndCreateLogin,
  acceptInterviewerInvitationForExistingUser,
  createInterviewerWithInvite,
  resendInterviewerInvitation,
  revokeInterviewerInvitation,
} from "@/lib/interviewers/interviewer-invitation-service";
import { prisma } from "@/lib/prisma";
import {
  ensureInterviewerExists,
  InterviewerValidationError,
  validateInterviewerId,
  validateInterviewerInput,
} from "@/lib/validation/interviewer-validation";
import { UserValidationError } from "@/lib/validation/user-validation";
import type {
  InterviewerAvailability,
  InterviewerCategory,
} from "@prisma/client";

export type { InterviewerLoginStatus } from "@/lib/interviewers/interviewer-invitation-errors";

export async function createInterviewer(
  name: string,
  category: InterviewerCategory,
  availability: InterviewerAvailability,
  email: unknown,
) {
  const admin = await requireAdmin();
  const validatedInterviewer = validateInterviewerInput(
    name,
    category,
    availability,
  );

  try {
    await consumeAuthRateLimit({
      name: "interviewerInvite",
      key: rateLimitKeyForUser(admin.id),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new InterviewerInvitationError(error.message);
    }
    throw error;
  }

  const result = await createInterviewerWithInvite({
    actorUserId: admin.id,
    name: validatedInterviewer.name,
    category: validatedInterviewer.category,
    availability: validatedInterviewer.availability,
    email,
  });

  revalidatePath("/dashboard/interviewers");

  return result;
}

export async function updateInterviewer(
  id: number,
  name: string,
  category: InterviewerCategory,
  availability: InterviewerAvailability,
) {
  await requireAdmin();
  const interviewerId = validateInterviewerId(id);

  await ensureInterviewerExists(interviewerId);

  const validatedInterviewer = validateInterviewerInput(
    name,
    category,
    availability,
  );

  const interviewer = await prisma.interviewer.update({
    where: {
      id: interviewerId,
    },
    data: validatedInterviewer,
  });

  revalidatePath("/dashboard/interviewers");
  revalidatePath("/dashboard/jobs");

  return interviewer;
}

export async function deleteInterviewer(id: number) {
  await requireAdmin();
  const interviewerId = validateInterviewerId(id);

  await ensureInterviewerExists(interviewerId);

  try {
    await prisma.interviewer.delete({
      where: {
        id: interviewerId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new InterviewerValidationError(
        "Interviewer is assigned to a requirement and cannot be deleted.",
      );
    }

    throw error;
  }

  revalidatePath("/dashboard/interviewers");
  revalidatePath("/dashboard/jobs");
}

export async function resendInterviewerInvite(interviewerId: number) {
  const admin = await requireAdmin();
  const id = validateInterviewerId(interviewerId);

  try {
    await consumeAuthRateLimit({
      name: "interviewerInvite",
      key: rateLimitKeyForUser(admin.id),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new InterviewerInvitationError(error.message);
    }
    throw error;
  }

  const result = await resendInterviewerInvitation({
    actorUserId: admin.id,
    interviewerId: id,
  });

  revalidatePath("/dashboard/interviewers");
  return result;
}

export async function revokeInterviewerInvite(invitationId: number) {
  await requireAdmin();
  const result = await revokeInterviewerInvitation({ invitationId });
  revalidatePath("/dashboard/interviewers");
  return result;
}

export async function signUpInterviewerFromInvitation(input: {
  token: unknown;
  name: unknown;
  password: unknown;
}) {
  const ip = await readRequestIp();

  try {
    await consumeAuthRateLimit({
      name: "inviteAcceptIp",
      key: rateLimitKeyForIp(ip),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  try {
    const created = await acceptInterviewerInvitationAndCreateLogin(input);
    return {
      ok: true as const,
      email: created.email,
      interviewerId: created.interviewerId,
    };
  } catch (error) {
    if (error instanceof InterviewerInvitationError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof UserValidationError) {
      return { ok: false as const, error: error.message };
    }
    return {
      ok: false as const,
      error: "Unable to create your interviewer account.",
    };
  }
}

export async function acceptInterviewerInvite(token: unknown) {
  const user = await requireUser();
  const ip = await readRequestIp();

  await consumeAuthRateLimit({
    name: "inviteAcceptIp",
    key: rateLimitKeyForIp(ip),
  });

  return acceptInterviewerInvitationForExistingUser({
    userId: user.id,
    token,
  });
}

export async function setInterviewerLoginDisabled(
  interviewerId: number,
  disabled: boolean,
) {
  await requireAdmin();
  const id = validateInterviewerId(interviewerId);
  await ensureInterviewerExists(id);

  const user = await prisma.user.findFirst({
    where: { interviewerId: id, role: "INTERVIEWER" },
    select: { id: true },
  });
  if (!user) {
    throw new InterviewerInvitationError("This interviewer has no login yet.");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        disabledAt: disabled ? now : null,
        passwordChangedAt: disabled ? now : undefined,
      },
    }),
    prisma.interviewer.update({
      where: { id },
      data: {
        availability: disabled ? "NOT_AVAILABLE" : "AVAILABLE",
      },
    }),
  ]);

  revalidatePath("/dashboard/interviewers");
  revalidatePath("/dashboard/jobs");
  return { ok: true as const, disabled };
}
