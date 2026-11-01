# Arquitectura – Plataforma de Gestión de Inventario y Logística

> **Estado: prototipo con datos ficticios.** No existe conexión con Microsoft Dynamics ni con ninguna base de datos real.

## 1. Diagnóstico del entorno

| Elemento | Resultado |
|---|---|
| Proyecto | Carpeta vacía (no había código previo) |
| Node.js / npm / Python | No instalados |
| Disponibles | PowerShell 5.1, Microsoft Edge, Google Chrome, .NET, Git |

**Consecuencia:** una cadena de herramientas basada en npm (React/Vue + Vite + TypeScript) obligaría a instalar Node y descargar cientos de paquetes. Eso contradice "ligera, sin descargas grandes". Se elige una arquitectura **sin paso de compilación y sin dependencias**.

## 2. Tecnologías elegidas

| Capa | Tecnología | Motivo |
|---|---|---|
| Interfaz | HTML + CSS (variables) + JavaScript en módulos ES | Estándar, estable, cero instalación |
| Componentes | Helper `h()` propio que crea nodos DOM (nunca `innerHTML`) | Sin riesgo de inyección HTML con texto del usuario |
| Gráficos | SVG generado por código propio | Sin librerías, funciona sin internet, accesible |
| Persistencia | `localStorage` detrás de un *adaptador* (`StorageAdapter`) | Reemplazable por IndexedDB o una API sin tocar el resto |
| Servidor local | `servidor.ps1` (PowerShell + `HttpListener`) solo en `localhost` | Disponible en todo Windows; los módulos ES no funcionan con `file://` |
| Excel | Generador `.xlsx` propio (ZIP sin compresión) | Excel real, sin librerías |
| PDF | Vista de impresión A4 + "Guardar como PDF" del navegador | PDF vectorial de calidad, sin librerías |
| QR | Generador QR propio (para etiquetas de ubicación) | Sin servicios externos |
| PWA | `manifest.webmanifest` + `service-worker.js` | Instalable y con modo sin conexión |
| Pruebas | Mini-framework propio ejecutado en el navegador (`tests/`) | No requiere Node |

Los tipos se documentan con JSDoc (`@typedef`), lo que permite validación en el editor sin compilar.

## 3. Estructura de carpetas

```
Alimex/
├─ iniciar.bat · servidor.ps1        Arranque local (servidor estático en localhost)
├─ index.html · manifest.webmanifest · service-worker.js
├─ docs/                             Documentación
├─ assets/css, assets/icons          Estilos e íconos
├─ src/
│  ├─ main.js                        Arranque de la aplicación
│  ├─ config.js                      Nombre, versión, textos de estado "DEMO"
│  ├─ core/                          Utilidades sin dependencias del negocio
│  │   dom.js · format.js · dates.js · events.js
│  ├─ domain/                        LÓGICA PURA (sin DOM ni almacenamiento)
│  │   stock.js · alerts.js · replenishment.js · abc.js · ranking.js
│  │   locations.js · kpis.js · analytics.js · movements.js
│  ├─ data/                          Persistencia y datos
│  │   storage.js · store.js · schema.js · seed/ (catálogo, ubicaciones, historial)
│  ├─ services/                      Casos de uso que orquestan dominio + datos
│  │   inventoryService.js · movementService.js · productService.js
│  │   reportService.js · exportService.js · offlineQueue.js · qr.js
│  ├─ integration/                   PREPARACIÓN PARA DYNAMICS (puertos + adaptador demo)
│  │   contracts.js · erpGateway.js · demoGateway.js
│  └─ ui/                            Presentación
│      shell.js · router.js · components/ · charts/ · views/
└─ tests/                            Pruebas funcionales en el navegador
```

**Regla de dependencias:** `ui → services → domain` y `services → data`. El dominio no importa nada de `ui` ni de `data`.

## 4. Cómo se comparten los datos entre módulos

1. Existe **un único estado** (`state`) con: productos, ubicaciones, existencias por ubicación, movimientos, parámetros, recepciones pendientes, comprometidos y cola sin conexión.
2. **Solo `movementService` puede cambiar existencias.** Cada operación se valida completa (todas las líneas) y se aplica de forma atómica: o se registran todas las líneas o ninguna.
3. Los movimientos son **de solo agregar** (identificador correlativo). No se editan ni se borran.
4. Los valores derivados (KPI, alertas, ranking, ocupación del layout, cobertura, sugerencias) **nunca se guardan**: se calculan siempre desde el estado con funciones puras. Por eso no pueden desincronizarse.
5. Cada cambio incrementa `state.rev`, se guarda en `localStorage` y emite el evento `change`. Las vistas montadas se suscriben y se redibujan solas.
6. Si se abre otra pestaña, el evento `storage` recarga el estado: lo registrado en la vista móvil aparece en el escritorio.

## 5. Separación para la integración con Microsoft Dynamics

`src/integration/contracts.js` define seis dominios independientes:

| Dominio | Quién será la fuente oficial en el futuro |
|---|---|
| Datos maestros de productos | Dynamics (lectura) |
| Existencias oficiales | Dynamics (lectura) |
| Ubicaciones físicas | Esta plataforma |
| Movimientos operacionales | Esta plataforma → sincronización hacia Dynamics |
| Recomendaciones de reposición | Esta plataforma (cálculo) |
| Solicitudes de compra | Dynamics, solo borradores y con aprobación humana |

`erpGateway.js` define el **puerto** (interfaz) y `demoGateway.js` el **adaptador de demostración**. Un conector real deberá usar únicamente APIs o servicios oficiales y autorizados, nunca la base de datos interna. La plataforma no genera órdenes de compra ni pedidos a proveedores.

## 6. Riesgos técnicos y mitigación

| Riesgo | Mitigación |
|---|---|
| Sin Node: no hay compilador ni linter | JSDoc + pruebas automáticas en navegador (Edge sin ventana) |
| `localStorage` limitado (~5 MB) | Volumen demo < 1 MB; adaptador reemplazable; aviso ante cuota llena |
| Módulos ES no funcionan con `file://` | `iniciar.bat` levanta el servidor local |
| Cámara y service worker exigen contexto seguro (HTTPS o localhost) | En el celular real se requerirá HTTPS; el prototipo acepta código manual y enlaces profundos |
| `BarcodeDetector` no existe en todos los navegadores | Alternativas: cámara nativa del teléfono (el QR contiene un enlace), código manual |
| PDF mediante impresión depende del navegador | Hoja A4 con estilos de impresión propios; documentado |
| Datos aleatorios distintos en cada carga | Generador con semilla fija; se guarda una sola vez |
| Concurrencia entre pestañas | Recarga por evento `storage`; en producción lo resuelve el servidor |
| Cola sin conexión con stock desactualizado | Validación al sincronizar; las líneas rechazadas quedan visibles |

## 7. Etapas de desarrollo

1. Estructura general, navegación, Dashboard y datos ficticios.
2. Inventario, layout, ubicaciones y clasificación ABC.
3. Registro de entradas, salidas, traslados y devoluciones.
4. Actualización automática de indicadores, ranking y alertas.
5. Historial, reportes y exportación (CSV, Excel, PDF).
6. Adaptación móvil, QR y preparación PWA / sin conexión.
7. Pruebas funcionales, validaciones y corrección de errores.
