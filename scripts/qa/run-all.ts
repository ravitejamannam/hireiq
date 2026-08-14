/**
 * HireIQ full-workflow QA runner.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * Playwright is not installed. This suite tests production validators,
 * handoffs, repositories predicates, and uniqueness via Prisma.
 *
 * Cleans only TMP-FULL-QA* records it creates.
 */
import { prisma } from "./fixtures";
import type { WorkflowResult } from "./assertions";
import { runWorkflow01 } from "./workflow-01-requirement";
import { runWorkflow02 } from "./workflow-02-sourcing";
import { runWorkflow03 } from "./workflow-03-evaluation";
import { runWorkflow04 } from "./workflow-04-rejection";
import { runWorkflow05 } from "./workflow-05-shortlist-gate";
import { runWorkflow06 } from "./workflow-06-communication";
import { runWorkflow07 } from "./workflow-07-selection";
import { runWorkflow08 } from "./workflow-08-hiring-billing";
import { runWorkflow09 } from "./workflow-09-admin-restrictions";
import { runWorkflow10 } from "./workflow-10-interviewer-restrictions";
import { runWorkflow11 } from "./workflow-11-tenant-isolation";
import { runWorkflow12 } from "./workflow-12-notification-isolation";
import { runWorkflow13 } from "./workflow-13-job-timestamps";
import { runWorkflow14 } from "./workflow-14-application-crud";
import { runWorkflow15 } from "./workflow-15-billing-creation";
import { runWorkflow16 } from "./workflow-16-interviewer-reassignment";
import { runWorkflow17 } from "./workflow-17-email-retry";
import { runWorkflow18 } from "./workflow-18-hiring-lifecycle";

type Spec = {
  id: string;
  name: string;
  testType: string;
  notes: string;
  run: () => Promise<void>;
};

const workflows: Spec[] = [
  {
    id: "01",
    name: "Requirement lifecycle",
    testType: "validator + role predicates + source",
    notes: "Invalid skips rejected; T69 generic bypass blocked; Admin-only generic transitions",
    run: runWorkflow01,
  },
  {
    id: "02",
    name: "Database access / SLA",
    testType: "T69 handoff",
    notes: "Generic INTERVIEWER_NOTIFIED→SOURCING rejected; 24h SLA; one T69",
    run: runWorkflow02,
  },
  {
    id: "03",
    name: "Interviewer evaluation",
    testType: "Prisma uniqueness + evaluationScopeWhere + source",
    notes: "Assigned interviewer only; T63 unique",
    run: runWorkflow03,
  },
  {
    id: "04",
    name: "Rejection rules",
    testType: "pipeline maps + conditional update",
    notes: "Interviewer TECH_EVALUATION->REJECTED only; REJECTED terminal",
    run: runWorkflow04,
  },
  {
    id: "05",
    name: "Zero shortlist gate",
    testType: "T70 handoff",
    notes: "0 SHORTLISTED rejected; ≥1 succeeds once",
    run: runWorkflow05,
  },
  {
    id: "06",
    name: "Communication idempotency",
    testType: "T68/T69/T70 dispatch + finalize",
    notes: "One event each; email not faked as sent",
    run: runWorkflow06,
  },
  {
    id: "07",
    name: "Client selection",
    testType: "predicates + tenant-scoped update + billing guard",
    notes: "Admin/Interviewer cannot SELECT; SELECTED has no billing",
    run: runWorkflow07,
  },
  {
    id: "08",
    name: "Client hiring + billing",
    testType: "generateBillingForHiredApplication",
    notes: "HIRED bills once; SELECTED cannot bill",
    run: runWorkflow08,
  },
  {
    id: "09",
    name: "Admin hiring restriction",
    testType: "pipeline maps + source + UI copy",
    notes: "Server and UI deny Admin SELECT/HIRE",
    run: runWorkflow09,
  },
  {
    id: "10",
    name: "Interviewer hiring restriction",
    testType: "pipeline maps + source + billingScopeWhere",
    notes: "No SELECT/HIRE/billing; no caller-owned IDs",
    run: runWorkflow10,
  },
  {
    id: "11",
    name: "Tenant isolation",
    testType: "scope where + IDOR findFirst",
    notes: "Alpha/Beta both directions",
    run: runWorkflow11,
  },
  {
    id: "12",
    name: "Notification isolation",
    testType: "notificationScopeWhere",
    notes: "Admin all; Client T70; Interviewer T68/T69",
    run: runWorkflow12,
  },
  {
    id: "13",
    name: "Generic job timestamp bypass",
    testType: "validateJobInput + T69/T70 handoffs + source",
    notes: "create/update Job cannot plant SLA timestamps; dedicated workflows still write them",
    run: runWorkflow13,
  },
  {
    id: "14",
    name: "Generic application CRUD pipeline",
    testType: "create/update validators + source + Client SELECT/HIRE paths",
    notes: "Admin CRUD cannot plant or skip pipeline; SELECT/HIRE stay Client-owned",
    run: runWorkflow14,
  },
  {
    id: "15",
    name: "Billing creation without HIRED",
    testType: "assertJobHasHiredApplicationForBilling + hire generator + W08",
    notes: "createBillingRecord cannot plant billing without HIRED; hire path remains idempotent",
    run: runWorkflow15,
  },
  {
    id: "16",
    name: "Interviewer reassignment freeze",
    testType: "assignment lock + T68/T69 recipients + interviewer scope",
    notes: "Reassignment rejected after T68/T69; pre-notify reassignment still allowed",
    run: runWorkflow16,
  },
  {
    id: "17",
    name: "Email retry after commit",
    testType: "finalize + retryNotificationEmail + delivery persistence",
    notes: "T68/T69/T70 stay committed on email failure; retry does not duplicate events",
    run: runWorkflow17,
  },
  {
    id: "18",
    name: "Hiring / lifecycle / billing consistency",
    testType: "SELECT/HIRE lifecycle gate + billing uniqueness + terminal states",
    notes: "Client SELECT/HIRE cannot skip pre-sourcing lifecycle; BILLING_GENERATED only after HIRE; one active BillingRecord",
    run: runWorkflow18,
  },
];

async function main() {
  console.log("SERVER_ACTIONS_INVOKABLE=false");
  console.log("AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED");
  console.log("PLAYWRIGHT_INSTALLED=false");
  console.log("");

  const results: WorkflowResult[] = [];

  for (const workflow of workflows) {
    try {
      await workflow.run();
      results.push({
        id: workflow.id,
        name: workflow.name,
        result: "PASS",
        testType: workflow.testType,
        notes: workflow.notes,
      });
      console.log(`PASS W${workflow.id} ${workflow.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: workflow.id,
        name: workflow.name,
        result: "FAIL",
        testType: workflow.testType,
        notes: message,
      });
      console.error(`FAIL W${workflow.id} ${workflow.name}`);
      console.error(error);
    }
  }

  console.log("");
  console.log("WORKFLOW | RESULT | TEST TYPE | NOTES");
  for (const row of results) {
    console.log(
      `${row.id} | ${row.result} | ${row.testType} | ${row.notes}`,
    );
  }

  const failed = results.filter((row) => row.result === "FAIL").length;
  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("TMP-FULL-QA PASS");
  }
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
