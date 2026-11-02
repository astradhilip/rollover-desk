import { ESLint } from 'eslint';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import tokens from '../eslint.tokens.js';

const stylelintConfig = new URL('../stylelint.tokens.json', import.meta.url).pathname;

async function eslintErrors(code: string): Promise<number> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: tokens as never,
    cwd: process.cwd(),
  });
  const [result] = await eslint.lintText(code, { filePath: 'planted.tsx' });
  return result!.errorCount;
}

async function stylelintErrors(code: string): Promise<number> {
  const { results } = await stylelint.lint({ code, configFile: stylelintConfig });
  return results[0]!.warnings.length;
}

describe('token gate rejects planted violations', () => {
  it.each([
    ['hex in a style', `export const a = <div style={{ color: '#ff0000' }} />;`],
    ['colour function', `export const a = 'rgba(0,0,0,.1)';`],
    ['arbitrary colour class', `export const a = <div className="bg-[#123456]" />;`],
    ['arbitrary size class', `export const a = <div className="p-2 w-[13px]" />;`],
    ['default palette class', `export const a = <div className="text-blue-500" />;`],
    ['palette class behind a variant', `export const a = <div className="hover:bg-white" />;`],
    ['raw value in a template', 'export const a = (x: string) => `${x} text-red-500`;'],
  ])('ESLint: %s', async (_, code) => {
    expect(await eslintErrors(code)).toBeGreaterThan(0);
  });

  it.each([
    ['hex', 'a { color: #fff; }'],
    ['named colour', 'a { color: red; }'],
    ['colour function', 'a { color: rgb(0 0 0); }'],
    ['px', 'a { margin: 3px; }'],
  ])('Stylelint: %s', async (_, code) => {
    expect(await stylelintErrors(code)).toBeGreaterThan(0);
  });
});

describe('token gate allows token use', () => {
  it('passes token classes', async () => {
    expect(
      await eslintErrors(`export const a = <div className="bg-surface text-ink p-4 rounded-lg" />;`),
    ).toBe(0);
  });
  it('passes a percentage position and an ordinary string', async () => {
    expect(
      await eslintErrors(
        'export const a = (n: number) => <i style={{ left: `${n}%` }} title="Suite #12" />;',
      ),
    ).toBe(0);
  });
  it('passes token CSS', async () => {
    expect(await stylelintErrors('a { color: var(--ink); margin: 1rem; }')).toBe(0);
  });
});
