import { writeFileSync } from 'node:fs';
import { renderCss } from '../src/index';

writeFileSync(new URL('../tokens.css', import.meta.url), renderCss());
