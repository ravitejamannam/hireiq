import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PortalRole } from "@prisma/client";
import { getInterviewerSchedule } from "@/lib/repositories/interviewer-portal-repository";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const ctx = vi.hoisted(() => ({ interviewerId: 0 }));

vi.mock("@/lib/auth/authorization", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/authorization")>();
  return {
    ...original,
    requireInterviewerPortal: async () => ({
      id: 1,
      email: "schedule@hireiq.test",
      name: "Schedule interviewer",
      role: PortalRole.INTERVIEWER,
      companyId: null,
      interviewerId: ctx.interviewerId,
      interviewer: { id: ctx.interviewerId, name: "Schedule interviewer", category: "ENGINEERING" },
    }),
  };
});




const MARKER = `sched-${process.pid}-${Date.now()}`;

describe.skipIf(integrationDatabase.mode === "skip")("interviewer schedule visibility", () => {
  let profileA = 0;
  let profileB = 0;
  const companyIds: number[] = [];
  const interviewerIds: number[] = [];
  const jobIds: number[] = [];
  const candidateIds: number[] = [];
  const applicationIds: number[] = [];
  const interviewIds: number[] = [];

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER } });
    companyIds.push(company.id);
    const a = await prisma.interviewer.create({ data: { name: `${MARKER} A`, category: "ENGINEERING" } });
    interviewerIds.push(a.id);
    const b = await prisma.interviewer.create({ data: { name: `${MARKER} B`, category: "ENGINEERING" } });
    interviewerIds.push(b.id);
    profileA = a.id;
    profileB = b.id;
    const job = await prisma.job.create({ data: { title: `${MARKER} job`, status: "OPEN", companyId: company.id, assignedInterviewerId: profileA } });
    jobIds.push(job.id);
    const candidate = await prisma.candidate.create({ data: { name: MARKER, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: company.id } });
    candidateIds.push(candidate.id);
    const application = await prisma.application.create({ data: { candidateId: candidate.id, jobId: job.id, companyId: company.id, status: "TECH_EVALUATION" } });
    applicationIds.push(application.id);

    const recordInterview = async (data: { type: "PHONE_SCREEN" | "TECHNICAL" | "HR"; interviewAt: Date; result: "PENDING" | "CANCELLED" | "PASSED"; meetUrl?: string | null; applicationId: number }) => {
      const row = await prisma.interview.create({ data });
      interviewIds.push(row.id);
      return row;
    };
    const upcoming = async (days: number, type: "PHONE_SCREEN" | "TECHNICAL", meetUrl: string | null = null) =>
      recordInterview({ type, interviewAt: new Date(Date.now() + days * 86_400_000), result: "PENDING", meetUrl, applicationId: application.id });
    // B's own assigned job, so B's interview belongs to B's schedule and never to A's.
    const jobB = await prisma.job.create({ data: { title: `${MARKER} job B`, status: "OPEN", companyId: company.id, assignedInterviewerId: profileB } });
    jobIds.push(jobB.id);
    const upcomingB = async (days: number) => {
      const candidateB = await prisma.candidate.create({ data: { name: `${MARKER}-B`, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: company.id } });
      candidateIds.push(candidateB.id);
      const appB = await prisma.application.create({ data: { candidateId: candidateB.id, jobId: jobB.id, companyId: company.id, status: "TECH_EVALUATION" } });
      applicationIds.push(appB.id);
      return recordInterview({ type: "HR", interviewAt: new Date(Date.now() + days * 86_400_000), result: "PENDING", applicationId: appB.id });
    };

    const soon = await upcoming(1, "TECHNICAL", "https://meet.example.com/soon");
    await upcoming(3, "PHONE_SCREEN");
    // Another interviewer's interview: never visible to A.
    await upcomingB(2);
    // Cancelled: excluded from upcoming even though it is in the future.
    await recordInterview({ type: "TECHNICAL", interviewAt: new Date(Date.now() + 4 * 86_400_000), result: "CANCELLED", applicationId: application.id });
    // Past with a result.
    await recordInterview({ type: "PHONE_SCREEN", interviewAt: new Date(Date.now() - 5 * 86_400_000), result: "PASSED", applicationId: application.id });
    void soon;
  });

  afterAll(async () => {
    const companies = companyIds.filter((id) => id > 0);
    const interviewers = interviewerIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const candidates = candidateIds.filter((id) => id > 0);
    const applications = applicationIds.filter((id) => id > 0);
    const interviews = interviewIds.filter((id) => id > 0);
    if (companies.length + interviewers.length + jobs.length + candidates.length + applications.length + interviews.length === 0) return;

    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (error) {
        failures.push(`${step}: ${error instanceof Error ? error.message : "cleanup failed"}`);
        return false;
      }
    };

    // InterviewReminder cascades from Interview, so a reminder delete is not required
    // before deleting the interview. Application, candidate, and job deletes wait
    // on the interviews. Interviewer profiles wait on the jobs that reference them.
    if (interviews.length > 0) {
      await attempt("interview reminders", () =>
        prisma.interviewReminder.deleteMany({ where: { interviewId: { in: interviews } } }));
    }
    const interviewsGone = interviews.length === 0 || await attempt("interviews", () =>
      prisma.interview.deleteMany({ where: { id: { in: interviews } } }));
    let applicationsGone = applications.length === 0;
    if (interviewsGone && applications.length > 0) {
      applicationsGone = await attempt("applications", () =>
        prisma.application.deleteMany({ where: { id: { in: applications } } }));
    }
    let candidatesGone = candidates.length === 0;
    if (applicationsGone && candidates.length > 0) {
      candidatesGone = await attempt("candidates", () =>
        prisma.candidate.deleteMany({ where: { id: { in: candidates } } }));
    }
    let jobsGone = jobs.length === 0;
    if (applicationsGone && jobs.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    }
    if (jobsGone && interviewers.length > 0) {
      await attempt("interviewers", () =>
        prisma.interviewer.deleteMany({ where: { id: { in: interviewers } } }));
    }
    if (applicationsGone && candidatesGone && jobsGone && companies.length > 0) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: companies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Interviewer schedule fixture cleanup failed.\n${failures.join("\n")}`);
    }
  });

  it("lists only this interviewer's future, non-cancelled interviews, soonest first", async () => {
    ctx.interviewerId = profileA;
    const { upcoming, past } = await getInterviewerSchedule();
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0]!.type).toBe("TECHNICAL");
    expect(upcoming[0]!.meetUrl).toBe("https://meet.example.com/soon");
    expect(upcoming[0]!.application.candidate.name).toBe(MARKER);
    expect(upcoming[0]!.application.job.title).toBe(`${MARKER} job`);
    expect(upcoming.map((row) => row.type).sort()).toEqual(["PHONE_SCREEN", "TECHNICAL"]);
    expect(new Date(upcoming[0]!.interviewAt).getTime()).toBeLessThan(new Date(upcoming[1]!.interviewAt).getTime());
    expect(past.map((row) => row.result)).toContain("PASSED");
  });

  it("never shows another interviewer's interviews", async () => {
    ctx.interviewerId = profileB;
    const { upcoming, past } = await getInterviewerSchedule();
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.type).toBe("HR");
    expect(past).toHaveLength(0);
  });
});
