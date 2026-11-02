// The only source of visual values. tokens.css is generated from this file: `pnpm --filter @rollover-desk/design-tokens generate`.

export const light = {
  bg: '#EFF4F9',
  surface: '#FFFFFF',
  sunken: '#E5EDF5',
  ink: '#0C2036',
  muted: '#4A6178',
  faint: '#7890A6',
  line: '#CFDCE8',
  line2: '#E2EAF2',
  accent: '#0A66C8',
  accentInk: '#FFFFFF',
  accentSoft: '#E1EEFB',
  accentText: '#0957AC',
  good: '#127A55',
  goodSoft: '#DFF2EA',
  warn: '#8A5A00',
  warnSoft: '#F9EDD2',
  bad: '#B3302B',
  badSoft: '#FBE4E2',
  sideBg: '#FFFFFF',
  sideInk: '#0C2036',
  sideMuted: '#5D7389',
  sideLine: '#CFDCE8',
  sideActiveBg: '#E1EEFB',
  sideActiveInk: '#0957AC',
  c1: '#0A66C8',
  c2: '#0F9488',
  c3: '#B7791F',
  c4: '#6D5BD0',
  c5: '#D9480F',
} as const;

export type ColorName = keyof typeof light;

export const dark: Record<ColorName, string> = {
  bg: '#071627',
  surface: '#0C1F35',
  sunken: '#091A2D',
  ink: '#DCEAF7',
  muted: '#8AA4BD',
  faint: '#627C95',
  line: '#17324F',
  line2: '#112842',
  accent: '#45C0FF',
  accentInk: '#03111F',
  accentSoft: '#0F3354',
  accentText: '#7FD3FF',
  good: '#47D19B',
  goodSoft: '#0D2F29',
  warn: '#F2B652',
  warnSoft: '#2F2810',
  bad: '#FF7F78',
  badSoft: '#381C22',
  sideBg: '#05111F',
  sideInk: '#DCEAF7',
  sideMuted: '#7C96AF',
  sideLine: '#102740',
  sideActiveBg: '#0F3354',
  sideActiveInk: '#7FD3FF',
  c1: '#45C0FF',
  c2: '#47D19B',
  c3: '#F2B652',
  c4: '#A99BFF',
  c5: '#FF9466',
};

export const shadow = { light: '0 1px 3px rgba(12,32,54,.07)', dark: 'none' } as const;

export const radius = { sm: '4px', md: '6px', lg: '8px' } as const;

export const text = {
  xs: '12px',
  sm: '12.5px',
  base: '13.5px',
  lg: '15px',
  h2: '17px',
  'h1-sm': '24px',
  h1: '28px',
  kpi: '26px',
} as const;

export const layout = { sideWidth: '236px', focusWidth: '2px', hairline: '1px' } as const;

const kebab = (name: string) => name.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

function colorBlock(colors: Record<ColorName, string>, boxShadow: string, scheme: string): string {
  const lines = Object.entries(colors).map(([name, value]) => `  --${kebab(name)}: ${value};`);
  return [...lines, `  --tile-shadow: ${boxShadow};`, `  color-scheme: ${scheme};`].join('\n');
}

export function renderCss(): string {
  const themeColors = Object.keys(light)
    .map((name) => `  --color-${kebab(name)}: var(--${kebab(name)});`)
    .join('\n');
  const entries = (prefix: string, values: Record<string, string>) =>
    Object.entries(values)
      .map(([name, value]) => `  --${prefix}-${name}: ${value};`)
      .join('\n');
  return `/* Generated from src/index.ts. Do not edit. */
:root,
[data-theme='light'] {
${colorBlock(light, shadow.light, 'light')}
}

[data-theme='dark'] {
${colorBlock(dark, shadow.dark, 'dark')}
}

:root {
  --side-width: ${layout.sideWidth};
  --focus-width: ${layout.focusWidth};
  --hairline: ${layout.hairline};
}

@theme inline {
  --color-*: initial;
  --color-transparent: transparent;
  --color-current: currentColor;
${themeColors}
  --radius-*: initial;
${entries('radius', radius)}
  --text-*: initial;
${entries('text', text)}
  --shadow-*: initial;
  --shadow-tile: var(--tile-shadow);
  --font-sans: var(--font-geist-sans), system-ui, sans-serif;
  --width-side: var(--side-width);
}
`;
}

/** WCAG relative luminance contrast, for the token tests. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
