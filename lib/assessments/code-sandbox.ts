/**
 * Candidate code never runs inside the HireIQ process, and it never runs as
 * a plain `node` or `python3` subprocess on the app host.
 *
 * Two isolated runners are accepted:
 * - Judge0 (or any compatible isolate service) at JUDGE0_URL. Network, memory,
 *   and filesystem limits are enforced by that service, not by this process.
 * - Docker, only when HIREIQ_CODE_RUNNER=docker. The container has no network,
 *   a 64 MB memory cap, a read-only root, dropped capabilities, and no host
 *   mounts or host environment variables.
 *
 * If neither is configured, grading stops and a person reviews the answer.
 */

import { spawn } from "node:child_process";

export type CodeTest = { input: string; output: string; hidden?: boolean };

export type CodeRunResult = {
  passed: number;
  total: number;
  results: Array<{ pass: boolean; actual?: string; hidden: boolean }>;
  error: string | null;
  runner: "judge0" | "docker" | "unavailable";
};

const CPU_SECONDS = 2;
const MEMORY_KB = 64_000;
const OUTPUT_LIMIT = 8_000;

export function codeRunnerKind(): "judge0" | "docker" | "unavailable" {
  if (process.env.JUDGE0_URL?.trim()) return "judge0";
  if (process.env.HIREIQ_CODE_RUNNER === "docker") return "docker";
  return "unavailable";
}

export function programFor(input: { language: "javascript" | "python"; source: string; tests: CodeTest[] }) {
  const cases = JSON.stringify(input.tests.map((test) => ({ input: test.input, output: test.output })));
  if (input.language === "javascript") {
    return `const module = { exports: {} };
const exports = module.exports;
${input.source}
const __hireiqSolve = typeof module.exports.solve === "function" ? module.exports.solve : (typeof solve === "function" ? solve : null);
const cases = ${cases};
const results = cases.map((item) => {
  try {
    if (typeof __hireiqSolve !== "function") return { pass: false, actual: "export solve" };
    const actual = String(__hireiqSolve(item.input));
    return { pass: actual.trim() === String(item.output).trim(), actual };
  } catch (error) {
    return { pass: false, actual: error instanceof Error ? error.message : "error" };
  }
});
process.stdout.write(JSON.stringify(results));
`;
  }
  return `${input.source}
import json
cases = json.loads(${JSON.stringify(cases)})
results = []
for item in cases:
    try:
        actual = str(solve(item["input"]))
        results.append({"pass": actual.strip() == str(item["output"]).strip(), "actual": actual})
    except Exception as error:
        results.append({"pass": False, "actual": str(error)})
import sys
sys.stdout.write(json.dumps(results))
`;
}

/** Judge0 CE submission. enable_network is false; the service must honor it. */
export function judge0Submission(input: { language: "javascript" | "python"; source: string; tests: CodeTest[] }) {
  return {
    source_code: programFor(input),
    language_id: input.language === "javascript" ? 63 : 71,
    cpu_time_limit: CPU_SECONDS,
    wall_time_limit: CPU_SECONDS + 1,
    memory_limit: MEMORY_KB,
    max_processes_and_or_threads: 16,
    enable_network: false,
    max_file_size: 1024,
  };
}

/**
 * Docker argv. No shell, no volume mounts, no host env, no network.
 * The image is a stock runtime; candidate code arrives only as the program
 * argument, never as a bind mount of the HireIQ filesystem.
 */
export function dockerRunArgs(input: { language: "javascript" | "python"; source: string; tests: CodeTest[] }) {
  const image = input.language === "javascript" ? "node:20-alpine" : "python:3.12-alpine";
  const command = input.language === "javascript" ? ["node", "-e"] : ["python", "-c"];
  return [
    "run",
    "--rm",
    "--network",
    "none",
    "--memory",
    "64m",
    "--memory-swap",
    "64m",
    "--pids-limit",
    "32",
    "--cpus",
    "0.5",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=8m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65534:65534",
    image,
    ...command,
    programFor(input),
  ];
}

function hideResults(parsed: Array<{ pass: boolean; actual: string }>, tests: CodeTest[]): CodeRunResult {
  return {
    passed: parsed.filter((row) => row.pass).length,
    total: tests.length,
    results: parsed.map((row, index) => ({
      pass: row.pass,
      actual: tests[index]?.hidden ? undefined : row.actual?.slice(0, 500),
      hidden: Boolean(tests[index]?.hidden),
    })),
    error: null,
    runner: codeRunnerKind() === "unavailable" ? "docker" : codeRunnerKind(),
  };
}

function refused(total: number, error: string): CodeRunResult {
  return { passed: 0, total, results: [], error, runner: "unavailable" };
}

async function runJudge0(input: { language: "javascript" | "python"; source: string; tests: CodeTest[] }): Promise<CodeRunResult> {
  const base = process.env.JUDGE0_URL?.trim().replace(/\/$/, "");
  if (!base) return refused(input.tests.length, "Code execution is turned off until an isolated runner is configured.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.JUDGE0_TOKEN?.trim();
  if (token) headers["X-Auth-Token"] = token;
  const response = await fetch(`${base}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify(judge0Submission(input)),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return refused(input.tests.length, "The isolated runner rejected the submission.");
  const body = (await response.json()) as { stdout?: string | null; stderr?: string | null; status?: { id?: number } };
  if (!body.stdout) return refused(input.tests.length, body.stderr?.slice(0, 300) || "The isolated runner did not return a result.");
  const parsed = JSON.parse(body.stdout.slice(0, OUTPUT_LIMIT)) as Array<{ pass: boolean; actual: string }>;
  return { ...hideResults(parsed, input.tests), runner: "judge0" };
}

async function runDocker(input: { language: "javascript" | "python"; source: string; tests: CodeTest[] }): Promise<CodeRunResult> {
  const args = dockerRunArgs(input);
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("The container exceeded the time limit."));
    }, (CPU_SECONDS + 3) * 1000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > OUTPUT_LIMIT) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) reject(new Error(stderr.slice(0, 300) || "The container did not finish."));
      else resolve(stdout);
    });
  });
  const parsed = JSON.parse(output) as Array<{ pass: boolean; actual: string }>;
  return { ...hideResults(parsed, input.tests), runner: "docker" };
}

export async function runCodeSubmission(input: {
  language: "javascript" | "python";
  source: string;
  tests: CodeTest[];
}): Promise<CodeRunResult> {
  if (input.tests.length === 0 || input.tests.length > 12) {
    return refused(input.tests.length, "A coding task needs 1 to 12 tests.");
  }
  if (input.source.length > 20_000) {
    return refused(input.tests.length, "Code is too long.");
  }
  const runner = codeRunnerKind();
  if (runner === "unavailable") {
    return refused(input.tests.length, "Code execution is turned off until an isolated runner is configured.");
  }
  try {
    return runner === "judge0" ? await runJudge0(input) : await runDocker(input);
  } catch (error) {
    return refused(input.tests.length, error instanceof Error ? error.message : "The isolated runner failed.");
  }
}
