// Today tab has been merged into the Picks tab.
// This redirect ensures any deep links to "/" still work.
import { Redirect } from 'expo-router';
export default function Index() {
  return <Redirect href="/(tabs)/picks" />;
}
