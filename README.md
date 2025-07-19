# Generator Dashboard

Un generador automático de dashboards en Vue.js que utiliza inteligencia artificial para crear aplicaciones web completas basadas en descripciones en lenguaje natural.

## 🚀 Configuración Inicial

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar API Key de OpenAI
Copia el archivo de ejemplo y configura tu API key:
```bash
cp .env.example .env
```

Edita el archivo `.env` y reemplaza `your_openai_api_key_here` con tu API key real de OpenAI:
```
OPENAI_API_KEY=tu_api_key_aqui
```

## 🎯 Uso

### Comando básico
```bash
npm run generate -- --prompt "Descripción de tu dashboard"
```

### Ejemplos
```bash
# Dashboard de ventas básico
npm run generate -- --prompt "Dashboard de ventas con gráficos de barras y tabla de productos"

# Dashboard con estilos específicos
npm run generate -- --prompt "Dashboard de inventario" --styles "tailwind,element-plus"
```

### Parámetros disponibles
- `--prompt` (requerido): Descripción del dashboard a generar
- `--styles` (opcional): Librerías de estilos separadas por comas (default: "tailwind,element-plus")

## 📁 Estructura del Proyecto

```
generator-dashboard/
├── scripts/agent.js         # Script principal del generador
├── templates/vue-dashboard/  # Template base de Vue.js
├── workspace/               # Proyectos generados
├── .env                     # Variables de entorno (no incluir en git)
└── .env.example            # Ejemplo de configuración
```

## 🛠️ Tecnologías

- **Vue 3** con Composition API
- **Vite** como build tool
- **Tailwind CSS** para estilos
- **Element Plus** para componentes UI
- **OpenAI API** para generación de código

## ⚡ Proyectos Generados

Los dashboards generados se crean en `workspace/project-[timestamp]/` y incluyen:
- Proyecto Vue 3 completo y funcional
- Componentes personalizados basados en tu descripción
- Configuración lista para desarrollo

Para ejecutar un proyecto generado:
```bash
cd workspace/project-[timestamp]
npm install
npm run dev
``` 