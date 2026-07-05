import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const extractDir = '/tmp/ivx-run-logs';
const file = 'Build + upload landing to S3 + invalidate CloudFront/2_Checkout.txt';
const path = join(extractDir, file);
if (!existsSync(path)) {
  console.log('Log file not found:', path);
  process.exit(1);
}
console.log(readFileSync(path, 'utf-8'));
