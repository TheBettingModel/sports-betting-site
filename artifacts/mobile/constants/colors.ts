/**
 * TheBettingModel – black & green theme.
 * Lime green (#84CC16) matches the logo. Black background.
 *
 * Surface depth system:
 *   #000000  background (root)
 *   #0F0F0F  card / elevated surfaces
 *   #141414  secondary / muted fills
 *   #1E1E1E  borders, inputs, dividers
 */

const palette = {
  text: '#FFFFFF',
  tint: '#84CC16',

  // Core surfaces
  background: '#000000',
  foreground: '#FFFFFF',

  // Cards / elevated surfaces — slightly lighter than pure black
  card: '#0F0F0F',
  cardForeground: '#FFFFFF',

  // Primary — lime green (logo colour). Reserve for wins, CTAs, active states.
  primary: '#84CC16',
  primaryForeground: '#000000',

  // Secondary — mid-dark fill
  secondary: '#141414',
  secondaryForeground: '#F9FAFB',

  // Muted — same mid-dark for fills, gray for text
  muted: '#141414',
  mutedForeground: '#6B7280',

  // Accent — same as primary
  accent: '#84CC16',
  accentForeground: '#000000',

  // Destructive
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',

  // Borders and inputs
  border: '#1E1E1E',
  input: '#1E1E1E',

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
  radius: 14,
};

export default colors;
