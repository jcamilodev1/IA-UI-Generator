#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { SYSTEM_PROMPT } from '../constants/prompts.js';
import { Parser } from 'htmlparser2';
import JSON5 from 'json5';
import { parse as parseVueSFC } from '@vue/compiler-sfc';

/**
 * Carga las variables de entorno y obtiene las rutas de archivo y directorio actuales.
 * @returns {{ __filename: string, __dirname: string }}
 */
function loadEnvAndConfig() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  return { __filename, __dirname };
}

/**
 * Parsea los argumentos de línea de comandos usando yargs.
 * @returns {Object} Argumentos parseados.
 */
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

/**
 * Solicita a la IA (OpenAI) la generación del JSON de especificación del dashboard.
 * Maneja reintentos y limpieza de la respuesta.
 * @param {OpenAI} openai - Instancia de OpenAI.
 * @param {string} systemSpec - Prompt del sistema.
 * @param {string} userSpec - Prompt del usuario.
 * @param {boolean} retry - Si debe reintentar en caso de error.
 * @returns {Promise<string>} JSON de especificación.
 */
async function getSpecFromAI(openai, systemSpec, userSpec, retry = true) {
  const specRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemSpec.trim() },
      { role: 'user',   content: userSpec }
    ]
  });
  let specText = specRes.choices[0].message.content.trim();
  // Eliminar fences de código si existen
  specText = specText.replace(/^```(?:json)?\r?\n?/, '').replace(/\r?\n?```$/, '');
  // Extraer el primer objeto JSON válido
  const jsonMatch = specText.match(/\{[\s\S]*\}/);
  specText = jsonMatch ? jsonMatch[0] : null;
  // Guardar la respuesta cruda para depuración
  fs.writeFileSync('last-ai-response.json', specRes.choices[0].message.content.trim(), 'utf8');
  if (!specText) {
    console.error('❌ La IA no devolvió ningún bloque JSON. Respuesta cruda guardada en last-ai-response.json');
    if (retry) {
      console.warn('🔄 Reintentando con un prompt más directo...');
      const directUserSpec = userSpec + '\n\nIMPORTANTE: Devuelve SOLO el JSON, sin ninguna explicación, introducción ni texto adicional.';
      return await getSpecFromAI(openai, systemSpec, directUserSpec, false);
    }
    process.exit(1);
  }
  return specText;
}

/**
 * Parsea el JSON de especificación usando JSON5 y maneja errores de parseo.
 * @param {string} specText - Texto JSON a parsear.
 * @returns {Object} Objeto de especificación.
 */
function parseSpec(specText) {
  let spec;
  try {
    spec = JSON5.parse(specText);
  } catch (e) {
    console.error('❌ Error al parsear JSON de la IA (incluso con JSON5):\n', specText);
    // Mostrar el error real y el contexto
    console.error('Detalles del error:', e);
    if (e.at !== undefined) {
      const context = specText.slice(Math.max(0, e.at - 40), e.at + 40);
      console.error('Contexto alrededor del error:', context);
    }
    process.exit(1);
  }
  return spec;
}

/**
 * Corrige problemas de etiquetas abiertas/cerradas en un template HTML usando htmlparser2.
 * @param {string} template - Template HTML a corregir.
 * @returns {{ fixedTemplate: string, hasError: boolean }} Template corregido y si hubo errores.
 */
function fixTemplate(template) {
  // Usar htmlparser2 para detectar etiquetas abiertas sin cerrar
  const openTags = [];
  const closeTags = [];
  const tagStack = [];
  let hasError = false;
  let fixedTemplate = '';

  const parser = new Parser({
    onopentag(name, attribs) {
      tagStack.push(name);
      openTags.push(name);
      fixedTemplate += `<${name}`;
      for (const [key, value] of Object.entries(attribs)) {
        fixedTemplate += ` ${key}="${value}"`;
      }
      fixedTemplate += '>';
    },
    ontext(text) {
      fixedTemplate += text;
    },
    onclosetag(name) {
      let last;
      // Buscar el último tag abierto igual a este
      for (let i = tagStack.length - 1; i >= 0; i--) {
        if (tagStack[i] === name) {
          last = i;
          break;
        }
      }
      if (last !== undefined) {
        tagStack.splice(last, 1);
        closeTags.push(name);
        fixedTemplate += `</${name}>`;
      } else {
        // Etiqueta de cierre sin apertura
        hasError = true;
      }
    }
  }, { decodeEntities: true });

  try {
    parser.write(template);
    parser.end();
  } catch (e) {
    hasError = true;
  }

  // Cerrar etiquetas abiertas que no se cerraron
  while (tagStack.length > 0) {
    const tag = tagStack.pop();
    fixedTemplate += `</${tag}>`;
    hasError = true;
  }

  return { fixedTemplate, hasError };
}

/**
 * Genera archivos de componentes Vue a partir de la especificación recibida.
 * Valida y corrige templates si es necesario.
 * @param {Array} components - Lista de componentes a generar.
 * @param {string} compDir - Directorio destino de los componentes.
 */
async function generateComponents(components, compDir) {
  for (const comp of components) {
    let code = comp.content.trim()
      .replace(/^```(?:vue)?\r?\n?/, '')
      .replace(/\r?\n?```$/, '');
    code = code.replace(
      /from\s+['"]src\/components\/([^'\"]+)['"]/g,
      `from './components/$1'`
    );
    // Validar y corregir el bloque <template>
    const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/);
    let attempts = 0;
    let valid = false;
    let lastError = null;
    while (!valid && attempts < 3) {
      try {
        parseVueSFC(code);
        valid = true;
      } catch (e) {
        lastError = e;
        if (templateMatch) {
          const originalTemplate = code.match(/<template>[\s\S]*?<\/template>/)[0];
          const inner = originalTemplate.replace(/^<template>/, '').replace(/<\/template>$/, '');
          const { fixedTemplate, hasError } = fixTemplate(inner);
          if (hasError) {
            console.warn(`⚠️  Se detectaron y corrigieron problemas de etiquetas en el template de ${comp.filename} (intento ${attempts + 1})`);
          }
          code = code.replace(/<template>[\s\S]*?<\/template>/, `<template>${fixedTemplate}</template>`);
        } else {
          break;
        }
      }
      attempts++;
    }
    if (!valid) {
      console.error(`❌ No se pudo corregir automáticamente el componente: ${comp.filename}`);
      if (lastError) {
        console.error('Error de sintaxis:', lastError);
      }
    }
    const filePath = path.join(compDir, path.basename(comp.filename));
    await fs.writeFile(filePath, code, 'utf8');
    console.log(`✅ Componente generado: src/components/${comp.filename}`);
  }
}

/**
 * Genera el archivo App.vue principal, ajustando imports y eliminando referencias a componentes no generados.
 * @param {Object} app - Objeto con filename y content de App.vue.
 * @param {string} pagesDir - Directorio destino.
 * @param {Array<string>} generatedComponentNames - Nombres de componentes generados.
 */
async function generateAppFile(app, pagesDir, generatedComponentNames) {
  let appCode = app.content.trim()
    .replace(/^```(?:vue)?\r?\n?/, '')
    .replace(/\r?\n?```$/, '');

  // Ajustar imports de componentes .vue a './components/Nombre.vue' si no lo están
  appCode = appCode.replace(/import\s+(\w+)\s+from\s+['"]\.\/?(?!components\/)([A-Za-z0-9_]+)\.vue['"]/g, (match, compName, fileName) => {
    if (generatedComponentNames.includes(compName)) {
      return `import ${compName} from './components/${compName}.vue'`;
    }
    return match;
  });

  // Eliminar imports y usos de componentes no generados
  appCode = appCode.split('\n').filter(line => {
    const importMatch = line.match(/^import\s+(\w+)\s+from\s+['\"](.+)\.vue['\"]/);
    if (importMatch) {
      const compName = importMatch[1];
      return generatedComponentNames.includes(compName);
    }
    return true;
  }).join('\n');

  // 2. Eliminar etiquetas de componentes no generados en el template
  const templateTagPattern = new RegExp(`<([A-Z][A-Za-z0-9_]*)\\b`, 'g');
  let usedTags = [];
  let match;
  while ((match = templateTagPattern.exec(appCode)) !== null) {
    usedTags.push(match[1]);
  }
  usedTags = [...new Set(usedTags)];
  const tagsToRemove = usedTags.filter(tag => !generatedComponentNames.includes(tag));
  tagsToRemove.forEach(tag => {
    const openTag = new RegExp(`<${tag}[^>]*>`, 'g');
    const closeTag = new RegExp(`</${tag}>`, 'g');
    appCode = appCode.replace(openTag, '');
    appCode = appCode.replace(closeTag, '');
  });

  const appPath = path.join(pagesDir, path.basename(app.filename));
  await fs.writeFile(appPath, appCode, 'utf8');
  console.log(`✅ Página generada: src/${app.filename}`);
}

/**
 * Genera un stub (componente de marcador) para un componente faltante.
 * @param {string} name - Nombre del componente.
 * @param {string} compDir - Directorio destino.
 */
async function generateStubComponent(name, compDir) {
  const stub = `<template><div style="color:red;">Stub: ${name}</div></template>\n<script setup>\n// Componente generado automáticamente como stub\n</script>\n`;
  const filePath = path.join(compDir, name + '.vue');
  await fs.writeFile(filePath, stub, 'utf8');
  console.warn(`⚠️  Stub generado para componente faltante: ${name}.vue`);
}

/**
 * Busca todos los imports de componentes .vue en un bloque de código.
 * @param {string} code - Código fuente a analizar.
 * @returns {Array<string>} Nombres de componentes importados.
 */
function findVueImportsInCode(code) {
  const importRegex = /import\s+([A-Za-z0-9_]+)\s+from\s+['"]\.\/components\/([A-Za-z0-9_]+)\.vue['"]/g;
  const found = [];
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    found.push(match[2]);
  }
  return found;
}

/**
 * Valida dependencias de componentes y genera stubs para los que falten.
 * @param {string} compDir - Directorio de componentes.
 * @param {Array<string>} generatedComponentNames - Nombres de componentes generados.
 * @returns {Promise<Array<string>>} Nombres de componentes faltantes.
 */
async function validateAndStubMissingComponents(compDir, generatedComponentNames) {
  const files = await fs.readdir(compDir);
  const vueFiles = files.filter(f => f.endsWith('.vue'));
  const allImports = new Set();
  for (const file of vueFiles) {
    const code = await fs.readFile(path.join(compDir, file), 'utf8');
    findVueImportsInCode(code).forEach(i => allImports.add(i));
  }
  const missing = Array.from(allImports).filter(name => !generatedComponentNames.includes(name));
  for (const name of missing) {
    await generateStubComponent(name, compDir);
  }
  return missing;
}

/**
 * Llama a la IA para generar componentes faltantes detectados tras la primera pasada.
 * @param {OpenAI} openai - Instancia de OpenAI.
 * @param {Array<string>} missingNames - Nombres de componentes faltantes.
 * @param {string} systemSpec - Prompt del sistema.
 * @param {string} userSpec - Prompt del usuario.
 * @param {string} compDir - Directorio destino.
 * @returns {Promise<Array<string>>} Nombres de nuevos componentes generados.
 */
async function generateMissingComponentsWithAI(openai, missingNames, systemSpec, userSpec, compDir) {
  if (!missingNames.length) return [];
  // Construir prompt para pedir solo los componentes faltantes
  const missingPrompt = `${userSpec}\n\nGenera SOLO los siguientes componentes Vue en formato JSON válido (sin fences de markdown):\n${missingNames.map(n => `- ${n}.vue`).join('\n')}`;
  const specText = await getSpecFromAI(openai, systemSpec, missingPrompt);
  const spec = parseSpec(specText);
  if (!spec.components || !Array.isArray(spec.components)) {
    console.error('❌ La IA no devolvió un array de componentes en el segundo llamado.');
    return [];
  }
  await generateComponents(spec.components, compDir);
  return spec.components.map(c => path.basename(c.filename, '.vue'));
}

/**
 * Función principal: orquesta el flujo de generación del dashboard.
 * - Valida API key
 * - Prepara directorios
 * - Llama a la IA
 * - Genera archivos y valida dependencias
 */
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

  let generatedComponentNames = spec.components.map(c => path.basename(c.filename, '.vue'));
  // Validar dependencias y generar stubs si faltan
  let missing = await validateAndStubMissingComponents(compDir, generatedComponentNames);
  if (missing.length > 0) {
    console.warn(`⚠️  Componentes auxiliares faltantes detectados: ${missing.join(', ')}`);
    // Segundo llamado a la IA para pedir los componentes faltantes
    const newComponents = await generateMissingComponentsWithAI(openai, missing, systemSpec, userSpec, compDir);
    generatedComponentNames = generatedComponentNames.concat(newComponents);
    // Validar de nuevo por si hay dependencias en los nuevos componentes
    const stillMissing = await validateAndStubMissingComponents(compDir, generatedComponentNames);
    if (stillMissing.length > 0) {
      console.warn(`⚠️  Tras el segundo llamado, aún faltan: ${stillMissing.join(', ')}. Se generaron stubs.`);
      generatedComponentNames = generatedComponentNames.concat(stillMissing);
    }
  }

  await generateAppFile(spec.app, pagesDir, generatedComponentNames);

  console.log('\n🎉 ¡Proyecto listo!');
  console.log(`cd ${projectDir} && npm install && npm run dev`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
