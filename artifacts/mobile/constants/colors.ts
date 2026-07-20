/**
 * TheBettingModel – dark sports-analytics theme.
 * Both light and dark resolve to the same dark palette so the app
 * always looks dark regardless of the device's system setting.
 */

const palette = {
  text: '#FFFFFF',
  tint: '#F59E0B',

  // Core surfaces
  background: '#080B14',
  foreground: '#FFFFFF',

  // Cards / elevated surfaces
  card: '#111827',
  cardForeground: '#FFFFFF',

  // Primary — amber/gold
  primary: '#F59E0B',
  primaryForeground: '#080B14',

  // Secondary — dark gray
  secondary: '#1F2937',
  secondaryForeground: '#F9FAFB',

  // Muted
  muted: '#1F2937',
  mutedForeground: '#6B7280',

  // Accent
  accent: '#F59E0B',
  accentForeground: '#080B14',

  // Destructive
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',

  // Borders and inputs
  border: '#1F2937',
  input: '#1F2937',

  // Semantic win / loss
  win: '#10B981',
  loss: '#EF4444',
  winBg: '#052E16',
  lossBg: '#450A0A',

  // Gold accent
  gold: '#F59E0B',
  goldBg: '#451A03',

  // Surface variants
  surface: '#0D1421',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 12,
};

export default colors;
