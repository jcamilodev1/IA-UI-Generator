// Prompts del sistema para el generador de dashboards
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leer el prompt desde archivo markdown
const systemPromptMd = fs.readFileSync(
  path.join(__dirname, 'system-prompt.md'), 
  'utf-8'
);

export const SYSTEM_PROMPT = (stylesArray) => {
  return systemPromptMd;
}; 