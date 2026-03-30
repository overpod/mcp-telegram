# Rate Limiting and Retry Logic

This MCP Telegram server now includes comprehensive rate limiting and automatic retry functionality to handle Telegram API constraints gracefully.

## Features

### 1. Rate Limiting
- **Default limit**: 20 requests per second
- **Automatic throttling**: Requests are automatically spaced to prevent rate limit violations
- **Per-instance configuration**: Can be customized when creating TelegramService

### 2. Automatic Retry on Errors

The rate limiter automatically retries on three types of errors:

#### FLOOD_WAIT Errors
When Telegram returns a `FLOOD_WAIT_X` error (where X is seconds to wait):
- **Automatic handling**: Waits the exact time specified by Telegram
- **Max retries**: 3 attempts by default
- **User feedback**: Clear error messages indicate wait time required

Example error message:
```
Rate limit exceeded after 3 retries. Telegram requires 30s wait. Try again later.
```

#### Network Errors
Temporary network issues (timeouts, connection refused, etc.):
- **Exponential backoff**: 1s → 2s → 4s between retries
- **Max delay**: Capped at 60 seconds
- **Auto-recovery**: Attempts to recover from transient network issues

Handled errors:
- `TIMEOUT`
- `ECONNREFUSED`
- `ENETUNREACH`
- `ENOTFOUND`
- Network-related errors

#### Temporary Server Errors
HTTP 5xx errors and internal server errors:
- **Exponential backoff**: Same as network errors
- **Auto-retry**: Up to 3 attempts

Handled status codes:
- 500 Internal Server Error
- 502 Bad Gateway
- 503 Service Unavailable
- Telegram `INTERNAL` errors

## Protected Methods

The following API methods are now protected with rate limiting and retry logic:

- `sendMessage()` - Send text messages
- `sendFile()` - Upload and send files
- `getMessages()` - Fetch message history
- `searchMessages()` - Search messages in chat
- `editMessage()` - Edit existing messages
- `deleteMessages()` - Delete messages

## Configuration

The rate limiter is configured in `TelegramService` constructor with these defaults:

```typescript
new RateLimiter({
  maxRequestsPerSecond: 20,    // 20 requests per second
  maxRetries: 3,                // Retry up to 3 times
  initialRetryDelay: 1000,      // Start with 1 second delay
  maxRetryDelay: 60000,         // Max 60 seconds between retries
  verbose: false,               // Set to true for detailed logging
})
```

## Implementation Details

### How it Works

1. **Request Queue**: Each API call passes through the rate limiter
2. **Automatic Spacing**: Minimum interval enforced between requests
3. **Error Detection**: Catches and categorizes errors
4. **Smart Retry**: Uses appropriate strategy based on error type
5. **User Feedback**: Clear error messages on failure

### Example Flow

```
User calls sendMessage()
  ↓
Rate limiter checks: Can we send now?
  ↓
Wait if needed (rate limiting)
  ↓
Execute API call
  ↓
Success? → Return result
  ↓
FLOOD_WAIT? → Wait specified time → Retry
  ↓
Network error? → Exponential backoff → Retry
  ↓
Other error? → Throw immediately
```

## Error Messages

### Rate Limit Exceeded
```
Rate limit exceeded after 3 retries. Telegram requires 10s wait. Try again later.
```

### Network Issues
```
Network error after 3 retries: TIMEOUT. Check your connection.
```

### Temporary Errors
```
Temporary error after 3 retries: INTERNAL
```

## Best Practices

1. **Don't disable retries** unless you have a specific reason
2. **Enable verbose logging** during development to monitor retry behavior
3. **Handle final errors** gracefully in your application
4. **Consider rate limits** when designing batch operations
5. **Use searchGlobal sparingly** as it's more rate-limited by Telegram

## Testing

Run the rate limiter test suite:

```bash
npm test src/__tests__/rate-limiter.test.ts
```

Tests cover:
- Basic execution
- Rate limiting enforcement
- FLOOD_WAIT retry behavior
- Network error retry with backoff
- Non-retryable error handling
- Error parsing and wait time extraction

## Monitoring

Enable verbose logging to see retry behavior:

```typescript
// In telegram-client.ts constructor
this.rateLimiter = new RateLimiter({
  verbose: true,  // Enable detailed logging
  // ... other options
});
```

Console output example:
```
[rate-limiter] FLOOD_WAIT detected for sendMessage to @username. Waiting 5s (attempt 1/3)
[rate-limiter] sendMessage to @username succeeded after 1 retries
```

## Limitations

- **No cross-instance coordination**: Each TelegramService instance has its own rate limiter
- **Conservative defaults**: Telegram's actual limits may be higher in some cases
- **Blocking behavior**: Retries block the current call (no background retry queue)

## Future Improvements

Potential enhancements (not yet implemented):
- Adaptive rate limiting based on actual Telegram responses
- Global rate limiter shared across multiple instances
- Priority queue for important requests
- Circuit breaker pattern for persistent failures
- Metrics and monitoring dashboard
