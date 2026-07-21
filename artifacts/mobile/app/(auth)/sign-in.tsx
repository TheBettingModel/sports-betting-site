import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useSignIn, useSSO } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

// Required for Android — completes any pending browser sessions
WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

const COLORS = {
  bg: '#000000',
  card: '#111111',
  primary: '#84CC16',
  primaryFg: '#000000',
  border: '#2A2A2A',
  fg: '#FFFFFF',
  muted: '#6B7280',
  error: '#EF4444',
  inputBg: '#1A1A1A',
};

export default function SignInScreen() {
  useWarmUpBrowser();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState<'google' | 'apple' | null>(null);

  // Guard: Clerk not yet loaded
  if (!signIn) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // ── Email/password sign-in ────────────────────────────────────────────────
  const handleSignIn = async () => {
    setGeneralError(null);
    try {
      const { error } = await signIn.password({ emailAddress: email, password });
      if (error) {
        setGeneralError(error.message || 'Sign-in failed. Please check your credentials.');
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize({
          navigate: () => { router.replace('/(tabs)'); },
        });
      } else {
        // Unexpected state — surface it so we can diagnose
        setGeneralError(`Unexpected sign-in state: ${signIn.status ?? 'unknown'}. Please try again.`);
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'An unexpected error occurred. Please try again.';
      setGeneralError(msg);
    }
  };

  const handleVerify = async () => {
    setGeneralError(null);
    try {
      await signIn.mfa.verifyEmailCode({ code: verifyCode });
      if (signIn.status === 'complete') {
        await signIn.finalize({
          navigate: () => { router.replace('/(tabs)'); },
        });
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Verification failed.';
      setGeneralError(msg);
    }
  };

  // ── SSO ───────────────────────────────────────────────────────────────────
  const handleSSO = useCallback(async (strategy: 'oauth_google' | 'oauth_apple') => {
    setSsoLoading(strategy === 'oauth_google' ? 'google' : 'apple');
    setGeneralError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId) {
        await setActive!({
          session: createdSessionId,
          navigate: async () => { router.replace('/(tabs)'); },
        });
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'SSO sign-in failed.';
      setGeneralError(msg);
    } finally {
      setSsoLoading(null);
    }
  }, [startSSOFlow, router]);

  // ── MFA / client trust verification step ─────────────────────────────────
  if (signIn.status === 'needs_client_trust') {
    return (
      <View style={s.root}>
        <View style={s.verifyCard}>
          <Text style={s.title}>Check your email</Text>
          <Text style={s.subtitle}>Enter the verification code we sent to your inbox.</Text>
          <TextInput
            style={s.input}
            value={verifyCode}
            placeholder="6-digit code"
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
            onChangeText={setVerifyCode}
          />
          {errors?.fields?.code && <Text style={s.error}>{errors.fields.code.message}</Text>}
          {generalError && <Text style={s.error}>{generalError}</Text>}
          <Pressable style={[s.primaryBtn, !verifyCode && s.btnDisabled]} onPress={handleVerify} disabled={!verifyCode}>
            <Text style={s.primaryBtnText}>Verify</Text>
          </Pressable>
          <Pressable onPress={() => signIn.mfa.sendEmailCode()} style={s.textBtn}>
            <Text style={s.textBtnText}>Resend code</Text>
          </Pressable>
          <Pressable onPress={() => signIn.reset()} style={s.textBtn}>
            <Text style={s.textBtnText}>Start over</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isFetching = fetchStatus === 'fetching';
  const canSubmit = !!email && !!password && !isFetching;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <Image source={require('@/assets/images/icon.png')} style={s.logo} resizeMode="contain" />

        <Text style={s.title}>Welcome back</Text>
        <Text style={s.subtitle}>Sign in to your TBM account</Text>

        {/* Social buttons */}
        <Pressable
          style={[s.socialBtn, ssoLoading === 'google' && s.btnDisabled]}
          onPress={() => handleSSO('oauth_google')}
          disabled={ssoLoading !== null}
        >
          {ssoLoading === 'google'
            ? <ActivityIndicator size="small" color={COLORS.fg} />
            : <Feather name="globe" size={18} color={COLORS.fg} />}
          <Text style={s.socialBtnText}>Continue with Google</Text>
        </Pressable>

        {Platform.OS === 'ios' && (
          <Pressable
            style={[s.socialBtn, ssoLoading === 'apple' && s.btnDisabled]}
            onPress={() => handleSSO('oauth_apple')}
            disabled={ssoLoading !== null}
          >
            {ssoLoading === 'apple'
              ? <ActivityIndicator size="small" color={COLORS.fg} />
              : <Feather name="smartphone" size={18} color={COLORS.fg} />}
            <Text style={s.socialBtnText}>Continue with Apple</Text>
          </Pressable>
        )}

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        {/* General error banner */}
        {generalError && (
          <View style={s.errorBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.error} />
            <Text style={s.errorBannerText}>{generalError}</Text>
          </View>
        )}

        {/* Email */}
        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {errors?.fields?.identifier && <Text style={s.error}>{errors.fields.identifier.message}</Text>}

        {/* Password */}
        <Text style={s.label}>Password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={COLORS.muted}
            secureTextEntry={!showPassword}
            autoComplete="password"
          />
          <Pressable onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={COLORS.muted} />
          </Pressable>
        </View>
        {errors?.fields?.password && <Text style={s.error}>{errors.fields.password.message}</Text>}

        {/* Sign in */}
        <Pressable style={[s.primaryBtn, !canSubmit && s.btnDisabled]} onPress={handleSignIn} disabled={!canSubmit}>
          {isFetching
            ? <ActivityIndicator size="small" color={COLORS.primaryFg} />
            : <Text style={s.primaryBtnText}>Sign In</Text>}
        </Pressable>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text style={s.footerLink}>Sign up</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  logo: { width: 80, height: 80, borderRadius: 16, alignSelf: 'center', marginBottom: 28 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: COLORS.fg, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: COLORS.muted, textAlign: 'center', marginBottom: 28 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingVertical: 14, marginBottom: 12, backgroundColor: COLORS.card,
  },
  socialBtnText: { color: COLORS.fg, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.muted, fontSize: 13, fontFamily: 'Inter_400Regular' },
  label: { color: COLORS.muted, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input: {
    backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    color: COLORS.fg, fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 14,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  eyeBtn: { padding: 8 },
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 4, marginBottom: 20,
  },
  primaryBtnText: { color: COLORS.primaryFg, fontSize: 16, fontFamily: 'Inter_700Bold' },
  btnDisabled: { opacity: 0.45 },
  error: { color: COLORS.error, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -8, marginBottom: 8 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#1A0000', borderWidth: 1, borderColor: COLORS.error,
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorBannerText: { color: COLORS.error, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: COLORS.muted, fontSize: 14, fontFamily: 'Inter_400Regular' },
  footerLink: { color: COLORS.primary, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  verifyCard: { flex: 1, padding: 24, justifyContent: 'center' },
  textBtn: { paddingVertical: 10, alignItems: 'center' },
  textBtnText: { color: COLORS.muted, fontSize: 14, fontFamily: 'Inter_400Regular' },
});
