#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import dotenv from 'dotenv';
import { SYSTEM_PROMPT } from '../constants/prompts.js';

function loadEnvAndConfig() {
  dotenv.config();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  return { __filename, __dirname };
}

function parseArguments() {
  return yargs(hideBin(process.argv))
    .option('prompt', {
      type: 'string',
      demandOption: true,
      describe: 'Descripción del dashboard o conjunto de componentes a generar'
    })
    .option('styles', {
      type: 'string',
      default: 'tailwind,element-plus',
      describe: 'Librerías de estilos a usar, separadas por comas (ej: tailwind,element-plus)'
    })
    .parse();
}

async function getSpecFromAI(openai, systemSpec, userSpec) {
  const specRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemSpec.trim() },
      { role: 'user',   content: userSpec }
    ]
  });
  let specText = specRes.choices[0].message.content.trim();
  const jsonMatch = specText.match(/\{[\s\S]*\}$/);
  specText = jsonMatch ? jsonMatch[0] : specText;
  return specText;
}

function parseSpec(specText) {
  let spec;
  try {
    spec = JSON.parse(specText);
  } catch (e) {
    console.error('❌ Error al parsear JSON de la IA:\n', specText);
    process.exit(1);
  }
  return spec;
}

async function generateComponents(components, compDir) {
  for (const comp of components) {
    let code = comp.content.trim()
      .replace(/^```(?:vue)?\r?\n?/, '')
      .replace(/\r?\n?```$/, '');
    code = code.replace(
      /from\s+['"]src\/components\/([^'"]+)['"]/g,
      `from './components/$1'`
    );
    const filePath = path.join(compDir, comp.filename);
    await fs.writeFile(filePath, code, 'utf8');
    console.log(`✅ Componente generado: src/components/${comp.filename}`);
  }
}

async function generateAppFile(app, pagesDir) {
  let appCode = app.content.trim()
    .replace(/^```(?:vue)?\r?\n?/, '')
    .replace(/\r?\n?```$/, '')
    .replace(
      /from\s+['"]src\/components\/([^'"]+)['"]/g,
      `from './components/$1'`
    );
  const appPath = path.join(pagesDir, app.filename);
  await fs.writeFile(appPath, appCode, 'utf8');
  console.log(`✅ Página generada: src/${app.filename}`);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌  Define OPENAI_API_KEY en tu archivo .env o variables de entorno.');
    process.exit(1);
  }
  const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
  });

  // Directorios del proyecto
  const { __dirname } = loadEnvAndConfig();
  const argv = parseArguments();
  const projectDir = path.join(__dirname, '../workspace', `project-${Date.now()}`);
  const compDir    = path.join(projectDir, 'src/components');
  const pagesDir   = path.join(projectDir, 'src');
  await fs.ensureDir(compDir);

  await fs.copy(path.join(__dirname, '../templates/vue-dashboard'), projectDir);

  const stylesArray = argv.styles.split(',').map(s => s.trim()).filter(Boolean);


  const systemSpec = SYSTEM_PROMPT(stylesArray);
  const userSpec = `Descripción del dashboard: "${argv.prompt}"`;
  const specText = await getSpecFromAI(openai, systemSpec, userSpec);
  const spec = parseSpec(specText);

  await generateComponents(spec.components, compDir);

  await generateAppFile(spec.app, pagesDir);

  console.log('\n🎉 ¡Proyecto listo!');
  console.log(`cd ${projectDir} && npm install && npm run dev`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
