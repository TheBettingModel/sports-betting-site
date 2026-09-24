import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  sendReviewEmailCode,
  startReviewPasswordSignIn,
  verifyReviewEmailCode,
} from '../lib/review-password-auth.ts';

function attempt({ nextStatus = 'complete', factors = [{ strategy: 'email_code' }] } = {}) {
  const calls = { password: 0, send: 0, verify: 0, finalize: 0 };
  const signIn = {
    status: 'needs_identifier',
    supportedSecondFactors: factors,
    password: async () => {
      calls.password++;
      signIn.status = nextStatus;
      return { error: null };
    },
    mfa: {
      sendEmailCode: async () => { calls.send++; return { error: null }; },
      verifyEmailCode: async () => { calls.verify++; signIn.status = 'complete'; return { error: null }; },
    },
    finalize: async () => { calls.finalize++; return { error: null }; },
  };
  return { signIn, calls };
}

describe('reviewer password sign-in', () => {
  it('finalizes without an email code when Clerk completed the password sign-in', async () => {
    const { signIn, calls } = attempt();
    assert.equal(await startReviewPasswordSignIn(signIn, 'review@example.com', 'test'), 'complete');
    assert.deepEqual(calls, { password: 1, send: 0, verify: 0, finalize: 1 });
  });

  for (const status of ['needs_second_factor', 'needs_client_trust']) {
    it(`sends an email code instead of finalizing when Clerk reports ${status}`, async () => {
      const { signIn, calls } = attempt({ nextStatus: status });
      assert.equal(await startReviewPasswordSignIn(signIn, 'review@example.com', 'test'), 'email_code_sent');
      assert.deepEqual(calls, { password: 1, send: 1, verify: 0, finalize: 0 });
      await verifyReviewEmailCode(signIn, '123456');
      assert.deepEqual(calls, { password: 1, send: 1, verify: 1, finalize: 1 });
    });
  }

  it('does not proceed for an unsupported second factor', async () => {
    const { signIn, calls } = attempt({ nextStatus: 'needs_second_factor', factors: [{ strategy: 'totp' }] });
    await assert.rejects(startReviewPasswordSignIn(signIn, 'review@example.com', 'test'), /different verification/);
    assert.equal(calls.send, 0);
    assert.equal(calls.finalize, 0);
  });

  it('does not finalize after a failed password or email verification', async () => {
    const { signIn, calls } = attempt({ nextStatus: 'needs_second_factor' });
    signIn.password = async () => ({ error: new Error('Invalid password') });
    await assert.rejects(startReviewPasswordSignIn(signIn, 'review@example.com', 'bad'), /Invalid password/);
    assert.equal(calls.finalize, 0);

    signIn.mfa.verifyEmailCode = async () => ({ error: new Error('Invalid code') });
    await assert.rejects(verifyReviewEmailCode(signIn, 'bad'), /Invalid code/);
    assert.equal(calls.finalize, 0);
  });

  it('requires a completed status after email verification and propagates resend errors', async () => {
    const { signIn, calls } = attempt({ nextStatus: 'needs_second_factor' });
    signIn.mfa.verifyEmailCode = async () => ({ error: null });
    await assert.rejects(verifyReviewEmailCode(signIn, '123456'), /did not complete/);
    assert.equal(calls.finalize, 0);
    signIn.mfa.sendEmailCode = async () => ({ error: new Error('Too many requests') });
    await assert.rejects(sendReviewEmailCode(signIn), /Too many requests/);
  });
});