import base from '@rollover-desk/config/eslint';
import tokens from '@rollover-desk/config/eslint-tokens';

export default [...base, ...tokens, { ignores: ['.next/**', 'next-env.d.ts', 'scripts/**'] }];
