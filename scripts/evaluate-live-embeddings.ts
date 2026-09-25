import "dotenv/config";

import {
  evaluateLiveProductionEmbeddings,
  liveEvaluationIsProductionComplete,
} from "../lib/evaluation/live-embedding-evaluation";

/**
 * M9.1 production embedding evaluation gate.
 * Never prints API keys or raw evidence text.
 */
async function main() {
  const report = await evaluateLiveProductionEmbeddings();
  const printable = {
    ...report,
    productionComplete: liveEvaluationIsProductionComplete(report),
  };
  process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
  if (report.status === "NOT_RUN") {
    process.exitCode = 2;
    return;
  }
  if (report.status === "PARTIAL") {
    process.exitCode = 1;
  }
}

void main();
