# KIMO Logistics — Sitio Web Fase 1: Diseño Técnico

**Fecha:** 2026-06-27  
**Cliente:** Kimberly Montoya — KIMO, servicio de reenvío de paquetes EE.UU. → Costa Rica  
**Segmentos:** Mecánicos (autopartes) y amas de casa — baja adopción tecnológica, mobile-first

---

## 1. Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR para tracking dinámico, SEO excelente, escalable a Fase 2/3 |
| Estilos | Tailwind CSS | Velocidad de desarrollo, mobile-first nativo |
| Hosting | Vercel (plan gratuito) | Nativo para Next.js, SSL automático, CD automático |
| Dominio | Hostinger (~$10–15/año) | Familiar para el cliente, apunta DNS a Vercel |
| Base de datos tracking | Google Sheets + API | Kimberly actualiza sin curva de aprendizaje |
| Analytics | Google Analytics 4 | Comportamiento de usuarios |
| Marketing | Meta Pixel | Audiencias para futura publicidad pagada |
| Tipografía | Montserrat (Google Fonts) | Tipografía oficial de marca |

---

## 2. Arquitectura

```
Next.js 14 App Router
├── / (landing page — scroll único)
├── /rastreo/[numero] (resultado de tracking — SSR)
└── API Routes
    └── /api/tracking/[numero] → consulta Google Sheets
```

### Flujo de tracking
```
Cliente escribe #tracking en sección Rastreo
  → redirect a /rastreo/123456
  → Next.js Server Component consulta Google Sheets API
  → muestra estado + descripción + fecha
  → botón WhatsApp si el paquete no aparece
```

### Flujo admin (Kimberly)
```
Kimberly abre Google Sheet
  → agrega/edita fila: [#tracking | Estado | Descripción | Fecha]
  → sitio refleja el cambio en tiempo real (sin redespliegue)
```

### Google Sheets — Estructura del archivo

**Hoja 1: Tracking**
| Columna | Tipo | Ejemplo |
|---|---|---|
| numero_tracking | string | CR-2026-001 |
| estado | string | En aduana CR |
| descripcion | string | Tu paquete está en proceso de despacho |
| fecha_actualizacion | date | 2026-06-27 |
| paso_actual | number | 3 (1-5) |

**Hoja 2: Noticias**
| Columna | Tipo | Ejemplo |
|---|---|---|
| titulo | string | Black Friday — Envíos sin recargo |
| descripcion | string | Del 28 al 30 de noviembre... |
| fecha | date | 2026-11-28 |
| activo | boolean | TRUE |

Kimberly gestiona tracking y noticias desde el mismo archivo de Google Sheets.

---

## 3. Rutas y Páginas

### `/` — Landing Page (scroll único)
Seis secciones en orden de scroll:

1. **Hero** — imagen full-screen stock photo (avión/bodega/logística), overlay navy 60%, headline + 2 CTAs
2. **¿Cómo funciona?** — 3 pasos horizontales (Compra en USA → Enviamos → Recibís en CR)
3. **Dirección del almacén** — tarjeta con dirección Miami + botón "Copiar dirección"
4. **Rastreo** — campo de texto + botón → redirect a `/rastreo/[numero]`
5. **Noticias y Promociones** — grid de cards editables (Black Friday, anuncios)
6. **Footer/Contacto** — logo, WhatsApp, email, redes sociales, copyright

**Elemento global:** Botón WhatsApp flotante (esquina inferior derecha, todas las páginas)

### `/rastreo/[numero]` — Resultado de Tracking
- Navbar estándar
- Número de paquete como título
- Timeline vertical de 5 pasos con indicador visual del paso actual
- Fecha de última actualización
- CTA WhatsApp si número no existe o para consultas
- Si número no existe: mensaje amigable + botón WhatsApp

---

## 4. Sistema Visual

### Paleta de colores
```
Navy      #401B3C  → navbar, overlays, textos principales
Teal      #1FB6B0  → CTAs, acentos, íconos activos
Gray      #687280  → texto secundario
Light     #F2F2F5  → fondos de secciones alternas
White     #FFFFFF  → fondos principales
```

### Tipografía
```
Display:  Montserrat SemiBold 700  48–72px  → Titulares hero
Heading:  Montserrat SemiBold 600  28–36px  → Títulos de sección
Body:     Montserrat Regular 400   16–18px  → Texto general
Label:    Montserrat Medium 500    14px     → Botones, nav
```

### Componentes

**Navbar**
- En hero (top): transparente, texto blanco
- Al hacer scroll: fondo blanco con backdrop-blur, texto navy — transición suave 300ms
- Logo KIMO izquierda
- Links de navegación centrados con smooth scroll
- Botón "Rastrear paquete" teal a la derecha
- Móvil: menú hamburguesa

**Botones**
- Primario: `bg-teal text-white rounded-full px-8 py-3`
- Secundario: `border-2 border-navy text-navy rounded-full px-8 py-3`
- Hover: 10% más oscuro con transición 200ms

**Cards (Noticias)**
- `rounded-xl shadow-md bg-white`
- Imagen de portada, fecha, título, descripción corta

**Hero**
- `min-h-screen` con stock photo como background
- Overlay: `bg-navy/60`
- Texto blanco centrado
- Dos CTAs apilados en móvil, lado a lado en desktop

**Timeline de tracking**
- 5 pasos verticales
- Pasos completados: ícono check + color teal
- Paso actual: ícono círculo animado + color teal bold
- Pasos pendientes: color gray claro

### Responsive
- Mobile-first en Tailwind (sm: md: lg:)
- Breakpoints: 640px / 768px / 1024px / 1280px
- Max-width contenido: 1200px centrado
- Secciones: padding 80px desktop / 48px móvil

---

## 5. SEO y Analítica (Fase 1)

| Ítem | Implementación |
|---|---|
| SSL | Automático en Vercel |
| Meta tags | `next/metadata` por página |
| Open Graph | Para compartir en WhatsApp/Facebook |
| Sitemap | `next-sitemap` generado automático |
| robots.txt | Estándar |
| Schema.org | LocalBusiness markup en footer |
| Google Analytics 4 | Via `@next/third-parties/google` |
| Meta Pixel | Script en `layout.tsx` |
| Google Search Console | Verificación via meta tag |

**Keywords objetivo (Costa Rica):**
- "casillero en Miami Costa Rica"
- "reenvío paquetes USA Costa Rica"
- "traer paquetes Amazon Costa Rica"
- "KIMO casillero"

---

## 6. Infraestructura y Costos

| Concepto | Proveedor | Costo |
|---|---|---|
| Dominio .com | Hostinger | ~$12/año |
| Hosting | Vercel (free) | $0 |
| SSL | Vercel (automático) | $0 |
| Google Sheets (admin tracking) | Google (free) | $0 |
| Google Fonts (Montserrat) | Google (free) | $0 |
| Stock photos hero | Unsplash (free) o Pexels (free) | $0 |
| **Total infraestructura** | | **~$12/año** |

---

## 7. Fases de Desarrollo

### Fase 1 (este spec) — Sitio web completo
- Landing page con 6 secciones
- Página de tracking `/rastreo/[numero]`
- Integración Google Sheets
- SEO técnico + GA4 + Meta Pixel
- WhatsApp flotante
- Responsive/mobile-first

### Fase 2 (futuro) — Webbot
- Chatbot en el sitio para consultas y cotizaciones
- Integración WhatsApp Business API
- SEO para IA (ChatGPT, Perplexity)

### Fase 3 (futuro) — API Atena
- Reemplazar Google Sheets con API directa de Atena
- Rastreo automático en tiempo real

---

## 8. Referencias de Diseño

- **Estilo y tipografía:** apple.com — espaciado generoso, tipografía grande, minimalismo
- **Estructura e información:** alfalogisticscr.com, aeropost.com/SJO/es
- **Brand:** Logo y guía de marca KIMO (paleta azul/blanco/teal, Montserrat)

---

## 9. Decisiones Clave y Razones

| Decisión | Razón |
|---|---|
| Next.js sobre WordPress | Fases 2 y 3 requieren backend dinámico; reescribir en WordPress sería retrabajo |
| Google Sheets para tracking | Kimberly ya sabe usarlo; cero curva de aprendizaje; reemplazable en Fase 3 |
| Vercel sobre Hostinger VPS | Gratis, cero configuración de servidor, despliegue automático con git push |
| Single-page con tracking en ruta separada | UX: los clientes pueden guardar `/rastreo/123456` en favoritos |
| Montserrat via Google Fonts | Tipografía oficial de marca, gratuita, excelente rendimiento web |
