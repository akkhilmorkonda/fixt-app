import "server-only";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";

// LangSmith tracing. Setting LANGSMITH_API_KEY is all it takes: every AI call
// is then traced to the project in LANGSMITH_PROJECT (default "fixt-<env>"),
// tagged with the organization, the member, the feature and the ai_usage id
// (the trace's run id is the same id, so /admin links straight to it).
//
// Optional:
//   LANGSMITH_TRACING=false     keep the key but stop tracing
//   LANGSMITH_PROJECT           project name
//   LANGSMITH_ENDPOINT          for EU or self-hosted LangSmith
//   LANGSMITH_HIDE_INPUTS=true  / LANGSMITH_HIDE_OUTPUTS=true  keep customer
//                               data out of traces (token counts and timings remain)
//   LANGSMITH_WORKSPACE_ID      when the key spans several workspaces

let configured = false;

/** Turns tracing on when a LangSmith key is set. LangChain reads these variables on every run. */
export function configureTracing() {
  if (configured) return tracingEnabled();
  configured = true;
  const env = process.env;
  if (!env.LANGSMITH_API_KEY) return false;
  if (env.LANGSMITH_TRACING === undefined && env.LANGCHAIN_TRACING_V2 === undefined) env.LANGSMITH_TRACING = "true";
  env.LANGSMITH_PROJECT ??= `fixt-${env.VERCEL_ENV ?? env.NODE_ENV ?? "development"}`;
  return tracingEnabled();
}

export function tracingEnabled() {
  const env = process.env;
  return !!env.LANGSMITH_API_KEY && [env.LANGSMITH_TRACING, env.LANGSMITH_TRACING_V2, env.LANGCHAIN_TRACING_V2].includes("true");
}

/**
 * Waits for queued traces to upload. Serverless functions freeze when the
 * response ends, so call this from after() once the work is done.
 */
export async function flushTraces() {
  if (!tracingEnabled()) return;
  try {
    await awaitAllCallbacks();
  } catch (err) {
    console.error("LangSmith flush failed", err);
  }
}

/** A link to a call's trace, when the project's LangSmith URL is known. */
export function traceUrl(usageId: string) {
  const base = process.env.LANGSMITH_PROJECT_URL;
  return base ? `${base.replace(/\/$/, "")}?peek=${usageId}` : null;
}
