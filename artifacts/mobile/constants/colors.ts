/**
 * TheBettingModel – black & green theme.
 * Lime green (#84CC16) matches the logo. Black background.
 */

const palette = {
  text: '#FFFFFF',
  tint: '#84CC16',

  // Core surfaces
  background: '#000000',
  foreground: '#FFFFFF',

  // Cards / elevated surfaces
  card: '#111111',
  cardForeground: '#FFFFFF',

  // Primary — lime green (logo colour)
  primary: '#84CC16',
  primaryForeground: '#000000',

  // Secondary
  secondary: '#1A1A1A',
  secondaryForeground: '#F9FAFB',

  // Muted
  muted: '#1A1A1A',
  mutedForeground: '#6B7280',

  // Accent
  accent: '#84CC16',
  accentForeground: '#000000',

  // Destructive
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',

  // Borders and inputs
  border: '#222222',
  input: '#222222',

  // Semantic win / loss
  win: '#84CC16',
  loss: '#EF4444',
  winBg: '#1A2600',
  lossBg: '#2D0A0A',

  // Green accent (logo lime)
  gold: '#84CC16',
  goldBg: '#1A2600',

  // Surface variants
  surface: '#0A0A0A',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 12,
};

export default colors;
