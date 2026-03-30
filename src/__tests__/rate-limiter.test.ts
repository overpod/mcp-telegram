import { describe, it } from "node:test";
import assert from "node:assert";
import { RateLimiter } from "../rate-limiter.js";

describe("RateLimiter", () => {
  it("should execute a function successfully", async () => {
    const limiter = new RateLimiter({ maxRequestsPerSecond: 100 });
    const result = await limiter.execute(async () => "success");
    assert.strictEqual(result, "success");
  });

  it("should enforce rate limiting between requests", async () => {
    const limiter = new RateLimiter({ maxRequestsPerSecond: 10 }); // 10 req/s = 100ms between requests
    const start = Date.now();
    
    await limiter.execute(async () => "first");
    await limiter.execute(async () => "second");
    
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 100, `Expected at least 100ms, got ${elapsed}ms`);
  });

  it("should retry on FLOOD_WAIT error", async () => {
    const limiter = new RateLimiter({ maxRetries: 2, maxRequestsPerSecond: 100 });
    let attempts = 0;
    
    const result = await limiter.execute(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("FLOOD_WAIT_1");
      }
      return "success after retry";
    });
    
    assert.strictEqual(result, "success after retry");
    assert.strictEqual(attempts, 2);
  });

  it("should throw after max retries on FLOOD_WAIT", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, maxRequestsPerSecond: 100 });
    
    await assert.rejects(
      async () => {
        await limiter.execute(async () => {
          throw new Error("FLOOD_WAIT_2");
        });
      },
      {
        message: /Rate limit exceeded after 1 retries/,
      },
    );
  });

  it("should retry on network errors with exponential backoff", async () => {
    const limiter = new RateLimiter({ 
      maxRetries: 2, 
      initialRetryDelay: 100,
      maxRequestsPerSecond: 100,
    });
    let attempts = 0;
    
    const result = await limiter.execute(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("TIMEOUT");
      }
      return "recovered";
    });
    
    assert.strictEqual(result, "recovered");
    assert.strictEqual(attempts, 2);
  });

  it("should not retry on non-retryable errors", async () => {
    const limiter = new RateLimiter({ maxRetries: 3, maxRequestsPerSecond: 100 });
    let attempts = 0;
    
    await assert.rejects(
      async () => {
        await limiter.execute(async () => {
          attempts++;
          throw new Error("AUTH_KEY_UNREGISTERED");
        });
      },
      {
        message: "AUTH_KEY_UNREGISTERED",
      },
    );
    
    assert.strictEqual(attempts, 1, "Should not retry non-retryable errors");
  });

  it("should handle FLOOD_WAIT with seconds parsing", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, maxRequestsPerSecond: 100 });
    
    // Should always throw FLOOD_WAIT error and retry once, then fail
    await assert.rejects(
      async () => {
        await limiter.execute(async () => {
          throw new Error("FLOOD_WAIT_10");
        });
      },
      {
        message: /Telegram requires 10s wait/,
      },
    );
  });
});
