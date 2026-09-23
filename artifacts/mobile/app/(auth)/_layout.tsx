import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';

export default function AuthLayout() {
  const { isSignedIn } = useAuth();

  // Already logged in — send straight to the app
  if (isSignedIn) return <Redirect href="/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
