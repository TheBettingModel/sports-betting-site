/**
 * Sign-up screen — Clerk signals API (@clerk/expo 3.7.x)
 *
 * Supported strategies (from Clerk environment):
 *   • Email OTP  — create → sendEmailCode → verifyEmailCode → finalize
 *   • Google SSO — startSSOFlow → setActive
 */
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
import { useAuth, useSignUp, useSSO } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

const C = {
  bg: '#000000', card: '#111111', primary: '#84CC16',
  primaryFg: '#000000', border: '#2A2A2A', fg: '#FFFFFF',
  muted: '#6B7280', error: '#EF4444', inputBg: '#1A1A1A',
};

type Stage = 'email' | 'code';

export default function SignUpScreen() {
  useWarmUpBrowser();
  // Clerk signals API: useSignUp returns { signUp, errors, fetchStatus }
  const { signUp } = useSignUp() as any;
  const { startSSOFlow } = useSSO();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>('email');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // ── Step 1: create account + send OTP ────────────────────────────────────
  const handleStart = async () => {
    if (!signUp || !email.trim()) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      // Create the sign-up
      const { error: createError } = await signUp.create({ emailAddress: email.trim() });
      if (createError) {
        const code = createError.code ?? '';
        const msg = createError.longMessage ?? createError.message ?? '';
        if (code === 'form_identifier_exists' || msg.toLowerCase().includes('already exists')) {
          setErrorMsg('An account with this email already exists. Please sign in.');
        } else {
          setErrorMsg(msg || 'Could not create account. Please try again.');
        }
        return;
      }

      // Send the verification code
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setErrorMsg(sendError.longMessage ?? sendError.message ?? 'Could not send verification code.');
        return;
      }

      setStage('code');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Could not create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ────────────────────────────────────────────────────
  const handleVerifyCode = async () => {
    if (!signUp || !code.trim()) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (verifyError) {
        setErrorMsg(verifyError.longMessage ?? verifyError.message ?? 'Invalid code.');
        return;
      }

      // Activate the new session
      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) {
        setErrorMsg(finalizeError.longMessage ?? finalizeError.message ?? 'Could not complete sign-up.');
        return;
      }

      router.replace('/(tabs)');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!signUp) return;
    setLoading(true);
    const { error } = await signUp.verifications.sendEmailCode().catch((e: any) => ({ error: e }));
    if (error) setErrorMsg(error?.message ?? 'Could not resend code.');
    setLoading(false);
  };

  // ── Apple SSO (required by App Store Guideline 4.8) ──────────────────────
  const handleApple = useCallback(async () => {
    setAppleLoading(true);
    setErrorMsg(null);
    try {
      const result = await startSSOFlow({
        strategy: 'oauth_apple',
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      const { createdSessionId, setActive } = result as any;

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/(tabs)');
        return;
      }

      if (isSignedIn) {
        router.replace('/(tabs)');
        return;
      }

      setErrorMsg('Apple sign-in did not complete. Please try again.');
    } catch (err: any) {
      const errCode = err?.errors?.[0]?.code ?? '';
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        '';

      if (
        errCode === 'session_exists' ||
        errCode === 'identifier_already_signed_in' ||
        msg.toLowerCase().includes('already signed in') ||
        msg.toLowerCase().includes('session exists')
      ) {
        router.replace('/(tabs)');
        return;
      }

      if (msg) {
        Alert.alert('Apple sign-in error', msg);
        setErrorMsg(msg);
      } else {
        setErrorMsg('Apple sign-in failed. Please try again.');
      }
    } finally {
      setAppleLoading(false);
    }
  }, [startSSOFlow, router, isSignedIn]);

  // ── Google SSO ────────────────────────────────────────────────────────────
  const handleGoogle = useCallback(async () => {
    setSsoLoading(true);
    setErrorMsg(null);
    try {
      const result = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      const { createdSessionId, setActive } = result as any;

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/(tabs)');
        return;
      }

      if (isSignedIn) {
        router.replace('/(tabs)');
        return;
      }

      setErrorMsg('Google sign-in did not complete. Please try again.');
    } catch (err: any) {
      const errCode = err?.errors?.[0]?.code ?? '';
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        '';

      if (
        errCode === 'session_exists' ||
        errCode === 'identifier_already_signed_in' ||
        msg.toLowerCase().includes('already signed in') ||
        msg.toLowerCase().includes('session exists')
      ) {
        router.replace('/(tabs)');
        return;
      }

      if (msg) {
        Alert.alert('Google sign-in error', msg);
        setErrorMsg(msg);
      } else {
        setErrorMsg('Google sign-in failed. Please try again.');
      }
    } finally {
      setSsoLoading(false);
    }
  }, [startSSOFlow, router, isSignedIn]);

  // ── Verify code screen ────────────────────────────────────────────────────
  if (stage === 'code') {
    return (
      <View style={s.root}>
        <View style={s.verifyWrap}>
          <Image source={require('@/assets/images/icon.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.title}>Verify your email</Text>
          <Text style={s.sub}>
            We sent a 6-digit code to {email}.{'\n'}Enter it below to create your account.
          </Text>

          {errorMsg && <ErrBanner msg={errorMsg} />}

          <Text style={s.label}>Verification code</Text>
          <TextInput
            style={s.input}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={C.muted}
            keyboardType="numeric"
            autoFocus
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleVerifyCode}
          />

          <Pressable
            style={[s.btn, (!code.trim() || loading) && s.off]}
            onPress={handleVerifyCode}
            disabled={!code.trim() || loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={C.primaryFg} />
              : <Text style={s.btnTxt}>Create Account</Text>}
          </Pressable>

          <Pressable onPress={handleResend} style={s.link} disabled={loading}>
            <Text style={s.linkTxt}>Resend code</Text>
          </Pressable>
          <Pressable onPress={() => { setStage('email'); setCode(''); setErrorMsg(null); }} style={s.link}>
            <Text style={s.linkTxt}>← Change email</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Email screen ──────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require('@/assets/images/icon.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>Create your account</Text>
        <Text style={s.sub}>Join TBM — AI-powered sports picks</Text>

        {/* Sign in with Apple — required by App Store Guideline 4.8 */}
        <Pressable
          style={[s.social, s.appleSocial, (appleLoading || ssoLoading) && s.off]}
          onPress={handleApple}
          disabled={appleLoading || ssoLoading || loading}
        >
          {appleLoading
            ? <ActivityIndicator size="small" color="#000" />
            : <AntDesign name="apple" size={18} color="#000" />}
          <Text style={s.appleSocialTxt}>Continue with Apple</Text>
        </Pressable>

        <Pressable
          style={[s.social, (ssoLoading || appleLoading) && s.off]}
          onPress={handleGoogle}
          disabled={ssoLoading || appleLoading || loading}
        >
          {ssoLoading
            ? <ActivityIndicator size="small" color={C.fg} />
            : <Feather name="globe" size={18} color={C.fg} />}
          <Text style={s.socialTxt}>Continue with Google</Text>
        </Pressable>

        <Row />

        {errorMsg && <ErrBanner msg={errorMsg} />}

        <Text style={s.label}>Email address</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={handleStart}
        />

        <Pressable
          style={[s.btn, (!email.trim() || loading) && s.off]}
          onPress={handleStart}
          disabled={!email.trim() || loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={C.primaryFg} />
            : <Text style={s.btnTxt}>Send Verification Code</Text>}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerTxt}>Already have an account? </Text>
          <Link href="/(auth)/sign-in"><Text style={s.footerLink}>Sign in</Text></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row() {
  return (
    <View style={s.divider}>
      <View style={s.divLine} />
      <Text style={s.divTxt}>or use email</Text>
      <View style={s.divLine} />
    </View>
  );
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <View style={s.errBox}>
      <Feather name="alert-circle" size={14} color={C.error} />
      <Text style={s.errTxt}>{msg}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 40 },
  verifyWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 },
  logo: { width: 72, height: 72, borderRadius: 16, alignSelf: 'center', marginBottom: 28 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', color: C.fg, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 14, fontFamily: 'Inter_400Regular', color: C.muted, textAlign: 'center', marginBottom: 28 },
  social: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingVertical: 14, backgroundColor: C.card, marginBottom: 12,
  },
  appleSocial: {
    backgroundColor: '#FFFFFF', borderColor: '#FFFFFF',
  },
  socialTxt: { color: C.fg, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  appleSocialTxt: { color: '#000000', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  divLine: { flex: 1, height: 1, backgroundColor: C.border },
  divTxt: { color: C.muted, fontSize: 12, fontFamily: 'Inter_400Regular' },
  label: { color: C.muted, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input: {
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, color: C.fg,
    fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 14,
  },
  btn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginBottom: 16,
  },
  btnTxt: { color: C.primaryFg, fontSize: 16, fontFamily: 'Inter_700Bold' },
  off: { opacity: 0.45 },
  errBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#1A0000', borderWidth: 1, borderColor: C.error,
    borderRadius: 10, padding: 12, marginBottom: 14,
  },
  errTxt: { color: C.error, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerTxt: { color: C.muted, fontSize: 14, fontFamily: 'Inter_400Regular' },
  footerLink: { color: C.primary, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  link: { paddingVertical: 10, alignItems: 'center' },
  linkTxt: { color: C.muted, fontSize: 14, fontFamily: 'Inter_400Regular' },
});
