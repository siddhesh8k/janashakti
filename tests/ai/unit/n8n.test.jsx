import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch and console.error once for all tests
let fetchSpy;
let consoleErrorSpy;

beforeEach(() => {
  // Mock global fetch
  fetchSpy = vi.fn();
  global.fetch = fetchSpy;

  // Spy on console.error to check if it's called in error scenarios
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  // Reset modules before each test to ensure a fresh import of n8n.js.
  // This is crucial because the WEBHOOKS constant is defined at module load time
  // using `import.meta.env`, and we need to control these environment variables
  // for different test scenarios.
  vi.resetModules();
});

afterEach(() => {
  // Restore all mocks and unstub environment variables after each test
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('n8n utility functions', () => {
  it('should successfully trigger an n8n webhook and return the JSON response', async () => {
    // Stub environment variables for this specific test
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', 'http://mock-issue-webhook.com/issue');
    // Import the module *after* stubbing env vars to ensure WEBHOOKS is correctly initialized
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { id: 1, type: 'issue' };
    const mockResponse = { status: 'success', data: { id: 'n8n-workflow-id' } };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await triggerN8N('issue_intelligence', mockPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('http://mock-issue-webhook.com/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockPayload),
    });
    expect(result).toEqual(mockResponse);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return null if the workflowName does not exist in WEBHOOKS', async () => {
    // Stub env vars with valid URLs, but we'll call with a non-existent name
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', 'http://mock-issue-webhook.com/issue');
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { message: 'test' };
    const result = await triggerN8N('non_existent_workflow', mockPayload);

    expect(fetchSpy).not.toHaveBeenCalled(); // fetch should not be called
    expect(result).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return null if the webhook URL is undefined (from env var)', async () => {
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', undefined); // Explicitly set to undefined
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { data: 'test' };
    const result = await triggerN8N('issue_intelligence', mockPayload);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return null if the webhook URL is an empty string (from env var)', async () => {
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', ''); // Explicitly set to empty string
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { data: 'test' };
    const result = await triggerN8N('issue_intelligence', mockPayload);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return null if the webhook URL is the string "undefined" (from env var)', async () => {
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', 'undefined'); // Explicitly set to string "undefined"
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { data: 'test' };
    const result = await triggerN8N('issue_intelligence', mockPayload);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return null and log an error if fetch fails (network error)', async () => {
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', 'http://mock-issue-webhook.com/issue');
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { data: 'test' };
    const mockError = new Error('Network connection lost');

    fetchSpy.mockRejectedValueOnce(mockError);

    const result = await triggerN8N('issue_intelligence', mockPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[n8n] Webhook failed: issue_intelligence',
      mockError.message
    );
  });

  it('should return null if fetch returns a non-ok response (e.g., 400, 500)', async () => {
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', 'http://mock-issue-webhook.com/issue');
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { data: 'test' };

    fetchSpy.mockResolvedValueOnce({
      ok: false, // Simulate a non-OK HTTP status
      status: 400,
      json: () => Promise.resolve({ error: 'Bad Request' }),
    });

    const result = await triggerN8N('issue_intelligence', mockPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled(); // Non-ok response is not a network error or JSON parsing error
  });

  it('should return null and log an error if fetch returns ok but JSON parsing fails', async () => {
    vi.stubEnv('VITE_N8N_ISSUE_WEBHOOK', 'http://mock-issue-webhook.com/issue');
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const mockPayload = { data: 'test' };
    const jsonParseError = new Error('SyntaxError: Unexpected token < in JSON at position 0');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(jsonParseError), // Simulate JSON parsing failure
    });

    const result = await triggerN8N('issue_intelligence', mockPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[n8n] Webhook failed: issue_intelligence',
      jsonParseError.message
    );
  });

  it('should correctly handle different workflow names and their respective URLs', async () => {
    vi.stubEnv('VITE_N8N_SOCIAL_WEBHOOK', 'http://mock-social-webhook.com/social');
    vi.stubEnv('VITE_N8N_AUTH_WEBHOOK', 'http://mock-auth-webhook.com/auth');
    const { triggerN8N } = await import('../../../src/utils/n8n');

    const socialPayload = { message: 'New post' };
    const socialResponse = { status: 'posted' };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(socialResponse),
    });

    const socialResult = await triggerN8N('social_post', socialPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('http://mock-social-webhook.com/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(socialPayload),
    });
    expect(socialResult).toEqual(socialResponse);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // Test another workflow to ensure isolation and correct URL mapping
    fetchSpy.mockClear(); // Clear previous call
    const authPayload = { email: 'test@example.com' };
    const authResponse = { status: 'sent' };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(authResponse),
    });

    const authResult = await triggerN8N('authority_email', authPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('http://mock-auth-webhook.com/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authPayload),
    });
    expect(authResult).toEqual(authResponse);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});