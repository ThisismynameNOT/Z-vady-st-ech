import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const enquirySource = await readFile(new URL('../src/pages/api/enquiry.ts', import.meta.url), 'utf8');

test('Resend API request declares the required User-Agent header', () => {
  assert.match(enquirySource, /fetch\('https:\/\/api\.resend\.com\/emails'/);
  assert.match(
    enquirySource,
    /['"]User-Agent['"]\s*:\s*['"]zavady-strech-praha\/1\.0['"]/,
    'direct Resend API requests must include an explicit User-Agent header',
  );
});
