import { IndexingNotificationStatus, type IndexingNotificationType } from "@prisma/client";

import { getPublicAppUrl } from "@/lib/communication/email-config";
import {
  sendIndexingNotification,
  type IndexingNotificationKind,
} from "@/lib/jobs/indexing/google-indexing";
import { publicJobPath } from "@/lib/jobs/public-feed/public-job-slug";
import { reportError } from "@/lib/obs/report-error";
import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 8;

function retryDelayMs(attemptCount: number) {
  return Math.min(60, 5 * Math.max(attemptCount, 1)) * 60 * 1000;
}

async function publicUrlForDistribution(companyId: number, distributionId: number) {
  const row = await prisma.jobDistribution.findFirst({
    where: {
      id: distributionId,
      companyId,
      applyMode: "HIREIQ_HOSTED",
    },
    select: {
      id: true,
      pinnedSpecificationVersion: { select: { title: true } },
      job: { select: { company: { select: { publicSlug: true } } } },
    },
  });
  if (!row) return null;
  const path = publicJobPath(
    row.job.company.publicSlug,
    row.pinnedSpecificationVersion.title,
    row.id,
  );
  const origin = getPublicAppUrl();
  return origin ? `${origin}${path}` : path;
}

export async function enqueueIndexingForDistribution(input: {
  companyId: number;
  distributionId: number;
  notificationType: IndexingNotificationType;
}) {
  try {
    const publicUrl = await publicUrlForDistribution(
      input.companyId,
      input.distributionId,
    );
    if (!publicUrl) return { ok: false as const, errorCode: "NOT_PUBLIC" };

    await prisma.indexingNotification.upsert({
      where: {
        distributionId_notificationType: {
          distributionId: input.distributionId,
          notificationType: input.notificationType,
        },
      },
      create: {
        companyId: input.companyId,
        distributionId: input.distributionId,
        publicUrl,
        notificationType: input.notificationType,
        status: IndexingNotificationStatus.PENDING,
        nextAttemptAt: new Date(),
      },
      update: {
        publicUrl,
        status: IndexingNotificationStatus.PENDING,
        errorCode: null,
        httpStatus: null,
        nextAttemptAt: new Date(),
        submittedAt: null,
      },
    });

    return deliverIndexingNotification(input.distributionId, input.notificationType);
  } catch (error) {
    reportError("indexing-enqueue", error);
    return { ok: false as const, errorCode: "ENQUEUE_FAILED" };
  }
}

async function deliverIndexingNotification(
  distributionId: number,
  notificationType: IndexingNotificationType,
) {
  const row = await prisma.indexingNotification.findUnique({
    where: {
      distributionId_notificationType: { distributionId, notificationType },
    },
  });
  if (!row) return { ok: false as const, errorCode: "NOT_FOUND" };

  const origin = getPublicAppUrl();
  const url =
    origin && row.publicUrl.startsWith("/") ? `${origin}${row.publicUrl}` : row.publicUrl;
  const result = await sendIndexingNotification({
    url,
    type: notificationType as IndexingNotificationKind,
  });

  const failed = result.status !== "SUBMITTED";
  const nextAttempt =
    result.status === "FAILED"
      ? new Date(Date.now() + retryDelayMs(row.attemptCount + 1))
      : null;

  await prisma.indexingNotification.update({
    where: { id: row.id },
    data: {
      publicUrl: url.startsWith("http") ? url : row.publicUrl,
      status: result.status,
      httpStatus: result.httpStatus,
      errorCode: result.errorCode,
      submittedAt: result.status === "SUBMITTED" ? new Date() : null,
      attemptCount:
        result.status === "UNCONFIGURED" ? row.attemptCount : row.attemptCount + 1,
      nextAttemptAt: nextAttempt,
    },
  });

  return {
    ok: !failed || result.status === "UNCONFIGURED",
    status: result.status,
    errorCode: result.errorCode,
  };
}

export async function retryDueIndexingNotifications(now = new Date()) {
  const due = await prisma.indexingNotification.findMany({
    where: {
      OR: [
        { status: IndexingNotificationStatus.PENDING },
        { status: IndexingNotificationStatus.UNCONFIGURED },
        {
          status: IndexingNotificationStatus.FAILED,
          attemptCount: { lt: MAX_ATTEMPTS },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
    select: { distributionId: true, notificationType: true },
  });

  const results = [];
  for (const row of due) {
    results.push(
      await deliverIndexingNotification(row.distributionId, row.notificationType),
    );
  }
  return {
    considered: due.length,
    submitted: results.filter((result) => result.status === "SUBMITTED").length,
    unconfigured: results.filter((result) => result.status === "UNCONFIGURED").length,
    failed: results.filter((result) => result.status === "FAILED").length,
  };
}
