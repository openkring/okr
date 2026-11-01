import { join } from 'node:path';

// Side-effect module: load .env from the producer root before anything reads
// process.env. Import this FIRST in the entry scripts. Node 20.12+/22 ships
// process.loadEnvFile natively, so no dotenv dependency is needed.
try {
  process.loadEnvFile(join(__dirname, '..', '.env'));
} catch {
  // no .env present — fine for silent drafts
}
