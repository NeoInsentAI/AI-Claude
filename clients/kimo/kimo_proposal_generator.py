from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

doc = Document()

# ── Page margins ──────────────────────────────────────────────────────────────
for section in doc.sections:
    section.top_margin    = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin   = Cm(2.8)
    section.right_margin  = Cm(2.8)

# ── Brand colors ──────────────────────────────────────────────────────────────
BLUE_DARK   = RGBColor(0x1A, 0x3A, 0x6C)   # #1A3A6C  deep navy
BLUE_MID    = RGBColor(0x25, 0x6D, 0xC1)   # #256DC1  medium blue
BLUE_LIGHT  = RGBColor(0xD9, 0xE8, 0xF7)   # #D9E8F7  pale blue
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
GRAY_TEXT   = RGBColor(0x44, 0x44, 0x44)
GRAY_LIGHT  = RGBColor(0xF5, 0xF5, 0xF5)

# ── Helper: set paragraph background shading ──────────────────────────────────
def shade_paragraph(paragraph, hex_color: str):
    pPr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  hex_color)
    pPr.append(shd)

def shade_cell(cell, hex_color: str):
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  hex_color)
    tcPr.append(shd)

def set_cell_border(cell, **kwargs):
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top','left','bottom','right','insideH','insideV'):
        val = kwargs.get(edge)
        if val:
            tag = OxmlElement(f'w:{edge}')
            for k,v in val.items():
                tag.set(qn(f'w:{k}'), v)
            tcBorders.append(tag)
    tcPr.append(tcBorders)

# ── Helper: add styled run ────────────────────────────────────────────────────
def add_run(para, text, bold=False, italic=False, size=11,
            color=None, font='Calibri'):
    run = para.add_run(text)
    run.bold   = bold
    run.italic = italic
    run.font.name = font
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    return run

# ── Helper: section heading strip ────────────────────────────────────────────
def add_section_heading(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after  = Pt(6)
    shade_paragraph(p, '1A3A6C')
    run = p.add_run(f'  {text}')
    run.bold = True
    run.font.name = 'Calibri'
    run.font.size = Pt(13)
    run.font.color.rgb = WHITE

# ── Helper: sub-heading ───────────────────────────────────────────────────────
def add_sub_heading(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after  = Pt(4)
    run = p.add_run(text)
    run.bold = True
    run.font.name = 'Calibri'
    run.font.size = Pt(11)
    run.font.color.rgb = BLUE_MID

# ── Helper: body paragraph ────────────────────────────────────────────────────
def add_body(doc, text, italic=False, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after  = Pt(4)
    add_run(p, text, italic=italic, color=color or GRAY_TEXT)

# ── Helper: bullet ────────────────────────────────────────────────────────────
def add_bullet(doc, text, bold_prefix=None):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after  = Pt(1)
    p.paragraph_format.left_indent  = Inches(0.3)
    if bold_prefix:
        add_run(p, bold_prefix, bold=True, color=GRAY_TEXT)
        add_run(p, text, color=GRAY_TEXT)
    else:
        add_run(p, text, color=GRAY_TEXT)

# ── Helper: price table ───────────────────────────────────────────────────────
def add_price_table(doc, rows):
    table = doc.add_table(rows=1+len(rows), cols=2)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.LEFT

    # header row
    hdr = table.rows[0].cells
    for i, label in enumerate(['Concepto','Monto']):
        shade_cell(hdr[i], '256DC1')
        hdr[i].vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = hdr[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(label)
        r.bold = True
        r.font.name = 'Calibri'
        r.font.size = Pt(10)
        r.font.color.rgb = WHITE

    # data rows
    for idx, (concept, amount) in enumerate(rows):
        row_cells = table.rows[idx+1].cells
        bg = 'D9E8F7' if idx % 2 == 0 else 'FFFFFF'
        shade_cell(row_cells[0], bg)
        shade_cell(row_cells[1], bg)
        row_cells[0].paragraphs[0].add_run(concept).font.size = Pt(10)
        row_cells[0].paragraphs[0].runs[0].font.name = 'Calibri'
        row_cells[0].paragraphs[0].runs[0].font.color.rgb = GRAY_TEXT
        r2 = row_cells[1].paragraphs[0].add_run(amount)
        r2.font.size = Pt(10)
        r2.font.name = 'Calibri'
        r2.bold = True
        r2.font.color.rgb = BLUE_DARK
        row_cells[1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT

    # column widths
    for row in table.rows:
        row.cells[0].width = Cm(10)
        row.cells[1].width = Cm(5)

    doc.add_paragraph()

# ── Helper: info box (light blue) ────────────────────────────────────────────
def add_info_box(doc, label, lines):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after  = Pt(2)
    shade_paragraph(p, 'D9E8F7')
    add_run(p, f'  {label}', bold=True, color=BLUE_DARK, size=10)
    for line in lines:
        p2 = doc.add_paragraph()
        shade_paragraph(p2, 'D9E8F7')
        p2.paragraph_format.space_before = Pt(0)
        p2.paragraph_format.space_after  = Pt(0)
        add_run(p2, f'  • {line}', color=GRAY_TEXT, size=10)
    doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
#  COVER / HEADER
# ══════════════════════════════════════════════════════════════════════════════
p = doc.add_paragraph()
shade_paragraph(p, '1A3A6C')
p.paragraph_format.space_before = Pt(0)
p.paragraph_format.space_after  = Pt(0)
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
add_run(p, '  KIMO LOGISTICS', bold=True, size=22, color=WHITE)

p2 = doc.add_paragraph()
shade_paragraph(p2, '256DC1')
p2.paragraph_format.space_before = Pt(0)
p2.paragraph_format.space_after  = Pt(0)
p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
add_run(p2, '  Propuesta de Desarrollo Web — Junio 2026', size=11, color=WHITE)

doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
#  RESUMEN EJECUTIVO
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Resumen Ejecutivo')

add_body(doc,
    'El objetivo de esta primera fase es dotar a Kimo de una presencia digital profesional '
    'que genere confianza, facilite la captación de clientes y permita ofrecer una '
    'funcionalidad básica de rastreo de paquetes.')

add_body(doc,
    'La estrategia acordada consiste en desarrollar el proyecto por fases para minimizar '
    'riesgos y validar el modelo de negocio antes de realizar inversiones mayores en '
    'automatización e inteligencia artificial.')

# ══════════════════════════════════════════════════════════════════════════════
#  CONTEXTO DEL NEGOCIO
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Contexto del Negocio')

for item in [
    ('Negocio: ', 'Kimo — reenvío personal de paquetes, EE. UU. → Costa Rica.'),
    ('Segmentos objetivo: ', 'Compradores de autopartes (mecánicos) y artículos del hogar (amas de casa) — compras recurrentes con baja adopción tecnológica.'),
    ('Modelo: ', 'Kimo maneja paquetes pequeños directamente; carga grande se refiere a un courier asociado a cambio de comisión.'),
    ('Marca: ', 'Logo existente con paleta azul/blanco y tipografías definidas.'),
]:
    add_bullet(doc, item[1], bold_prefix=item[0])

# ══════════════════════════════════════════════════════════════════════════════
#  FASE 1
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Fase 1 — Sitio Web Profesional + Rastreo de Paquetes')

add_body(doc, 'Duración estimada: 1 a 8 días hábiles', italic=True, color=BLUE_MID)

# --- Diseño web
add_sub_heading(doc, 'Diseño Web')
for b in [
    'Diseño profesional basado en la identidad visual actual de Kimo.',
    'Adaptado para computadoras, tablets y teléfonos móviles (mobile-first).',
    'Instalación como acceso directo en teléfonos (experiencia tipo aplicación).',
    'Optimización básica de velocidad y seguridad.',
]:
    add_bullet(doc, b)

# --- Secciones
add_sub_heading(doc, 'Secciones del Sitio')
for b in ['Inicio','Quiénes Somos','Cómo Funciona',
          'Rastreo de Paquetes','Promociones y Noticias','Contacto']:
    add_bullet(doc, b)

# --- Funcionalidades
add_sub_heading(doc, 'Funcionalidades')
for b in [
    'Formulario de contacto.',
    'Información del almacén en Estados Unidos.',
    'Botón de WhatsApp con mensaje contextual.',
    'Panel administrativo para actualización de contenido.',
    'Módulo de rastreo de paquetes.',
]:
    add_bullet(doc, b)

# --- Servicios incluidos Fase 1
add_sub_heading(doc, 'Servicios Incluidos en Fase 1')
for b in [
    'SSL / HTTPS — seguridad y confianza obligatoria.',
    'SEO Técnico — posicionamiento orgánico en Google desde el primer día.',
    'Google Search Console — monitoreo de búsquedas y errores de indexación.',
    'Google Analytics 4 — métricas de tráfico y comportamiento de usuarios.',
    'Google Business Profile — presencia en Google Maps con reseñas y horario.',
    'Pixel de Meta — preparación para publicidad futura en Facebook e Instagram.',
    'Botón WhatsApp Business — contacto directo desde cualquier página del sitio.',
]:
    add_bullet(doc, b)

# ──────────────────────────────────────────────────────────────────────────────
#  OPCIÓN A
# ──────────────────────────────────────────────────────────────────────────────
add_sub_heading(doc, 'Opción A — Rastreo Manual  ✦ Recomendada para iniciar')

add_body(doc,
    'El cliente consulta el estado de su paquete ingresando su número de rastreo. '
    'Las actualizaciones son ingresadas manualmente desde el panel administrativo por Kimberly.')

add_info_box(doc, 'Ventajas', [
    'Menor costo inicial.',
    'Implementación rápida (1–8 días hábiles).',
    'Sin dependencia de terceros (Atena).',
    'Riesgo técnico mínimo.',
])

add_price_table(doc, [
    ('Desarrollo inicial',              'USD $600'),
    ('Hosting y dominio (anual)',        'USD $120 / año'),
    ('Mantenimiento mensual (opcional)', 'USD $20 / mes'),
    ('Mantenimiento anual',             'USD $240 / año'),
])

# ──────────────────────────────────────────────────────────────────────────────
#  OPCIÓN B
# ──────────────────────────────────────────────────────────────────────────────
add_sub_heading(doc, 'Opción B — Rastreo Automatizado con Atena')

add_body(doc,
    'Integración con el sistema de Atena mediante API. El cliente ingresa su número '
    'de rastreo original y el sitio consulta automáticamente el estado actualizado del paquete.')

add_info_box(doc, 'Ventajas', [
    'Menor trabajo operativo para Kimberly.',
    'Mejor experiencia para el cliente.',
    'Escalable a largo plazo.',
])

add_info_box(doc, 'Consideraciones — la inversión final depende de:', [
    'Disponibilidad y documentación de la API de Atena.',
    'Costos de acceso definidos por Atena.',
    'Complejidad de la integración.',
])

add_price_table(doc, [
    ('Desarrollo del sitio web',      'USD $600'),
    ('Integración con Atena',         'USD $500 – $2,000'),
    ('Hosting y dominio (anual)',      'USD $120 / año'),
    ('Mantenimiento mensual',         'USD $30 – $75 / mes'),
    ('Mantenimiento anual',           'USD $360 – $900 / año'),
])

# ══════════════════════════════════════════════════════════════════════════════
#  FASE 2
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Fase 2 — Automatización e Inteligencia Artificial')

add_body(doc,
    'Una vez validado el negocio y alcanzado un volumen estable de clientes, se recomienda '
    'incorporar herramientas de automatización e inteligencia artificial.')

# Chatbot
add_sub_heading(doc, 'Chatbot Inteligente (Web)')
for b in ['Respuestas automáticas a preguntas frecuentes.',
          'Consulta de estado de paquetes.',
          'Solicitud de cotizaciones.']:
    add_bullet(doc, b)

# WhatsApp IA
add_sub_heading(doc, 'WhatsApp Business IA')
for b in ['Atención automática 24/7.',
          'Seguimiento de consultas y paquetes.',
          'Escalamiento a atención humana cuando se requiere.']:
    add_bullet(doc, b)

# SEO IA
add_sub_heading(doc, 'SEO para IA — Visibilidad en ChatGPT, Perplexity y Google AI')
add_body(doc,
    'Optimización del contenido del sitio y del chatbot para ser citado como recomendación '
    'cuando usuarios le preguntan a una inteligencia artificial sobre servicios de reenvío '
    'en Costa Rica.')
for b in [
    'FAQ estructurada con preguntas clave del segmento objetivo.',
    'Contenido conversacional diseñado para ser citado por modelos de IA.',
    'Consistencia de datos en directorios en línea (Google, Yelp, etc.).',
]:
    add_bullet(doc, b)

add_price_table(doc, [
    ('Chatbot IA Web',                      'USD $500 – $1,500'),
    ('WhatsApp IA',                          'USD $1,000 – $3,000'),
    ('SEO para IA (ChatGPT / Perplexity)',   'Incluido en desarrollo'),
    ('Mantenimiento mensual IA',             'USD $50 – $250 / mes'),
])

# ══════════════════════════════════════════════════════════════════════════════
#  FASE 3
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Fase 3 — Integración API con Atena')

add_body(doc,
    'Si en la Fase 1 se optó por el Rastreo Manual (Opción A), esta fase permite migrar a '
    'rastreo completamente automatizado una vez confirmada la disponibilidad técnica de '
    'la API de Atena y el crecimiento del negocio.')

for b in [
    'Mapeo del número de rastreo del cliente con el número interno de Atena.',
    'Sincronización automática de estados en tiempo real.',
    'Eliminación de actualizaciones manuales.',
    'Reportes avanzados del ciclo de vida del paquete vinculados a Google Analytics.',
]:
    add_bullet(doc, b)

add_price_table(doc, [
    ('Integración API con Atena',        'USD $500 – $2,000'),
    ('Costos de API de Atena (si aplica)','Por confirmar con Atena'),
    ('Mantenimiento mensual',            'USD $30 – $75 / mes'),
])

# ══════════════════════════════════════════════════════════════════════════════
#  RESUMEN
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Resumen de Fases y Servicios')

table = doc.add_table(rows=1, cols=4)
table.style = 'Table Grid'
table.alignment = WD_TABLE_ALIGNMENT.LEFT

headers = ['Servicio', 'Fase 1', 'Fase 2', 'Fase 3']
for i, h in enumerate(headers):
    shade_cell(table.rows[0].cells[i], '1A3A6C')
    p = table.rows[0].cells[i].paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(h)
    r.bold = True
    r.font.name = 'Calibri'
    r.font.size = Pt(9)
    r.font.color.rgb = WHITE

services = [
    ('Sitio web profesional',                    '✓','',''),
    ('Rastreo manual de paquetes',               '✓','',''),
    ('SSL / HTTPS',                              '✓','',''),
    ('SEO Técnico (Google)',                     '✓','',''),
    ('Google Analytics 4',                       '✓','',''),
    ('Google Search Console',                    '✓','',''),
    ('Google Business Profile (Maps)',           '✓','',''),
    ('Pixel de Meta (Facebook/Instagram)',       '✓','',''),
    ('Botón WhatsApp Business',                  '✓','',''),
    ('Chatbot IA Web',                           '','✓',''),
    ('WhatsApp Business IA',                     '','✓',''),
    ('SEO para IA (ChatGPT, Perplexity)',        '','✓',''),
    ('Integración API con Atena',                '','','✓'),
    ('Reportes avanzados de rastreo',            '','','✓'),
]

for idx, (svc, f1, f2, f3) in enumerate(services):
    row = table.add_row()
    bg = 'D9E8F7' if idx % 2 == 0 else 'FFFFFF'
    vals = [svc, f1, f2, f3]
    for j, val in enumerate(vals):
        shade_cell(row.cells[j], bg)
        p = row.cells[j].paragraphs[0]
        if j > 0:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(val)
        r.font.name = 'Calibri'
        r.font.size = Pt(9)
        if val == '✓':
            r.bold = True
            r.font.color.rgb = BLUE_MID
        else:
            r.font.color.rgb = GRAY_TEXT

# col widths
for row in table.rows:
    row.cells[0].width = Cm(9)
    for j in range(1,4):
        row.cells[j].width = Cm(2.1)

doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
#  RECOMENDACIÓN
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Recomendación')

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(6)
p.paragraph_format.space_after  = Pt(6)
shade_paragraph(p, 'D9E8F7')
add_run(p, '  Iniciar con la Opción A — Rastreo Manual', bold=True, color=BLUE_DARK, size=11)

add_body(doc,
    'Lanzar el sitio con rastreo manual permite validar la aceptación del mercado con una '
    'inversión inicial de USD $600–$720, sin dependencia de terceros y en el menor tiempo posible.')

add_body(doc,
    'Una vez confirmado el crecimiento del negocio y la disponibilidad técnica de Atena, '
    'se migra a la Opción B (rastreo automatizado) y posteriormente se incorporan el chatbot '
    'y las herramientas de inteligencia artificial.')

add_body(doc,
    'Este enfoque minimiza el riesgo financiero y técnico mientras valida el modelo de '
    'negocio antes de realizar inversiones mayores.', italic=True, color=BLUE_MID)

# ══════════════════════════════════════════════════════════════════════════════
#  PRÓXIMOS PASOS
# ══════════════════════════════════════════════════════════════════════════════
add_section_heading(doc, 'Próximos Pasos')

for step in [
    'Aprobar esta propuesta — confirmación para iniciar la Fase 1.',
    'Proveer activos de marca — logo, códigos de color, tipografías y contenido del sitio.',
    'Cotización de precio fijo — emitida antes de iniciar el desarrollo.',
    'Consultar con Atena — verificar disponibilidad de API para planificar Fases 2 y 3.',
]:
    add_bullet(doc, step)

doc.add_paragraph()

# footer note
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
add_run(p,
    'Esta propuesta fue preparada con base en la reunión de descubrimiento con Kimberly Montoya. '
    'Costos y tiempos son estimaciones sujetas a confirmación.',
    italic=True, size=9, color=RGBColor(0x88,0x88,0x88))

# ── Save ──────────────────────────────────────────────────────────────────────
out = '/Users/sera/AI-Claude/clients/kimo/Kimo-Propuesta-Web-2026.docx'
doc.save(out)
print(f'Saved: {out}')
