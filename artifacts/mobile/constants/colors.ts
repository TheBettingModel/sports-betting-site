/**
 * TheBettingModel – white & green theme.
 * Lime green (#84CC16) matches the logo's accent colour.
 * Both light and dark resolve to the same light palette.
 */

const palette = {
  text: '#0F172A',
  tint: '#84CC16',

  // Core surfaces
  background: '#FFFFFF',
  foreground: '#0F172A',

  // Cards / elevated surfaces
  card: '#F8FAFC',
  cardForeground: '#0F172A',

  // Primary — lime green (logo colour)
  primary: '#84CC16',
  primaryForeground: '#FFFFFF',

  // Secondary — light slate
  secondary: '#F1F5F9',
  secondaryForeground: '#0F172A',

  // Muted
  muted: '#F1F5F9',
  mutedForeground: '#64748B',

  // Accent
  accent: '#84CC16',
  accentForeground: '#FFFFFF',

  // Destructive
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',

  // Borders and inputs
  border: '#E2E8F0',
  input: '#E2E8F0',

  // Semantic win / loss
  win: '#16A34A',
  loss: '#EF4444',
  winBg: '#DCFCE7',
  lossBg: '#FEE2E2',

  // Green accent (replaces gold)
  gold: '#84CC16',
  goldBg: '#ECFCCB',

  // Surface variants
  surface: '#F8FAFC',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 12,
};

export default colors;
