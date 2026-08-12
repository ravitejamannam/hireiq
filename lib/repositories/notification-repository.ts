import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

import {
  notificationScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

const notificationSelect = {
  id: true,
  type: true,
  message: true,
  createdAt: true,
  jobId: true,
  interviewerId: true,
  job: {
    select: {
      id: true,
      title: true,
      requirementLifecycle: true,
      status: true,
    },
  },
  interviewer: {
    select: {
      id: true,
      name: true,
      category: true,
      availability: true,
    },
  },
} satisfies Prisma.NotificationSelect;

export async function getNotifications() {
  const user = await requireUser();

  return prisma.notification.findMany({
    where: notificationScopeWhere(user),
    select: notificationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getNotificationById(id: number) {
  const user = await requireUser();

  return prisma.notification.findFirst({
    where: {
      id,
      ...notificationScopeWhere(user),
    },
    select: notificationSelect,
  });
}
