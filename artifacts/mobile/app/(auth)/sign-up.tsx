import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useClerk, useSignUp, useSSO } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

const COLORS = {
  bg: '#000000', card: '#111111', primary: '#84CC16',
  primaryFg: '#000000', border: '#2A2A2A', fg: '#FFFFFF',
  muted: '#6B7280', error: '#EF4444', inputBg: '#1A1A1A',
  info: '#3B82F6',
};

type Stage = 'form' | 'verify';

export default function SignUpScreen() {
  useWarmUpBrowser();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState<'google' | 'apple' | null>(null);

  if (!signUp) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const handleSignUp = async () => {
    setGeneralError(null);
    setInfoMessage(null);
    setIsLoading(true);
    try {
      const result = await signUp.create({ emailAddress: email, password });

      // Account created and immediately verified — activate session
      if (result.status === 'complete') {
        await clerk.setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
        return;
      }

      // Email verification required
      if (result.unverifiedFields?.includes('email_address')) {
        try {
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          // Code sent — show verify screen
          setStage('verify');
        } catch {
          // prepare_verification failed (may be rate-limited or code already sent).
          // Proceed to verify screen anyway — a code may have been sent on a
          // previous attempt. In Clerk's development environment the code is
          // visible in the Clerk dashboard; the test code is often 424242.
          setInfoMessage(
            'A verification code may have already been sent to your email. ' +
            'Enter it below to continue. (Dev mode: try code 424242)'
          );
          setStage('verify');
        }
        return;
      }

      // Unexpected state — show details so we can debug
      const detail = `status=${result.status}, missing=${JSON.stringify(result.missingFields)}`;
      Alert.alert('Unexpected sign-up state', detail);
      setGeneralError(`Unexpected state: ${result.status}. Please try Google sign-up.`);
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Sign-up failed. Please check your details.';
      Alert.alert('Sign-up Error', msg);
      setGeneralError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    setGeneralError(null);
    setIsLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await clerk.setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setGeneralError(`Verification incomplete (status: ${result.status}). Please try again.`);
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Verification failed. Please check the code and try again.';
      Alert.alert('Verification Error', msg);
      setGeneralError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setInfoMessage('A new code has been sent.');
      setGeneralError(null);
    } catch (err: any) {
      setGeneralError('Could not resend code. Please go back and try again.');
    }
  };

  const handleSSO = useCallback(async (strategy: 'oauth_google' | 'oauth_apple') => {
    setSsoLoading(strategy === 'oauth_google' ? 'google' : 'apple');
    setGeneralError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/(tabs)');
      } else {
        setGeneralError('SSO did not complete. Please try again.');
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'SSO sign-up failed.';
      Alert.alert('SSO Error', msg);
      setGeneralError(msg);
    } finally {
      setSsoLoading(null);
    }
  }, [startSSOFlow, router]);

  // ── Email verification screen ─────────────────────────────────────────────
  if (stage === 'verify') {
    return (
      <View style={s.root}>
        <View style={s.verifyContainer}>
          <Image source={require('@/assets/images/icon.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.title}>Verify your email</Text>
          <Text style={s.subtitle}>Enter the code sent to {email}.</Text>

          {infoMessage && (
            <View style={s.infoBanner}>
              <Feather name="info" size={14} color={COLORS.info} />
              <Text style={s.infoBannerText}>{infoMessage}</Text>
            </View>
          )}

          {generalError && (
            <View style={s.errorBanner}>
              <Feather name="alert-circle" size={14} color={COLORS.error} />
              <Text style={s.errorBannerText}>{generalError}</Text>
            </View>
          )}

          <Text style={s.label}>Verification code</Text>
          <TextInput
            style={s.input}
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
            autoFocus
          />

          <Pressable
            style={[s.primaryBtn, (!code || isLoading) && s.btnDisabled]}
            onPress={handleVerify}
            disabled={!code || isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color={COLORS.primaryFg} />
              : <Text style={s.primaryBtnText}>Confirm Email</Text>}
          </Pressable>

          <Pressable onPress={handleResend} style={s.textBtn}>
            <Text style={s.textBtnText}>Resend code</Text>
          </Pressable>

          <Pressable onPress={() => { setStage('form'); setGeneralError(null); setInfoMessage(null); }} style={s.textBtn}>
            <Text style={s.textBtnText}>← Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Sign-up form ──────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require('@/assets/images/icon.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>Create your account</Text>
        <Text style={s.subtitle}>Join TBM — AI-powered sports picks</Text>

        {/* SSO — recommended, bypasses email verification */}
        <Pressable
          style={[s.socialBtn, ssoLoading === 'google' && s.btnDisabled]}
          onPress={() => handleSSO('oauth_google')}
          disabled={ssoLoading !== null || isLoading}
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
            disabled={ssoLoading !== null || isLoading}
          >
            {ssoLoading === 'apple'
              ? <ActivityIndicator size="small" color={COLORS.fg} />
              : <Feather name="smartphone" size={18} color={COLORS.fg} />}
            <Text style={s.socialBtnText}>Continue with Apple</Text>
          </Pressable>
        )}

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or email</Text>
          <View style={s.dividerLine} />
        </View>

        {generalError && (
          <View style={s.errorBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.error} />
            <Text style={s.errorBannerText}>{generalError}</Text>
          </View>
        )}

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

        <Text style={s.label}>Password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Create a password (8+ chars)"
            placeholderTextColor={COLORS.muted}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
          />
          <Pressable onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={COLORS.muted} />
          </Pressable>
        </View>

        <Pressable
          style={[s.primaryBtn, (!email || !password || isLoading) && s.btnDisabled]}
          onPress={handleSignUp}
          disabled={!email || !password || isLoading}
        >
          {isLoading
            ? <ActivityIndicator size="small" color={COLORS.primaryFg} />
            : <Text style={s.primaryBtnText}>Create Account</Text>}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account? </Text>
          <Link href="/(auth)/sign-in"><Text style={s.footerLink}>Sign in</Text></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  verifyContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 },
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
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#1A0000', borderWidth: 1, borderColor: COLORS.error,
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorBannerText: { color: COLORS.error, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#0A1628', borderWidth: 1, borderColor: COLORS.info,
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  infoBannerText: { color: COLORS.info, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: COLORS.muted, fontSize: 14, fontFamily: 'Inter_400Regular' },
  footerLink: { color: COLORS.primary, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  textBtn: { paddingVertical: 10, alignItems: 'center' },
  textBtnText: { color: COLORS.muted, fontSize: 14, fontFamily: 'Inter_400Regular' },
});
