import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type ColorName, contrast, dark, light, renderCss } from '../src/index';

describe.each([
  ['light', light],
  ['dark', dark],
] as [string, Record<ColorName, string>][])('%s theme contrast', (_, t) => {
  const pairs: [ColorName, ColorName][] = [
    ['ink', 'bg'],
    ['ink', 'surface'],
    ['ink', 'sunken'],
    ['muted', 'bg'],
    ['muted', 'surface'],
    ['muted', 'sunken'],
    ['accentText', 'surface'],
    ['accentText', 'accentSoft'],
    ['accentInk', 'accent'],
    ['good', 'goodSoft'],
    ['warn', 'warnSoft'],
    ['bad', 'badSoft'],
    ['bad', 'surface'],
    ['sideInk', 'sideBg'],
    ['sideMuted', 'sideBg'],
    ['sideActiveInk', 'sideActiveBg'],
  ];
  it.each(pairs)('%s on %s meets AA text', (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each([['c1'], ['c2'], ['c3'], ['c4'], ['c5'], ['accent']] as [ColorName][])(
    'chart colour %s stands out from the surface',
    (c) => {
      expect(contrast(t[c], t.surface)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('tokens.css', () => {
  it('matches what the source generates', () => {
    expect(readFileSync(new URL('../tokens.css', import.meta.url), 'utf8')).toBe(renderCss());
  });
  it('has the same colour names in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
});

describe('contrast', () => {
  it('matches known values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});
