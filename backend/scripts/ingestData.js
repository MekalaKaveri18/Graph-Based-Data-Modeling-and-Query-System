import { ingestDataDirectory } from '../dataIngestion.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

console.log('=== Data Ingestion ===');
console.log(`Reading files from: ${DATA_DIR}`);

await ingestDataDirectory(DATA_DIR);
