import type { Prisma } from "@prisma/client";

import { buildChannelReport, type ChannelApplication, type ChannelReport } from "@/lib/analytics/channel-analytics";
import { prisma } from "@/lib/prisma";

export function channelAnalyticsWhere(companyId: number): Prisma.ApplicationWhereInput {
  return { companyId };
}

export async function loadChannelAnalytics(input: {
  companyId: number;
  from: Date | null;
  to: Date | null;
}): Promise<ChannelReport> {
  const applications = await prisma.application.findMany({
    where: channelAnalyticsWhere(input.companyId),
    select: {
      id: true,
      candidateId: true,
      companyId: true,
      createdAt: true,
      status: true,
      consentAt: true,
      source: true,
      interviews: { select: { id: true } },
      ingestionEvents: {
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          receivedAt: true,
          status: true,
          sourceChannel: true,
          externalApplicationId: true,
          distributionId: true,
        },
      },
    },
  });
  const rows: ChannelApplication[] = applications.map((application) => ({
    applicationId: application.id,
    candidateId: application.candidateId,
    companyId: application.companyId,
    createdAt: application.createdAt,
    status: application.status,
    consentAt: application.consentAt,
    interviewCount: application.interviews.length,
    boardSource: application.source,
    events: application.ingestionEvents,
  }));
  return buildChannelReport({
    companyId: input.companyId,
    applications: rows,
    from: input.from,
    to: input.to,
  });
}
