# Testing Guide

## Overview

This project uses Node.js's built-in test runner with TypeScript support via `tsx`. Tests are colocated with source files in `__tests__` directories.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Test Structure

Tests are organized under `src/__tests__/` with the same directory structure as the source code:

```
src/
├── tools/
│   ├── shared.ts
│   └── __tests__/
│       └── shared.test.ts
```

## Writing Tests

Tests use Node.js's built-in test runner:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('feature name', () => {
  it('should do something', () => {
    assert.strictEqual(actual, expected);
  });
});
```

### Assertion Methods

- `assert.strictEqual(actual, expected)` - strict equality (===)
- `assert.deepStrictEqual(actual, expected)` - deep object comparison
- `assert.ok(value)` - truthy check
- `assert.throws(fn)` - expects function to throw
- `assert.rejects(promise)` - expects promise to reject

## Test Categories

### Unit Tests

Test individual functions and utilities in isolation:

- `src/__tests__/tools/shared.test.ts` - Utility functions (ok, fail, sanitize, formatReactions)

### Integration Tests

Test interactions between components (TODO):

- Telegram client connection handling
- Tool registration and execution
- MCP server integration

### Mock Strategies

For testing code that depends on Telegram API:

1. **Mock TelegramService** - Create test doubles for the client
2. **Test fixtures** - Use sample data that mirrors real Telegram responses
3. **Interface testing** - Verify correct API calls without hitting real servers

## Coverage Goals

- Core utilities: 100% coverage
- Tool handlers: >80% coverage  
- Integration paths: Key workflows tested

## Adding New Tests

When adding features:

1. Create a corresponding `.test.ts` file
2. Test both success and error cases
3. Include edge cases (empty input, invalid data)
4. Document any mocking or test setup requirements

## Continuous Integration

Tests run automatically on:

- Pre-commit (future: add git hook)
- Pull request validation (future: add CI workflow)
- Pre-publish (existing: `prepublishOnly` script)
