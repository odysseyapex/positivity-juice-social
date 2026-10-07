import { mkdirSync, writeFileSync } from 'node:fs';
import { loadLocalEnv, getAccounts } from './buffer.mjs';

loadLocalEnv();
try {
  const accounts = await getAccounts();
  mkdirSync(new URL('../.private/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../.private/accounts.json', import.meta.url), JSON.stringify(accounts, null, 2));
  console.log(JSON.stringify(accounts, null, 2));
} catch (error) {
  console.error(String(error.message).replaceAll(process.env.BUFFER_API_KEY || '\u0000', '[redacted]'));
  process.exitCode = 1;
}
