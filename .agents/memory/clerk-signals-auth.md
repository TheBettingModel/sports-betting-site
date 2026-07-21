---
name: Clerk expo auth flow (signals API)
description: Correct auth flow for @clerk/expo 3.7.x using the signals API — no password, email OTP + Google OAuth
---

## Instance config
- Email OTP + Google OAuth only (no password, no Apple configured)
- Check via GET /api/__clerk/v1/environment → user_settings.attributes.email_address.first_factors = ["email_code"]

## Hook shape (signals API — NOT the old useSignIn/useSignUp)
- useSignIn() → { signIn: SignInFutureResource, errors, fetchStatus }  (no setActive, no isLoaded)
- useSignUp() → { signUp: SignUpFutureResource, errors, fetchStatus }
- All methods return { error: ClerkError | null } — status read from signIn.status after the call
- Cast with `as any` to avoid TS noise; do NOT destructure setActive/isLoaded from these hooks

## Sign-in email OTP
```
signIn.emailCode.sendCode({ emailAddress })   // step 1: create + send in one call
signIn.emailCode.verifyCode({ code })          // step 2: verify
signIn.finalize()                              // step 3: activate session (replaces setActive)
router.replace('/(tabs)')
```

## Sign-up email OTP
```
signUp.create({ emailAddress })               // step 1
signUp.verifications.sendEmailCode()          // step 2: no params
signUp.verifications.verifyEmailCode({ code })// step 3
signUp.finalize()                             // step 4: activate
router.replace('/(tabs)')
```

## Google SSO (useSSO hook — unchanged API)
```
startSSOFlow({ strategy: 'oauth_google', redirectUrl: AuthSession.makeRedirectUri() })
→ { createdSessionId, setActive }
await setActive({ session: createdSessionId })
```
Handle err.code === 'session_exists' or 'identifier_already_signed_in' → navigate to tabs (session is valid).

## Proxy body encoding (api-server clerk-proxy.ts) — CRITICAL
Express parses incoming bodies. Proxy must re-encode as URLSearchParams for form-encoded requests,
NOT JSON.stringify. Sending JSON to Clerk causes 422 form_param_unknown on every auth call.
**Why:** Clerk mobile SDK sends sign_ins, prepare_verification etc. as application/x-www-form-urlencoded.
