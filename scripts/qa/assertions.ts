export type WorkflowResult = {
  id: string;
  name: string;
  result: "PASS" | "FAIL";
  testType: string;
  notes: string;
};

export function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERT FAIL: ${message}`);
  }
}

export async function assertThrows(
  fn: () => unknown | Promise<unknown>,
  match: string | ((error: unknown) => boolean),
  message: string,
) {
  let thrown: unknown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown !== null, `${message} (no error thrown)`);

  if (typeof match === "string") {
    const text =
      thrown instanceof Error ? thrown.message : String(thrown);
    assert(
      text.includes(match),
      `${message} (got: ${text})`,
    );
    return;
  }

  assert(match(thrown), message);
}

export function assertIncludes(
  haystack: string,
  needle: string,
  message: string,
) {
  assert(haystack.includes(needle), message);
}

export function assertNotIncludes(
  haystack: string,
  needle: string,
  message: string,
) {
  assert(!haystack.includes(needle), message);
}
