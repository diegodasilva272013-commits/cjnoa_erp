# Qué hace el ERP con el agente de ElevenLabs

Todo vive en `api/turnos/[accion].ts` (una sola función de Vercel, ruta dinámica). Dominio: `https://cjnoa-erp.vercel.app`.
Base: Supabase `yvuxcpqlbybmtkrnmnsj`. Zona horaria del ERP para fechas y horas: Jujuy (UTC−3).

## 1. Autenticación

| Ruta | Quién la llama | Cómo se autentica |
|---|---|---|
| `historial`, `disponibles`, `agendar`, `registrar`, `inicio` | el agente (herramientas y pre-call) | `Authorization: Bearer <TURNOS_AGENTE_SECRET>` (también acepta `x-api-key`) |
| `post-call` | ElevenLabs (webhook) | firma HMAC `elevenlabs-signature` con `ELEVENLABS_WEBHOOK_SECRET` (rechaza firmas de más de 30 min) |
| `sincronizar` | las pantallas del ERP (sesión de Supabase) o el agente (secreto) | Bearer con el token de un usuario logueado, o `TURNOS_AGENTE_SECRET` |
| `respaldo` | Meta/WhatsApp | verificación de Meta (agente de respaldo, inactivo) |

## 2. Identidad de la persona: el teléfono

La persona se identifica **solo por teléfono**. Se toman los **últimos 10 dígitos** (`telefono_clave`), así `+54 9 345 410-0816`, `5493454100816` y `3454100816` son la misma persona.
Las tablas `conversaciones_whatsapp`, `consultas_agendadas` y `leads` tienen la columna calculada `telefono_clave` (la base no deja escribirla a mano).
Si el teléfono tiene menos de 8 dígitos útiles, no se crea ni se busca lead.

## 3. Qué pasa en cada conversación, paso a paso

1. **Llega un mensaje por WhatsApp.** ElevenLabs llama al **pre-call** `POST /api/turnos/inicio` con `caller_id`.
   - El ERP **crea el lead con el teléfono** (si no existe) y, antes de responder, intenta traer de ElevenLabs las conversaciones recientes que falten (máx. 2, 2,5 s).
   - Devuelve variables dinámicas: `tiene_historial`, `es_recurrente`, `cliente_nombre`, `cliente_historial`, `fecha_hoy`, `dia_hoy`, `hora_actual`.
2. **El agente pregunta por el cliente:** `GET /api/turnos/historial?telefono=...` (misma información que el pre-call).
3. **El agente guarda cada intercambio:** `POST /api/turnos/registrar`.
4. **El agente ofrece turnos:** `GET /api/turnos/disponibles?profesional=&fecha=`.
5. **El agente agenda:** `POST /api/turnos/agendar`.
6. **Al terminar la charla,** ElevenLabs manda `POST /api/turnos/post-call` (transcripción completa y audio) si el webhook está asignado al agente.
7. **Red de seguridad:** `POST /api/turnos/sincronizar` busca en la API de ElevenLabs (`ELEVENLABS_API_KEY`) lo que no llegó. Se dispara desde `/leads-campanas` y `/consultas-whatsapp` al abrirlas y cada 60 s, y desde el pre-call.

## 4. Rutas en detalle

### `historial` (GET) — memoria del cliente
Lee `consultas_agendadas` (turnos), `conversaciones_whatsapp` (charlas) y `leads` (ficha) por `telefono_clave`. Devuelve texto (no booleanos):

- `tiene_historial`, `es_recurrente`: `"true"` / `"false"`.
- `cliente_nombre`: primero el del último turno, si no el del lead (nombre + apellido), si no el de la conversación.
- `cliente_historial` (máx. 4.000 caracteres): ficha (campaña, rama, trámite, etapa) · hasta 5 últimos turnos (fecha, hora, abogado, tema, si pagó la reserva) · resumen de lo hablado · **últimos 12 mensajes textuales** de la conversación más reciente.

### `registrar` (POST) — cada mensaje, en el momento
Parámetros: `telefono_cliente` (o `telefono`), `conversation_id`, `mensaje` (lo que dijo el cliente), `respuesta_agente`, y opcionales de ficha (ver sección 5).
- **Una persona = una conversación:** se reutiliza la fila más reciente de ese teléfono aunque ElevenLabs cambie el `conversation_id`. Si no hay teléfono, se usa el `conversation_id`.
- Agrega los mensajes sin duplicar reintentos idénticos y guarda en `conversaciones_whatsapp`: `telefono`, `nombre`, `resumen`, `mensajes` (jsonb `[{from:'cliente'|'agente', texto}]`).
- **Nombre inferido:** si el agente no mandó nombre, se saca de lo que escribió el cliente ("me llamo X", "mi nombre es X", o la respuesta suelta a "¿cómo te llamás?"). No toma profesiones ni respuestas comunes ("soy docente", "sí").
- Actualiza el lead (sección 5).

### `disponibles` (GET)
Disponibilidad = horarios cargados por Alejandro/Fabricio (`disponibilidad_horarios`, semanal o fecha puntual, con duración del turno) **menos lo ocupado** en `consultas_agendadas` (30 min), `audiencias_general` (60 min), `audiencias` previsional (60 min) y `eventos_internos` (su duración o 60 min). Hoy solo ofrece horarios que todavía no pasaron.
- Con `fecha`: `horarios_disponibles` de ese día.
- Sin `fecha`: `proximos_dias` (hasta 5 días con lugar, mirando 14 días).
- Toda respuesta incluye `hoy`, `dia_hoy` y `hora_actual`.

### `agendar` (POST)
Obligatorios: `profesional` (Alejandro o Fabricio), `nombre`, `fecha` (`YYYY-MM-DD`), `hora` (`HH:MM`). Opcionales: `apellido`, `telefono` (o `telefono_cliente`, `caller_id`), `tema`/`detalle`, `pago`, `monto_reserva`, `modalidad`, y datos de ficha (`email`, `dni_o_cuil`, `localidad`, `campana`, `rama_consulta`, `tipo_tramite_previsional`, `calificacion`, `resumen`).
- Verifica que el horario siga libre (si no, `409` con los horarios disponibles). Un índice único impide dos turnos del agente en el mismo profesional/fecha/hora.
- Inserta en **`consultas_agendadas`**: `cliente_nombre`, `telefono`, `detalle_consulta`, `socio_carga` y `abogado_asignado` (= profesional), `fecha_carga` (hoy), `fecha_consulta`, `hora_consulta`, `monto_reserva`, `reserva_pagada`, `reserva_modalidad`, `observaciones` ("Agendado por el agente de IA" + modalidad), `conversation_id`, `origen = 'agente'`. Es lo que muestra el Calendario.
- Pasa el lead a **Agendado** y le guarda nombre, apellido, mail, DNI, etc.
- **Cuidado con la plata:** si llega `pago: true` con `monto_reserva > 0`, un **trigger de la base** crea automáticamente un **ingreso** en finanzas ("Reserva consulta agendada - nombre"). Al borrar ese turno, otro trigger borra el ingreso. El agente debe mandar `pago: true` solo si el cliente mostró el comprobante.
- **No crea eventos de Google Calendar.**

### `post-call` (POST, webhook)
- `post_call_transcription`: guarda la conversación **completa** (mensajes de ambos), el resumen que genera ElevenLabs (`transcript_summary`, hoy en inglés) y los datos de Data Collection (`analysis.data_collection_results`). Teléfono desde `system__caller_id`, `telefono`, `metadata.phone_call.external_number` o `metadata.whatsapp.whatsapp_user_id`. Si nadie mandó el nombre, se infiere de la transcripción. Une los mensajes con los ya guardados sin repetir y registra el `conversation_id` en `conversation_ids`.
- `post_call_audio`: sube el MP3 al bucket privado `conversaciones-audio` (`<conversation_id>.mp3`) y lo liga a la conversación de la persona (`audios` y `audio_path`). Vercel corta pedidos de más de 4,5 MB, por eso existe la sincronización por API.

### `sincronizar` (POST)
Pide a ElevenLabs las conversaciones recientes (hasta 7 días) y, por cada una que no esté en `conversation_ids`, descarga el detalle y el audio y los guarda igual que el post-call. Procesa hasta 4 por pasada. **`ELEVENLABS_SYNC_DESDE`** (fecha ISO) pone un piso: no importa nada anterior. Úsalo después de limpiar pruebas.

## 5. El lead (`leads`) — una fila por persona

Se crea al primer mensaje (pre-call) y se completa con lo que llegue por `registrar`, `agendar`, `post-call` o `sincronizar`.

**Campos y nombres con los que los acepta** (el ERP reconoce varios alias):

| Columna | Parámetros aceptados |
|---|---|
| `nombre` | `nombre`, `nombre_consultante`, `nombre_cliente` |
| `apellido` | `apellido`, `apellido_cliente` |
| `email` | `email`, `mail`, `correo`, `correo_electronico` |
| `dni_cuil` | `dni_o_cuil`, `dni`, `cuil`, `cuil_dni`, `dni_cuil` |
| `localidad` | `localidad`, `ciudad` |
| `campana` | `campana`, `campaign`, `palabra_clave` (solo se guarda la primera vez) |
| `mensaje_inicial` | `mensaje_inicial`, `primer_mensaje` (solo la primera vez) |
| `rama` | `rama_consulta`, `rama` |
| `tipo_tramite` | `tipo_tramite_previsional`, `tipo_tramite`, `tramite` |
| `calificacion` | `calificacion` (`alto_valor`, `estandar`, `fuera_avatar`) |
| `resumen` | `resumen`, `resumen_caso` |
| `requiere_turno` | `requiere_turno` (true/false, "sí"/"no") |
| `datos` (jsonb) | **cualquier otro campo** que mande el agente |

- **Nunca se guardan claves ni contraseñas** (cualquier campo cuyo nombre contenga clave/password/contraseña/pass, p. ej. la clave de ANSES): quedan solo en la transcripción.
- Lo último que llega pisa lo anterior; campaña y mensaje inicial se conservan.
- **Etapa automática:** `agendado` (tiene turno) → `fuera_de_avatar` (calificación `fuera_avatar`) → `califico_sin_horario` (tiene rama y DNI o calificación) → `calificacion_a_medias` (2 o más mensajes del cliente) → `nuevo`. Las etapas que mueve el equipo a mano (`consulta_realizada`, `cliente`, `no_califica`) **nunca se pisan**.
- Gestión manual (desde `/leads-campanas`): etapa, asignado a, próxima acción, notas.

## 6. Dónde se ve en el ERP

- **`/consultas-whatsapp`:** conversaciones con chat completo, audios y turnos agendados; marca "Sin turno agendado" (lista de llamados pendientes). Tiempo real.
- **`/leads-campanas`:** tablero Kanban por etapa, ficha completa con la consulta agendada, resumen, conversaciones y audios, y pestaña de métricas. Los turnos del agente que no tengan lead aparecen igual en "Agendado". Tiempo real.
- **`/calendario`:** los turnos del agente (`origen = 'agente'`) y el modal de disponibilidad de Alejandro y Fabricio (varios días a la vez).

## 7. Tablas que toca el agente

`conversaciones_whatsapp`, `leads`, `consultas_agendadas` (+ trigger a `ingresos`), `disponibilidad_horarios` (solo lectura), `audiencias_general`, `audiencias`, `eventos_internos` (solo lectura, para ocupar horarios), bucket `conversaciones-audio`.
Columnas agregadas por migraciones: `consultas_agendadas.conversation_id/origen/telefono_clave`, `conversaciones_whatsapp.telefono_clave/conversation_ids/audios`.

## 8. Variables de entorno (Vercel)

`TURNOS_AGENTE_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` (opcional, filtra la sincronización), `ELEVENLABS_SYNC_DESDE` (opcional, piso de la sincronización), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Agente de respaldo (inactivo): `WHATSAPP_*`, `META_APP_SECRET`, `ANTHROPIC_API_KEY`, `RESPALDO_PROMPT`.
