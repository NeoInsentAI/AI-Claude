# Propuesta de Desarrollo Web
## Kimo — Servicio de Reenvío de Paquetes
**Preparada para:** Kimberly Montoya
**Fecha:** 17 de junio de 2026

---

## Resumen Ejecutivo

Esta propuesta describe el desarrollo del sitio web de **Kimo**, un emprendimiento personal de reenvío de paquetes de Estados Unidos a Costa Rica. El proyecto se divide en **tres fases progresivas**: primero establecer presencia profesional en línea, luego incorporar un asistente web para consultas de paquetes, y finalmente automatizar el rastreo mediante integración directa con el courier Atena.

Este enfoque por fases permite lanzar rápido, validar el mercado y crecer con control de riesgo y costos.

---

## Contexto del Negocio

**Negocio:** Kimo — reenvío personal de paquetes, EE. UU. → Costa Rica
**Segmentos objetivo:**
- **Compradores de autopartes** (mecánicos) — compras recurrentes, baja adopción tecnológica
- **Compradores de artículos del hogar** (amas de casa) — compras recurrentes, baja adopción tecnológica

**Modelo de negocio:**
- Kimo maneja directamente el reenvío de paquetes pequeños
- Carga grande se refiere a un courier asociado a cambio de comisión

**Activos de marca:** Logo existente de Kimo (paleta azul/blanco, tipografías definidas)

---

## Fase 1 — Sitio Web Profesional

**Duración estimada: 1 a 8 días hábiles**

### Objetivo
Establecer presencia profesional en línea que genere confianza, amplíe el alcance de mercado y ofrezca a los clientes información clave sobre el servicio.

---

### Secciones del Sitio

| Sección | Descripción |
|---|---|
| **Inicio / Hero** | Presentación de la marca, propuesta de valor, llamado a la acción |
| **¿Cómo funciona?** | Pasos para usar el servicio de reenvío |
| **Dirección del almacén** | Dirección física en EE. UU. para que los clientes envíen sus compras |
| **Rastreo manual** | Campo simple donde el cliente ingresa su número de rastreo; el estado se actualiza manualmente desde el panel de administración |
| **Noticias y Promociones** | Actualizaciones, ofertas estacionales (ej. Black Friday), anuncios |
| **Contacto** | Enlace a WhatsApp, correo electrónico y otros canales |

---

### Dirección de Diseño

- **Estilo:** Minimalista, limpio y profesional
- **Marca:** Logo, paleta azul/blanco y tipografías de Kimo
- **Mobile-first:** Totalmente responsivo; funciona como una app nativa al agregarse como acceso directo en el teléfono

---

### Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Plataforma web | WordPress o Webflow |
| Hosting | Hosting compartido o en la nube (SiteGround, Vercel, etc.) |
| Dominio | Dominio .com personalizado |
| Rastreo Fase 1 | Panel de administración para actualizaciones manuales de estado |
| Experiencia móvil | Diseño responsivo con comportamiento PWA |

---

### Presupuesto Fase 1

| Concepto | Costo estimado |
|---|---|
| Dominio | ~$15/año |
| Hosting | ~$100–$200/año |
| Diseño y desarrollo | Por confirmar |
| **Total infraestructura** | **~$500/año** |

> El costo de desarrollo se confirmará con una cotización de precio fijo antes de iniciar el trabajo.

---

## Fase 2 — Webbot de Consultas de Paquetes

**Inicia una vez que el sitio web esté operativo**

### Objetivo
Dar a los clientes un asistente conversacional dentro del sitio web para consultar el estado de su paquete, resolver preguntas frecuentes y obtener cotizaciones — sin necesidad de contactar a Kimberly directamente.

---

### Funcionalidades del Webbot

- **Consulta de estado:** El cliente escribe su número de rastreo y el webbot responde con el estado actualizado del paquete
- **Preguntas frecuentes:** Respuestas automáticas sobre tiempos de entrega, tarifas, restricciones de envío y uso del servicio
- **Cotizaciones:** El bot recopila datos del paquete (peso, dimensiones, tipo) y entrega una estimación de costo
- **Escalamiento:** Si la consulta es compleja, el bot redirige al cliente a WhatsApp con Kimberly

---

### Diseño Conversacional

- Flujo natural y amigable — sin menús rígidos ni respuestas robóticas
- Tono adaptado al segmento objetivo (mecánicos y amas de casa con baja adopción tecnológica)
- Disponible 24/7 sin intervención manual

---

### Presupuesto Fase 2

| Concepto | Costo estimado |
|---|---|
| Desarrollo del webbot | Por confirmar |
| Plataforma de IA / chatbot | Por confirmar según herramienta seleccionada |

---

## Fase 3 — Integración API con Atena

**Inicia una vez que el webbot esté funcionando**

### Objetivo
Automatizar completamente el rastreo de paquetes mediante una conexión directa entre el sitio web de Kimo y el sistema interno del courier **Atena**, eliminando la necesidad de actualizaciones manuales de estado.

---

### Desafío Técnico

El problema central es vincular el **número de rastreo original del cliente** con el **número de rastreo interno** generado por Atena. Esta integración requiere:

1. Acceso a la API de Atena (documentación y credenciales)
2. Mapeo entre el número del cliente y el número interno de Atena
3. Sincronización automática de estados de entrega en tiempo real

---

### Flujo Automatizado (Meta)

```
Cliente ingresa su número → Sistema consulta API de Atena → 
Estado se muestra automáticamente → Sin intervención manual
```

---

### Condiciones para Iniciar Fase 3

- Confirmar que Atena tiene una API disponible y documentada
- Evaluar costo y complejidad de la integración
- Si la API no está disponible, la Fase 2 (webbot + rastreo manual) continúa como solución permanente

---

### Presupuesto Fase 3

| Concepto | Costo estimado |
|---|---|
| Desarrollo de integración API | Por confirmar según complejidad |
| Costos de API de Atena (si aplica) | Por confirmar con Atena |

---

## Resumen de Fases y Tiempos

| Fase | Descripción | Duración |
|---|---|---|
| **Fase 1** | Sitio web profesional con rastreo manual | 1–8 días hábiles |
| **Fase 2** | Webbot para consultas de paquetes y preguntas frecuentes | Por definir |
| **Fase 3** | Integración API con Atena para rastreo automático | Por definir (sujeto a disponibilidad de API) |

---

## Servicios Incluidos por Fase

Cada servicio está alineado a la fase en que aporta más valor. Los de Fase 1 son la base técnica y de visibilidad; los de Fase 2 amplían la presencia digital inteligente; los de Fase 3 completan la automatización.

---

### Fase 1 — Fundación Digital

#### SSL / Seguridad HTTPS
Certificado de seguridad obligatorio para que Google indexe el sitio correctamente. Los navegadores marcan sitios sin SSL como *"No seguros"*, lo que destruye la confianza del cliente antes de que lean una sola palabra.
- Certificado SSL instalado y activo
- Redirección automática de HTTP a HTTPS

---

#### SEO Técnico — Posicionamiento en Google
Garantiza que Kimo aparezca cuando alguien en Costa Rica busca *"reenvío de paquetes desde USA"*, *"casillero en Miami"* o *"traer paquetes de Amazon a Costa Rica"*.
- Estructura de URLs amigables para buscadores
- Etiquetas de título y meta descripción optimizadas por página
- Velocidad de carga optimizada (Core Web Vitals)
- Sitemap XML y archivo robots.txt
- Marcado de datos estructurados (Schema.org) para negocios locales — dirección, horario, tipo de servicio visibles en Google

**Resultado:** El sitio empieza a posicionarse orgánicamente sin pagar publicidad desde el primer día.

---

#### Google Search Console
Herramienta gratuita de Google que muestra en qué búsquedas aparece Kimo, cuántos clics recibe y qué errores técnicos frenan el posicionamiento.
- Verificación del sitio y envío del sitemap
- Monitoreo de términos de búsqueda que generan visitas

---

#### Google Analytics 4
Registra todo lo que ocurre en el sitio: cuántas personas lo visitan, desde dónde llegan, qué páginas ven y si usan el rastreador de paquetes.
- Instalación y configuración completa
- Eventos clave configurados: uso del rastreador, clics en WhatsApp, visitas a contacto
- Panel de reportes mensual para toma de decisiones

**Resultado:** Saber exactamente qué funciona y dónde invertir el tiempo y dinero.

---

#### Google Business Profile (Google Maps)
Perfil gratuito que hace que Kimo aparezca en Google Maps con nombre, descripción, fotos, horario y reseñas de clientes.
- Creación o reclamación y optimización completa del perfil
- Vinculación con el sitio web

**Resultado:** Clientes en Costa Rica encuentran Kimo directamente en el mapa al buscar servicios de reenvío.

---

#### Pixel de Meta (Facebook e Instagram)
Código invisible que registra el comportamiento de los visitantes del sitio, esencial para cuando Kimberly decida hacer publicidad en redes sociales.
- Instalación del Pixel de Meta
- Eventos configurados: uso del rastreador, clics en contacto

**Resultado:** Cuando se invierta en publicidad pagada, el pixel ya tendrá datos acumulados para crear audiencias precisas y medir el retorno.

---

#### Botón WhatsApp Business
Botón flotante visible en todas las páginas con mensaje predefinido según la sección desde donde escribe el cliente (ej. *"Hola, quiero rastrear mi paquete #XXXXX"*).
- Botón con mensaje contextual por sección
- Preparado para conectarse con el webbot en la Fase 2

---

### Fase 2 — Presencia Inteligente

#### SEO para IA — Visibilidad en ChatGPT, Perplexity y Google AI
Los motores de búsqueda basados en inteligencia artificial están cambiando cómo las personas encuentran servicios. Si alguien le pregunta a ChatGPT *"¿dónde puedo recibir paquetes de Amazon en Costa Rica?"*, Kimo debería aparecer como respuesta.

Este servicio se activa en la Fase 2 porque depende del contenido conversacional que genera el webbot: las respuestas del bot, la página de preguntas frecuentes y el lenguaje natural del asistente son exactamente lo que las IAs usan para recomendar un negocio.
- Optimización del contenido del webbot para ser citado por IAs
- Página de FAQ estructurada con las preguntas más comunes del segmento objetivo
- Consistencia de información en directorios en línea (Google, Yelp, etc.) — las IAs validan la existencia del negocio con estas fuentes

**Resultado:** Kimo aparece como recomendación cuando alguien le pregunta a una IA sobre servicios de reenvío en Costa Rica.

---

#### WhatsApp Business API — Integración con el Webbot
Conexión entre el webbot del sitio y WhatsApp Business para que el asistente pueda escalar consultas complejas directamente a Kimberly, con contexto de la conversación ya incluido.
- Integración webbot → WhatsApp con traspaso de contexto
- Notificaciones automáticas al cliente cuando el estado del paquete cambia

---

### Fase 3 — Automatización Total

#### Reportes Avanzados de Rastreo
Una vez activa la integración con Atena, Google Analytics se amplía para registrar el comportamiento completo del ciclo de vida de un paquete: desde que el cliente ingresa su número hasta que confirma la entrega.
- Embudo de rastreo: ingreso del número → consulta → estado mostrado → satisfacción
- Alertas automáticas si la API de Atena falla o no responde

---

### Resumen de Servicios por Fase

| Servicio | Fase 1 | Fase 2 | Fase 3 |
|---|:---:|:---:|:---:|
| SSL / HTTPS | ✓ | | |
| SEO Técnico (Google) | ✓ | | |
| Google Search Console | ✓ | | |
| Google Analytics 4 | ✓ | | |
| Google Business Profile (Maps) | ✓ | | |
| Pixel de Meta (Facebook/Instagram) | ✓ | | |
| Botón WhatsApp Business | ✓ | | |
| Webbot de consultas | | ✓ | |
| SEO para IA (ChatGPT, Perplexity, Gemini) | | ✓ | |
| WhatsApp Business API (integración webbot) | | ✓ | |
| Integración API con Atena | | | ✓ |
| Reportes avanzados de rastreo | | | ✓ |

---

## Próximos Pasos

1. **Aprobar esta propuesta** — confirmación para iniciar la Fase 1
2. **Proveer activos de marca** — archivos del logo, códigos de color, tipografías y contenido del sitio
3. **Cotización de precio fijo** — antes de comenzar el desarrollo
4. **Consultar con Atena** — verificar disponibilidad de API para planificar la Fase 3

---

*Esta propuesta fue preparada con base en la reunión de descubrimiento con Kimberly Montoya. Los tiempos y costos son estimaciones sujetas a confirmación.*

*¿Preguntas? Agendemos una llamada de seguimiento.*
