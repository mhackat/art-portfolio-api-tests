import { test, type APIRequestContext, type APIResponse } from "@playwright/test";

/**
 * Records every API response so a reviewer can read what the server actually
 * said, without any test having to log it by hand.
 *
 * Wrapping the request context rather than each call site means existing specs
 * are untouched and no future test can forget to do it. Each response is both
 * printed to the console and attached to the HTML report, where it stays
 * grouped under the test that made it — `npm run report` is the readable view.
 */

/** APIRequestContext methods that issue a request and return a response. */
const REQUEST_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "fetch"]);

/** Console output stays skimmable; the full body always goes to the report. */
const CONSOLE_BODY_LIMIT = 1500;

/** Numbers the attachments so their order in the report matches the test's flow. */
const callCounters = new WeakMap<object, number>();

function nextCallNumber(): number {
  let info: ReturnType<typeof test.info>;
  try {
    info = test.info();
  } catch {
    return 0;
  }
  const current = callCounters.get(info) ?? 0;
  const next = current + 1;
  callCounters.set(info, next);
  return next;
}

/** Pretty-prints JSON so nested bodies are actually readable in the report. */
function formatBody(raw: string, contentType: string): string {
  if (!raw) return "(empty body)";
  if (!contentType.includes("json")) return raw;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // Content-Type claimed JSON but the body isn't — show it as-is rather than
    // hiding the very malformation a reader would want to see.
    return raw;
  }
}

async function describeBody(response: APIResponse): Promise<string> {
  const contentType = response.headers()["content-type"] ?? "";

  // Only decode things that are meant to be read. An image body would be
  // megabytes of noise in a report and tells a reviewer nothing.
  const isTextual =
    contentType.includes("json") ||
    contentType.includes("text") ||
    contentType.includes("xml") ||
    contentType === "";

  if (!isTextual) {
    const bytes = (await response.body().catch(() => Buffer.alloc(0))).byteLength;
    return `(${contentType || "binary"}, ${bytes} bytes — not shown)`;
  }

  const raw = await response.text().catch(() => "(body could not be read)");
  return formatBody(raw, contentType);
}

async function record(label: string, method: string, url: unknown, response: APIResponse): Promise<void> {
  const call = nextCallNumber();
  const target = typeof url === "string" ? url : String(url);
  const heading = `${method.toUpperCase()} ${target} → ${response.status()} ${response.statusText()}`;
  const body = await describeBody(response);
  const full = `[${label}] ${heading}\n${body}`;

  // eslint-disable-next-line no-console
  console.log(
    `\n${full.length > CONSOLE_BODY_LIMIT ? `${full.slice(0, CONSOLE_BODY_LIMIT)}\n… (truncated — see the HTML report for the rest)` : full}`
  );

  try {
    await test.info().attach(`${String(call).padStart(2, "0")} ${heading}`, {
      body: full,
      contentType: "text/plain",
    });
  } catch {
    // Outside a running test (or after it finished) there's nowhere to attach —
    // the console line above is still emitted, so nothing is lost.
  }
}

/**
 * Returns a context that behaves exactly like the one passed in, but records
 * every response it produces. `label` identifies which context a line came
 * from when a test uses more than one (anonymous vs authenticated vs admin).
 */
export function withResponseLogging(context: APIRequestContext, label: string): APIRequestContext {
  return new Proxy(context, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") return value;
      if (!REQUEST_METHODS.has(String(property))) {
        // dispose(), storageState() and friends must still work — bind them so
        // `this` remains the real context rather than the proxy.
        return value.bind(target);
      }

      return async (...args: unknown[]) => {
        const response = (await value.apply(target, args)) as APIResponse;
        await record(label, String(property), args[0], response);
        return response;
      };
    },
  }) as APIRequestContext;
}
