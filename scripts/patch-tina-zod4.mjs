/**
 * Temporary compatibility fix for TinaCMS schema-tools with patched Zod 4.
 * Fail closed if upstream changes: do not silently ship incompatible validation.
 * Remove when @tinacms/schema-tools supports Zod 4 natively.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../node_modules/@tinacms/schema-tools/dist/index.js', import.meta.url));
const source = readFileSync(target, 'utf8');
const outdated = 'z.function().args(z.any()).returns(z.string())';
const patched = 'z.function({ input: [z.any()], output: z.string() })';

if (source.includes(patched)) {
  console.log('TinaCMS Zod 4 compatibility already applied');
} else if (source.includes(outdated)) {
  writeFileSync(target, source.replace(outdated, patched));
  console.log('Applied TinaCMS Zod 4 schema function compatibility');
} else {
  throw new Error('TinaCMS schema-tools API changed; review before installing to avoid unsafe automatic patches');
}
