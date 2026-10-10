# Plan de contingencia — Agente CJ NOA (ElevenLabs)

Objetivo: que ningún consultante quede sin respuesta ni se pierda un lead si ElevenLabs
se queda sin saldo, falla, o si una herramienta del ERP no responde.

## 1. Qué puede fallar y cómo nos enteramos

| # | Falla | Síntoma | Cómo se detecta |
|---|---|---|---|
| R1 | ElevenLabs sin saldo/créditos | El agente deja de contestar en silencio | Alerta de consumo de ElevenLabs (email); control diario (sección 5) |
| R2 | Caída o lentitud de ElevenLabs / del modelo | Respuestas lentas o ausentes | Control diario; reclamos de clientes → activar Capa 4 |
| R3 | Una herramienta del ERP falla (401, 500, timeout) | El agente no puede ver horarios o agendar | Conversaciones con la marca "Sin turno agendado" en `/consultas-whatsapp` |
| R4 | Caída de Vercel/Supabase | Todo el ERP y las herramientas | Estado de Vercel/Supabase; control diario |

## 2. Capa 0 — Prevención (en ElevenLabs, la configura el dueño de la cuenta)

1. Activar la **recarga automática / facturación por uso** si el plan la ofrece, para que no se corte al agotar el saldo.
2. Configurar **alertas de consumo por email** a por lo menos dos personas (ej. 70 % y 90 % del plan).
3. Anotar el día de renovación del plan y el saldo mínimo aceptable.

## 3. Capa 1 — El agente nunca muestra errores (prompt del agente)

Agregar esta sección al final de «6. HERRAMIENTAS» del system prompt:

```
## 7. SI UNA HERRAMIENTA FALLA
- Si `consultar_historial` falla: seguí la conversación como con un cliente nuevo, sin mencionar el error.
- Si `consultar_disponibilidad` o `agendar_turno` fallan o no responden: NO le digas al cliente que hay un error técnico ni insistas más de una vez.
  Tomá nombre, teléfono y tema, y decile: "Ya dejé registrado su pedido. Un integrante del equipo lo contacta en el día para confirmar el horario."
- Nunca confirmes un turno si `agendar_turno` no devolvió status "success".
- Si el cliente es urgente, pasale el contacto directo del abogado que corresponde (sección 2).
```

## 4. Capa 2 — El ERP no pierde leads (ya implementado)

- Cada conversación llega al ERP por el webhook post-llamada y queda en `/consultas-whatsapp` (texto y audio).
- Las conversaciones **sin turno agendado** llevan una marca ámbar «Sin turno agendado»: es la **lista de llamados pendientes**. Si el agente no pudo agendar, el equipo ve ahí a quién devolverle el llamado.
- Si una herramienta falla, la conversación igual se registra.

## 5. Capa 3 — Responsable humano (control diario de 2 minutos)

Una persona asignada (y un suplente) revisa cada mañana:

1. En ElevenLabs: saldo restante y última conversación.
2. En `/consultas-whatsapp`: conversaciones nuevas y las marcadas «Sin turno agendado» → devolver el llamado.
3. En `/calendario`: que los turnos del agente aparezcan.

Si el agente no responde (R1/R2): el responsable contesta manualmente desde el WhatsApp del estudio y avisa al dueño de la cuenta de ElevenLabs.

## 6. Capa 4 — Agente de respaldo automático (construido, inactivo hasta activarlo)

Un segundo agente que atiende WhatsApp **sin ElevenLabs**: recibe los mensajes de Meta en
`https://cjnoa-erp.vercel.app/api/turnos/respaldo`, responde con un modelo de lenguaje (Anthropic) siguiendo el mismo
prompt del agente, y usa las mismas herramientas del ERP (historial, disponibilidad, agendar). Las conversaciones
quedan en `/consultas-whatsapp` y los turnos en `/calendario`, igual que siempre.
Si el modelo o el envío fallan, igual contesta un mensaje seguro («un integrante del equipo le responde a la brevedad»)
y deja la conversación registrada.

**Variables a cargar en Vercel** (mientras falten, la ruta no hace nada):

| Variable | Qué es |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Texto inventado; el mismo se pone en Meta al configurar el webhook |
| `META_APP_SECRET` | App Secret de la app de Meta (valida que los mensajes vengan de Meta) |
| `WHATSAPP_TOKEN` | Token permanente de la API de WhatsApp Cloud |
| `WHATSAPP_PHONE_ID` | ID del número de teléfono en la API de WhatsApp |
| `ANTHROPIC_API_KEY` | Clave de la API del modelo de respaldo |
| `RESPALDO_PROMPT` | El system prompt del agente (se pega completo acá, no en el repo, porque trae datos bancarios y teléfonos) |
| `RESPALDO_MODELO` | Opcional. Por defecto `claude-haiku-5-5` |

**Cómo se activa (cuando ElevenLabs falla):** en Meta for Developers → la app → WhatsApp → Configuración → Webhook,
cambiar la URL a `https://cjnoa-erp.vercel.app/api/turnos/respaldo` con el `WHATSAPP_VERIFY_TOKEN`.
**Para volver:** poner de nuevo la URL anterior. Es un cambio de un minuto y reversible.

**Antes de depender de esto hay que confirmar** que el número de WhatsApp está conectado a una app de Meta cuyo
webhook controla el estudio. Si la integración de WhatsApp de ElevenLabs administra el webhook por su cuenta, este paso
no se puede hacer sin ellos; en ese caso hay que migrar el número a una app propia de Meta.

**Limitaciones:** no entiende audios ni imágenes (le avisa al cliente y sigue por escrito) y responde solo texto.

## 7. Pendientes de configuración detectados en la bitácora de ElevenLabs

1. `registrar_consulta` apunta a `aretesoluciones.space` (otra plataforma, otra base). **Quitarla**: el ERP ya recibe la conversación completa por el webhook post-llamada; mantenerla es un punto de falla más.
2. `consultar_historial` envía el mismo token que usa la herramienta de Areté. El ERP exige `TURNOS_AGENTE_SECRET`; verificar que el header de esa herramienta lleve ese valor.
3. `agendar_turno`: si el agente manda `pago: true` junto con `monto_reserva`, el ERP **crea automáticamente un ingreso** en finanzas. El agente no puede confirmar una transferencia: indicarle que mande `pago: true` solo cuando el cliente muestre el comprobante, y de lo contrario `pago: false`.
