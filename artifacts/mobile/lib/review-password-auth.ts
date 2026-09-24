type SignInError = { message: string; longMessage?: string };

export type ReviewPasswordSignIn = {
  status: string | null;
  supportedSecondFactors: { strategy: string }[];
  password: (params: { emailAddress: string; password: string }) => Promise<{ error: SignInError | null }>;
  mfa: {
    sendEmailCode: () => Promise<{ error: SignInError | null }>;
    verifyEmailCode: (params: { code: string }) => Promise<{ error: SignInError | null }>;
  };
  finalize: () => Promise<{ error: SignInError | null }>;
};

export async function sendReviewEmailCode(signIn: ReviewPasswordSignIn): Promise<void> {
  const { error } = await signIn.mfa.sendEmailCode();
  if (error) throw error;
}

export async function startReviewPasswordSignIn(
  signIn: ReviewPasswordSignIn,
  emailAddress: string,
  password: string,
): Promise<'complete' | 'email_code_sent'> {
  const { error } = await signIn.password({ emailAddress, password });
  if (error) throw error;

  if (signIn.status === 'complete') {
    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) throw finalizeError;
    return 'complete';
  }

  if (signIn.status !== 'needs_second_factor' && signIn.status !== 'needs_client_trust') {
    throw new Error('Password sign-in did not complete. Please try again.');
  }
  if (!signIn.supportedSecondFactors.some(factor => factor.strategy === 'email_code')) {
    throw new Error('This account requires a different verification method.');
  }

  await sendReviewEmailCode(signIn);
  return 'email_code_sent';
}

export async function verifyReviewEmailCode(signIn: ReviewPasswordSignIn, code: string): Promise<void> {
  const { error } = await signIn.mfa.verifyEmailCode({ code });
  if (error) throw error;
  if (signIn.status !== 'complete') {
    throw new Error('Email verification did not complete sign-in. Please try again.');
  }
  const { error: finalizeError } = await signIn.finalize();
  if (finalizeError) throw finalizeError;
}