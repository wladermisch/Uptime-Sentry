import { createTheme, alpha, PaletteMode, Shadows } from '@mui/material/styles';

declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    highlighted: true;
  }
}
declare module '@mui/material/styles' {
  interface ColorRange {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  }

  interface PaletteColor extends ColorRange {}

  interface Palette {
    baseShadow: string;
  }
}

const defaultTheme = createTheme();

/*
 * Gate Board world.
 * One stepped neutral ramp serves both schemes; no ad-hoc greys elsewhere.
 * Red means down and only down. Orange means "changed, not yet acknowledged" and only that.
 */

/** Condensed display setting for gate-board lettering (Archivo width axis). */
export const condensed = { fontStretch: '72%', fontWeight: 800 } as const;

export const fonts = {
  sans: '"Archivo Variable", "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, Consolas, monospace',
};

export const gray = {
  50: '#F5F6F7',
  100: '#ECEDEF',
  200: '#E6E8EB',
  300: '#C8CBD0',
  400: '#9A9FA6',
  500: '#6B7178',
  600: '#4A4F56',
  700: '#2A2D33',
  800: '#1C1F24',
  900: '#16181C',
};

/** Deepest ink, below the ramp: the dark board ground and light-mode type. */
export const ink = '#0B0D10';
/** Warm off-white: dark-mode type and the dark-mode primary control. */
export const paper = '#F2F2EE';

/** Status signals. `*Ink` variants are the text-safe tones on light grounds. */
export const signal = {
  down: '#D7261E',
  downInk: '#B3201A',
  downOnDark: '#FF6B63',
  change: '#FF5A1F',
  changeInk: '#A93A0C',
  up: '#1E8E3E',
  upOnDark: '#5CC97A',
};

/** Cool steel ramp, used for secondary emphasis. */
export const brand = {
  50: '#EEF2F6',
  100: '#DCE4EC',
  200: '#B9C8D8',
  300: '#8DA4BC',
  400: '#5F7E9D',
  500: '#46647F',
  600: '#384F65',
  700: '#2B3C4D',
  800: '#1E2A36',
  900: '#131B23',
};

export const green = {
  50: '#EDF7F0',
  100: '#D3ECDA',
  200: '#A8D9B6',
  300: '#74C08C',
  400: '#1E8E3E',
  500: '#18773A',
  600: '#13602F',
  700: '#0E4823',
  800: '#093118',
  900: '#051C0E',
};

export const orange = {
  50: '#FFF3EC',
  100: '#FFE1D1',
  200: '#FFC2A3',
  300: '#FF9A6E',
  400: '#FF5A1F',
  500: '#D9480F',
  600: '#A93A0C',
  700: '#7A2A09',
  800: '#4D1B06',
  900: '#2B0F03',
};

export const red = {
  50: '#FDEEED',
  100: '#FAD4D2',
  200: '#F4A9A5',
  300: '#FF6B63',
  400: '#D7261E',
  500: '#B3201A',
  600: '#8E1914',
  700: '#69120F',
  800: '#450C0A',
  900: '#260605',
};

const amber = {
  light: '#F0B429',
  main: '#B7791F',
  dark: '#7C5214',
};

const lightPalette = {
  primary: { light: gray[600], main: ink, dark: '#000000', contrastText: '#FFFFFF' },
  secondary: { light: brand[300], main: brand[500], dark: brand[700], contrastText: '#FFFFFF' },
  info: { light: brand[100], main: brand[500], dark: brand[700], contrastText: '#FFFFFF' },
  warning: { light: amber.light, main: amber.main, dark: amber.dark, contrastText: '#FFFFFF' },
  error: { light: red[300], main: signal.down, dark: red[600], contrastText: '#FFFFFF' },
  success: { light: green[300], main: signal.up, dark: green[600], contrastText: '#FFFFFF' },
  grey: { ...gray },
  divider: gray[300],
  background: { default: gray[200], paper: '#FFFFFF' },
  text: { primary: ink, secondary: gray[600], warning: amber.main },
  action: {
    hover: alpha(gray[500], 0.08),
    selected: alpha(gray[500], 0.14),
  },
  baseShadow: `${alpha(ink, 0.08)} 0px 1px 2px 0px, ${alpha(ink, 0.08)} 0px 6px 16px -4px`,
};

const darkPalette = {
  primary: { light: '#FFFFFF', main: paper, dark: gray[300], contrastText: ink },
  secondary: { light: brand[200], main: brand[300], dark: brand[500], contrastText: ink },
  info: { light: brand[300], main: brand[200], dark: brand[500], contrastText: ink },
  warning: { light: '#F7CD6B', main: amber.light, dark: amber.main, contrastText: ink },
  error: { light: '#FF8F89', main: signal.downOnDark, dark: signal.down, contrastText: ink },
  success: { light: '#8BDDA2', main: signal.upOnDark, dark: signal.up, contrastText: ink },
  grey: { ...gray },
  divider: gray[700],
  background: { default: ink, paper: gray[900] },
  text: { primary: paper, secondary: gray[400] },
  action: {
    hover: alpha(gray[400], 0.08),
    selected: alpha(gray[400], 0.16),
  },
  baseShadow: `${alpha('#000', 0.5)} 0px 1px 2px 0px, ${alpha('#000', 0.6)} 0px 8px 20px -6px`,
};

export const getDesignTokens = (mode: PaletteMode) => ({
  palette: { mode, ...(mode === 'dark' ? darkPalette : lightPalette) },
  typography,
  shape,
  shadows,
});

export const colorSchemes = {
  light: { palette: lightPalette },
  dark: { palette: darkPalette },
};

const rem = (px: number) => defaultTheme.typography.pxToRem(px);

export const typography = {
  fontFamily: fonts.sans,
  h1: { fontSize: rem(40), fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' },
  h2: { fontSize: rem(32), fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.015em' },
  h3: { fontSize: rem(26), fontWeight: 700, lineHeight: 1.2 },
  h4: { fontSize: rem(22), fontWeight: 700, lineHeight: 1.3 },
  h5: { fontSize: rem(18), fontWeight: 700, lineHeight: 1.35 },
  h6: { fontSize: rem(16), fontWeight: 700, lineHeight: 1.4 },
  subtitle1: { fontSize: rem(16), fontWeight: 600 },
  subtitle2: { fontSize: rem(14), fontWeight: 600 },
  body1: { fontSize: rem(14), lineHeight: 1.55 },
  body2: { fontSize: rem(14), fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: rem(12), fontWeight: 400, lineHeight: 1.45 },
  overline: {
    fontFamily: fonts.mono,
    fontSize: rem(11),
    fontWeight: 600,
    letterSpacing: '0.12em',
    lineHeight: 1.6,
    textTransform: 'uppercase' as const,
  },
  button: { fontWeight: 600, letterSpacing: '0.01em' },
};

export const shape = {
  borderRadius: 6,
};

// @ts-ignore
const defaultShadows: Shadows = [
  'none',
  'var(--template-palette-baseShadow)',
  ...defaultTheme.shadows.slice(2),
];
export const shadows = defaultShadows;
