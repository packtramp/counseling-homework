/**
 * Regression guards for the 2026-08-03 partner-request hardening.
 *
 * These read the actual source files rather than mocking, because what is being asserted
 * is the ABSENCE of code — a mock would happily pass while the hole was reintroduced.
 *
 * Original chain (critical): send-partner-request returned the capability token, and the
 * GET "magic link" accept path in partner-response had no authentication and never checked
 * that the caller was the request's target. Together: any self-registered stranger could
 * link themselves to any user and read that person's counseling content.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../api');
const read = (f) => readFileSync(resolve(apiDir, f), 'utf8');

describe('send-partner-request no longer leaks the capability token', () => {
  const src = read('send-partner-request.js');

  it('does not return the token in the response body', () => {
    // Matches `token` used as a PROPERTY (shorthand `, token }` or `token: x`), not the
    // bare word — error strings like "Invalid token" are legitimate and must not trip this.
    expect(src).not.toMatch(/json\([^)]*\btoken\s*[,}]/);
    expect(src).not.toMatch(/json\([^)]*\btoken\s*:/);
  });

  it('still creates the request (the feature is intact, not deleted)', () => {
    expect(src).toContain("collection('partnerRequests')");
    expect(src).toContain('crypto.randomUUID()');
  });

  it('still verifies the caller is the requester', () => {
    expect(src).toContain('callerUid !== requesterUid');
  });
});

describe('partner-response: the unauthenticated GET accept path is gone', () => {
  const src = read('partner-response.js');

  it('has no GET branch reading token/action from the query string', () => {
    expect(src).not.toMatch(/req\.query\.\s*token/);
    expect(src).not.toMatch(/const\s*\{\s*token\s*,\s*action\s*\}\s*=\s*req\.query/);
  });

  it('rejects GET with 405 instead of processing it', () => {
    expect(src).toMatch(/Method not allowed/);
  });

  it('no longer contains the XSS-prone HTML responder', () => {
    expect(src).not.toContain('function htmlResponse');
    expect(src).not.toMatch(/<html/i);
  });

  it('KEEPS the authenticated POST path and its target check', () => {
    expect(src).toContain('handleAuthenticatedResponse');
    expect(src).toContain('verifyIdToken');
    expect(src).toContain('request.targetUid !== callerUid');
  });

  it('KEEPS the Twilio SMS reply path and its signature verification', () => {
    expect(src).toContain('handleSmsReply');
    expect(src).toContain('timingSafeEqual');
  });
});
