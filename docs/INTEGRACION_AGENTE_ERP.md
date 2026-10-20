# Qué hace el ERP con el agente de WhatsApp

Todo vive en `api/turnos/[accion].ts` (una sola función de Vercel, ruta dinámica). Dominio: `https://cjnoa-erp.vercel.app`.
Base: Supabase `yvuxcpqlbybmtkrnmnsj`. Zona horaria del ERP para fechas y horas: Jujuy (UTC−3).

## 1. Autenticación

| Ruta | Quién la llama | Cómo se autentica |
|---|---|---|
| `agente` (alias `respaldo`) | Kapso o Meta (WhatsApp) | firma HMAC del webhook (`KAPSO_WEBHOOK_SECRET` / `META_APP_SECRET`); sin firma válida se rechaza |
| `mercadopago` | Mercado Pago (webhook de Pagos) | firma `x-signature` con `MERCADOPAGO_WEBHOOK_SECRET`; además cada pago se consulta a la API de Mercado Pago con `MERCADOPAGO_ACCESS_TOKEN` |

No hay más rutas que esas dos. Las antiguas (`historial`, `disponibles`, `agendar`, `registrar`, `inicio`, `post-call`, `sincronizar`) se eliminaron: el agente usa esas funciones directamente, sin endpoints con un secreto compartido. `TURNOS_AGENTE_SECRET` ya no se usa.

## Confirmación de la reserva por transferencia (Mercado Pago)
Se activa sola cuando están cargadas `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET`; sin ellas, sigue el modo anterior (lectura del comprobante por imagen, con la nota "VERIFICAR").
1. Cuando la persona elige transferencia, el agente usa `pedir_reserva_transferencia`: le da un importe **con centavos únicos** (por ejemplo $50.000,37), válido 24 horas, y los datos del alias.
2. La persona transfiere ese importe exacto. Mercado Pago avisa a `/api/turnos/mercadopago`.
3. El ERP valida la firma, consulta el pago a Mercado Pago, y si está aprobado, en ARS, no se usó antes y su importe coincide con el pendiente de UNA persona, marca la reserva como pagada en su ficha (`pago_validado_mp`) y le avisa por WhatsApp.
4. Con Mercado Pago activo, ninguna foto ni texto del cliente confirma un pago. Cada pago confirmado sirve para un solo turno (`pago_mp_usado`).
5. Si el turno se agenda con ese pago, queda con la nota "PAGO CONFIRMADO por Mercado Pago (id …)".
Pendiente de comprobar con una transferencia real de prueba: que Mercado Pago registre como pago una transferencia recibida por alias y que dispare el aviso. Si no lo hiciera, queda el link de pago como alternativa.

## Seguridad del agente (resumen)
- Lo que escribe la persona (texto, audio, texto en fotos) se neutraliza: no puede imitar un aviso `[SISTEMA ERP: ...]` ni forzar un pago validado.
- El modelo solo puede guardar en la ficha una lista fija de campos, y solo puede ver y tocar los turnos del teléfono que escribe.
- No se ofrecen horarios ni se agenda hasta que corresponda: consulta sin cargo confirmada por el recibo, comprobante validado por el sistema, o efectivo acordado.
- El comprobante lo lee una IA, no el banco: el turno queda con la nota "VERIFICAR en la cuenta bancaria" y la ficha con `pago_pendiente_verificar`.
- Cancelar un turno NO lo elimina: queda marcado "CANCELACIÓN SOLICITADA" para que el equipo lo confirme.
- Una respuesta con herramientas, avisos del sistema, claves o direcciones de la base se bloquea. Límite de mensajes por persona y de turnos vigentes.

## 2. Identidad de la persona: el teléfono

La persona se identifica **solo por teléfono**. Se toman los **últimos 10 dígitos** (`telefono_clave`), así `+54 9 345 410-0816`, `5493454100816` y `3454100816` son la misma persona.
Las tablas `conversaciones_whatsapp`, `consultas_agendadas` y `leads` tienen la columna calculada `telefono_clave` (la base no deja escribirla a mano).
Si el teléfono tiene menos de 8 dígitos útiles, no se crea ni se busca lead.

## 3. El agente de WhatsApp (`/api/turnos/agente`)

Webhook de la API de WhatsApp Cloud de Meta (`/api/turnos/respaldo` es un alias). Por cada mensaje:

1. Valida la firma de Meta, ignora reintentos y crea el lead con el teléfono.
2. **Entiende el mensaje:** texto tal cual; **audio** → transcripción con Whisper (OpenAI); **foto** → lectura con visión (OpenAI) de recibos de sueldo y comprobantes de transferencia.
3. **La plata la decide el código, no el modelo** (`notaDeImagen`): descuento de Art. 9 / Ganancias mayor a $100.000 → consulta sin cargo con el Dr. Alejandro Reyes; menor → consulta de $100.000 con seña de $50.000; sin descuento → se informa. Una transferencia solo se da por válida si se leyó el importe (≥ $50.000) y, si está cargado `TITULAR_CUENTA`, el destinatario coincide.
4. El modelo (OpenAI, `AGENTE_MODELO`) conversa con el prompt `PROMPT_AGENTE` (se puede reemplazar con `AGENTE_PROMPT`) y usa cuatro herramientas: `consultar_disponibilidad`, `agendar_turno`, `guardar_datos_cliente` y `derivar_a_humano`.
5. `agendar_turno` marca la seña como pagada **solo** si el sistema validó un comprobante en esa conversación, y por el importe leído de la foto (esto dispara el ingreso automático en finanzas).
6. **Parece una persona:** apenas llega el mensaje lo marca como leído y muestra "escribiendo…"; si es una foto, avisa enseguida "Foto recibida, estamos revisando". La respuesta sale a los 4 o 5 segundos (si el trabajo tardó más, sale apenas termina).
7. **Contesta:** por texto, o con **nota de voz** nativa de WhatsApp (ElevenLabs text-to-speech en ogg/opus, con etiquetas de emoción) si el cliente escribió con audio. Si la voz falla, cae a texto. Si el modelo falla, manda un mensaje seguro.
8. Guarda la conversación (`conversaciones_whatsapp`), actualiza el lead (`leads`) y el turno queda en `consultas_agendadas`. `derivar_a_humano` deja el motivo en `leads.datos.derivar_a_humano`.

Está **inactivo** hasta que Meta apunte su webhook a `https://cjnoa-erp.vercel.app/api/turnos/agente` y estén cargadas las variables.

## 4. Rutas en detalle

### `historial` (GET) — memoria del cliente
Lee `consultas_agendadas` (turnos), `conversaciones_whatsapp` (charlas) y `leads` (ficha) por `telefono_clave`. Devuelve texto (no booleanos):

- `tiene_historial`, `es_recurrente`: `"true"` / `"false"`.
- `cliente_nombre`: primero el del último turno, si no el del lead (nombre + apellido), si no el de la conversación.
- `cliente_historial` (máx. 4.000 caracteres): ficha (campaña, rama, trámite, etapa) · hasta 5 últimos turnos (fecha, hora, abogado, tema, si pagó la reserva) · resumen de lo hablado · **últimos 12 mensajes textuales** de la conversación más reciente.

### `registrar` (POST) — cada mensaje, en el momento
Parámetros: `telefono_cliente` (o `telefono`), `conversation_id`, `mensaje` (lo que dijo el cliente), `respuesta_agente`, y opcionales de ficha (ver sección 5).
- **Una persona = una conversación:** se reutiliza la fila más reciente de ese teléfono. Si no hay teléfono, se usa el `conversation_id`.
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

## 5. El lead (`leads`) — una fila por persona

Se crea al primer mensaje y se completa con lo que llegue por `registrar` o `agendar`.

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

Base: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNOS_AGENTE_SECRET`.

Agente de WhatsApp (obligatorias): `WHATSAPP_VERIFY_TOKEN` (texto inventado, el mismo que se pone en Meta), `META_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `api_openai` (u `OPENAI_API_KEY`).

Opcionales: `AGENTE_PROMPT`, `AGENTE_DATOS_PAGO` (CBU/alias para pasar al cliente), `TITULAR_CUENTA` (nombre que debe figurar en las transferencias), `AGENTE_MODELO` (por defecto `gpt-4o-mini`), `AGENTE_MODELO_VISION` (`gpt-4o`), `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (+ `ELEVENLABS_MODEL`, por defecto `eleven_v3`) para las notas de voz.

## Agentes maestros (Agentes IA)

Pantallas (solo admin y socio): **Agentes IA** (`/agentes`: en vivo, análisis, prompt) y **Registro** (`/agentes/registro`).
- Tablas (migración `supabase/migration_agentes_maestros.sql`, solo crea tablas nuevas): `agentes_estado`, `agentes_registro` (inmutable), `agentes_ejecuciones`, `agentes_analisis`, `agentes_config`, `agente_prompt_versiones`.
- **Analista (activo):** cada 10 conversaciones nuevas (o con el botón) lee las conversaciones, cruza fichas y turnos, mide el embudo hasta la cita agendada, detecta errores (tuteo, reproches, preguntas repetidas, consulta sin valor, mensajes sin respuesta) y revisa una muestra con IA, siempre sin teléfonos ni mails. Guarda un informe y deja todo en el registro. Tope diario de corridas; pausa general.
- **Redactor, Tester y Auditor:** previstos para las próximas etapas. Ningún cambio llega al agente de WhatsApp sin aprobación.
- **Prompt en la base:** el agente usa la versión activa de `agente_prompt_versiones` (solo administradores pueden leerla). Aplicar una versión archiva la anterior (backup); se puede volver atrás con un botón y nada se borra. Si la base no responde o no hay versión activa, usa el prompt de respaldo del código.
- Las llamadas de la pantalla van a `/api/turnos/agentes` (misma función de Vercel: el plan gratuito tiene tope de funciones).
