/**
 * Rate limiter and retry logic for Telegram API calls
 * Handles FLOOD_WAIT errors and implements exponential backoff
 */

export interface RateLimiterOptions {
  /** Maximum number of requests per second (default: 20) */
  maxRequestsPerSecond?: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds (default: 60000) */
  maxRetryDelay?: number;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

export class RateLimiter {
  private requestQueue: Array<() => void> = [];
  private lastRequestTime = 0;
  private minInterval: number;
  private maxRetries: number;
  private initialRetryDelay: number;
  private maxRetryDelay: number;
  private verbose: boolean;

  constructor(options: RateLimiterOptions = {}) {
    const maxRequestsPerSecond = options.maxRequestsPerSecond ?? 20;
    this.minInterval = 1000 / maxRequestsPerSecond;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialRetryDelay = options.initialRetryDelay ?? 1000;
    this.maxRetryDelay = options.maxRetryDelay ?? 60000;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Execute a function with rate limiting and automatic retry on FLOOD_WAIT
   */
  async execute<T>(fn: () => Promise<T>, context = "API call"): Promise<T> {
    return this.executeWithRetry(fn, context, 0);
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, context: string, attempt: number): Promise<T> {
    // Wait for rate limit
    await this.waitForSlot();

    try {
      const result = await fn();
      if (this.verbose && attempt > 0) {
        console.log(`[rate-limiter] ${context} succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error) {
      const err = error as Error;
      const errorMessage = err.message || String(error);

      // Check for FLOOD_WAIT error
      const floodMatch = errorMessage.match(/FLOOD_WAIT[_]?(\d+)/i);
      if (floodMatch) {
        const waitSeconds = Number.parseInt(floodMatch[1], 10);
        const waitMs = waitSeconds * 1000;

        if (attempt >= this.maxRetries) {
          throw new Error(
            `Rate limit exceeded after ${this.maxRetries} retries. Telegram requires ${waitSeconds}s wait. Try again later.`,
          );
        }

        console.warn(
          `[rate-limiter] FLOOD_WAIT detected for ${context}. Waiting ${waitSeconds}s (attempt ${attempt + 1}/${this.maxRetries})`,
        );

        await this.sleep(waitMs);
        return this.executeWithRetry(fn, context, attempt + 1);
      }

      // Check for network/timeout errors - retry with exponential backoff
      if (
        errorMessage.includes("TIMEOUT") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("ENETUNREACH") ||
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.toLowerCase().includes("network")
      ) {
        if (attempt >= this.maxRetries) {
          throw new Error(
            `Network error after ${this.maxRetries} retries: ${errorMessage}. Check your connection.`,
          );
        }

        const delay = Math.min(
          this.initialRetryDelay * Math.pow(2, attempt),
          this.maxRetryDelay,
        );

        if (this.verbose) {
          console.warn(
            `[rate-limiter] Network error for ${context}. Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`,
          );
        }

        await this.sleep(delay);
        return this.executeWithRetry(fn, context, attempt + 1);
      }

      // Check for temporary errors that should be retried
      if (
        errorMessage.includes("INTERNAL") ||
        errorMessage.includes("503") ||
        errorMessage.includes("502") ||
        errorMessage.includes("500")
      ) {
        if (attempt >= this.maxRetries) {
          throw new Error(
            `Temporary error after ${this.maxRetries} retries: ${errorMessage}`,
          );
        }

        const delay = Math.min(
          this.initialRetryDelay * Math.pow(2, attempt),
          this.maxRetryDelay,
        );

        if (this.verbose) {
          console.warn(
            `[rate-limiter] Temporary error for ${context}. Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`,
          );
        }

        await this.sleep(delay);
        return this.executeWithRetry(fn, context, attempt + 1);
      }

      // Not a retryable error, throw immediately
      throw error;
    }
  }

  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const delay = this.minInterval - timeSinceLastRequest;
      await this.sleep(delay);
    }

    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset the rate limiter state
   */
  reset(): void {
    this.lastRequestTime = 0;
    this.requestQueue = [];
  }
}
