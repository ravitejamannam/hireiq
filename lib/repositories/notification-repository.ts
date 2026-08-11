import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
  return prisma.notification.findMany({
    select: notificationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getNotificationById(id: number) {
  return prisma.notification.findUnique({
    where: {
      id,
    },
    select: notificationSelect,
  });
}
