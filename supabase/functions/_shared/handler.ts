/**
 * Edge Function Error Handler Wrapper
 *
 * Per .antigravityrules: "Use a shared Higher-Order Function withErrorHandler
 * to wrap all handlers. DO NOT use try/catch repeatedly in main logic."
 */

import {
  corsHeaders,
  jsonResponse as _jsonResponse,
  errorResponse,
} from "./cors.ts";

/**
 * Custom application error with HTTP status
 */
export class AppError extends Error {
  constructor(public override message: string, public status: number = 400) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Validation error helper
 */
export function validationError(message: string): never {
  throw new AppError(message, 400);
}

/**
 * Auth error helper
 */
export function authError(message = "Unauthorized"): never {
  throw new AppError(message, 401);
}

/**
 * Not found error helper
 */
export function notFoundError(message = "Not found"): never {
  throw new AppError(message, 404);
}

/**
 * Rate limit error helper
 */
export function rateLimitError(message = "Too many requests"): never {
  throw new AppError(message, 429);
}

/**
 * Higher-order function to wrap Edge Function handlers
 * - Handles CORS preflight automatically
 * - Catches errors and returns standardized JSON responses
 * - Logs unhandled errors
 */
export function withErrorHandler(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      return await handler(req);
    } catch (err) {
      // Known application errors
      if (err instanceof AppError) {
        return errorResponse(err.message, err.status);
      }

      // Unexpected errors - log and return generic message
      console.error("Unhandled error in Edge Function:", err);
      return errorResponse("Internal server error", 500);
    }
  };
}

/**
 * Parse JSON body with error handling
 */
export async function parseJsonBody<T = unknown>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    return body as T;
  } catch {
    throw new AppError("Invalid JSON body", 400);
  }
}
