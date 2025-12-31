/**
 * Retry utility with exponential backoff for AI API calls
 * Handles 429 (Too Many Requests) and other transient errors
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a fetch call with exponential backoff
 * Automatically retries on 429 (rate limit) and 5xx (server errors)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If rate limited (429) or server error (5xx), retry
      if (
        response.status === 429 ||
        (response.status >= 500 && response.status < 600)
      ) {
        // Check for Retry-After header
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const retryAfterMs = parseInt(retryAfter, 10) * 1000;
          if (!isNaN(retryAfterMs)) {
            delay = Math.min(retryAfterMs, opts.maxDelayMs);
          }
        }

        if (attempt < opts.maxRetries) {
          console.log(
            `[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed with ${
              response.status
            }. Retrying in ${delay}ms...`
          );
          await sleep(delay);
          delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < opts.maxRetries) {
        console.log(
          `[Retry] Attempt ${attempt + 1}/${
            opts.maxRetries
          } failed with error: ${lastError.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

/**
 * Wrapper for Gemini API calls with built-in retry logic
 */
export function callGeminiWithRetry(
  apiKey: string,
  model: string,
  contents: unknown[],
  generationConfig?: Record<string, unknown>
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  return fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: generationConfig || {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  });
}
