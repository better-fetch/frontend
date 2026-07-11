import "server-only";

// Client for the tool-runner service (runner/ — a separate Fly app on the
// private network that executes tool bundles in isolates). The caller's
// bf_ token is passed through so every engine call the tool makes is
// metered against the caller, exactly like a direct REST call.

const RUNNER_URL = process.env.RUNNER_URL ?? "http://better-fetch-runner.internal:8080";

export type RunnerResult =
  | { ok: true; output: unknown; engine_calls: number; duration_ms: number }
  | { ok: false; error: string; message: string; status?: number };

export async function runTool(
  tool: string,
  input: unknown,
  bfToken: string,
  opts?: { version?: string; allowStaging?: boolean },
): Promise<RunnerResult> {
  const secret = process.env.RUNNER_SHARED_SECRET;
  if (!secret) {
    return { ok: false, error: "runner_unconfigured", message: "RUNNER_SHARED_SECRET is not set" };
  }
  let res: Response;
  try {
    res = await fetch(`${RUNNER_URL}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        tool,
        input,
        bf_token: bfToken,
        version: opts?.version,
        allow_staging: opts?.allowStaging,
      }),
      // Inside the MCP route's 260s maxDuration; the runner's own wall
      // clock is 240s, so this only fires if the runner hangs.
      signal: AbortSignal.timeout(250_000),
    });
  } catch (e) {
    return {
      ok: false,
      error: "runner_unreachable",
      message: e instanceof Error ? e.message : "tool runner did not respond",
    };
  }
  try {
    return (await res.json()) as RunnerResult;
  } catch {
    return {
      ok: false,
      error: "runner_bad_response",
      message: `tool runner returned non-JSON (HTTP ${res.status})`,
      status: res.status,
    };
  }
}
