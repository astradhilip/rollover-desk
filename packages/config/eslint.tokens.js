// Token gate for UI code: raw colours, sizes and default palette classes fail lint. Values come from design-tokens.
import tseslint from 'typescript-eslint';

const RAW = [
  [/#[0-9a-fA-F]{3,8}\b/, 'a raw hex colour'],
  [/\b(?:rgb|rgba|hsl|hsla|oklch)\(/, 'a raw colour function'],
  [/(?:^|\s|:)-?[a-z-]+-\[[^\]]*\d(?:px|rem|em)[^\]]*\]/, 'an arbitrary size class'],
  [/(?:^|\s|:)-?[a-z-]+-\[[^\]]*#[^\]]*\]/, 'an arbitrary colour class'],
  [
    /(?:^|\s|:)(?:bg|text|border|ring|fill|stroke|outline|divide|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d+)?\b/,
    'a default palette class',
  ],
];

function check(context, node, text) {
  for (const [pattern, label] of RAW) {
    if (pattern.test(text)) {
      context.report({ node, message: `Use a design token instead of ${label}.` });
      return;
    }
  }
}

const noRawVisualValues = {
  meta: { type: 'problem', schema: [] },
  create: (context) => ({
    Literal(node) {
      if (typeof node.value === 'string') check(context, node, node.value);
    },
    TemplateElement(node) {
      check(context, node, node.value.raw);
    },
  }),
};

export default [
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/test/**', '**/*.test.*', '**/design-tokens/**', '**/next-env.d.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { rollover: { rules: { 'no-raw-visual-values': noRawVisualValues } } },
    rules: { 'rollover/no-raw-visual-values': 'error' },
  },
];
