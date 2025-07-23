# Documentación Técnica del Generador de Dashboards

## Estructura General del Proyecto

- `scripts/agent.js`: Script principal que orquesta la generación de dashboards usando IA (OpenAI), prompts y plantillas Vue.
- `constants/`: Contiene prompts y configuraciones base para la generación.
  - `prompts.js`: Exporta el prompt del sistema para la IA.
  - `system-prompt.md`: Prompt detallado con directrices de diseño y formato de salida para la IA.
- `templates/vue-dashboard/`: Plantilla base de un dashboard en Vue 3 + Tailwind + Element Plus.
  - `src/`: Código fuente del dashboard generado.
    - `App.vue`: Componente principal, incluye modo oscuro y estructura base.
    - `main.js`: Punto de entrada de la app Vue.
    - `style.css`: Estilos base, incluye Tailwind.
  - Archivos de configuración: `vite.config.js`, `tailwind.config.js`, `postcss.config.cjs`.

## scripts/agent.js

Script CLI que genera dashboards a partir de una descripción textual. Sus pasos principales:

1. **Carga de configuración y argumentos**: Lee variables de entorno y argumentos CLI (prompt, estilos).
2. **Comunicación con OpenAI**: Envía el prompt del sistema y la descripción del usuario, espera un JSON con la estructura del dashboard.
3. **Procesamiento de la respuesta**: Parsea el JSON, valida y corrige posibles errores de formato.
4. **Generación de archivos**: Crea los archivos Vue y la estructura del proyecto en base a la respuesta de la IA.
5. **Validación y stubs**: Si faltan componentes, los stubbea o solicita a la IA que los genere.

## constants/prompts.js y system-prompt.md

- `prompts.js` lee el archivo `system-prompt.md` y lo expone como función.
- `system-prompt.md` define el rol de la IA, las reglas de diseño, formato de salida (JSON con componentes y app principal), y directrices de calidad, seguridad y UX.

## templates/vue-dashboard/

Plantilla base para el dashboard generado:

- **App.vue**: Componente principal con modo oscuro y estructura de layout.
- **main.js**: Inicializa la app Vue y aplica Element Plus.
- **style.css**: Estilos globales usando Tailwind.
- **vite.config.js**: Configuración de Vite para desarrollo rápido.
- **tailwind.config.js**: Configuración de Tailwind para escanear archivos fuente.
- **postcss.config.cjs**: Configuración de PostCSS para procesar Tailwind y autoprefixer.

## Flujo General de Generación

1. El usuario ejecuta el script CLI con un prompt descriptivo.
2. El sistema envía el prompt a OpenAI junto con las reglas de `system-prompt.md`.
3. La IA responde con un JSON que describe los archivos Vue a generar.
4. El script crea los archivos y estructura del dashboard.
5. Si faltan componentes, los stubbea o solicita a la IA que los complete.

---

> **Nota:** Para extender la funcionalidad, modifica el prompt del sistema o los scripts de generación. Para cambiar el stack del dashboard, edita la plantilla en `templates/vue-dashboard/`. 