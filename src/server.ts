import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: any, ctx: unknown) {
    try {
      // Polyfill Cloudflare bindings into process.env so server actions can easily read them
      if (!globalThis.process) {
        (globalThis as any).process = {};
      }
      // Use a Proxy to access non-enumerable Cloudflare bindings without errors on set()
      const fallbackEnv: Record<string, any> = {};
      (globalThis as any).process.env = new Proxy(fallbackEnv, {
        get(_, prop) {
          if (env && typeof prop === "string" && env[prop] !== undefined) {
            return env[prop];
          }
          return fallbackEnv[prop as string];
        },
        set(_, prop, value) {
          fallbackEnv[prop as string] = value;
          return true;
        }
      });

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const finalResponse = await normalizeCatastrophicSsrResponse(response);

      // Create a new response with COOP headers to allow Firebase popups
      const newHeaders = new Headers(finalResponse.headers);
      newHeaders.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

      return new Response(finalResponse.body, {
        status: finalResponse.status,
        statusText: finalResponse.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
