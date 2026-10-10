# Plan de contingencia — Agente CJ NOA (ElevenLabs)

Objetivo: que ningún consultante quede sin respuesta ni se pierda un lead si ElevenLabs
se queda sin saldo, falla, o si una herramienta del ERP no responde.

## 1. Qué puede fallar y cómo nos enteramos

| # | Falla | Síntoma | Cómo se detecta |
|---|---|---|---|
| R1 | ElevenLabs sin saldo/créditos | El agente deja de contestar en silencio | Alerta de consumo de ElevenLabs (email); control diario (sección 5) |
| R2 | Caída o lentitud de ElevenLabs / del modelo | Respuestas lentas o ausentes | Control diario; reclamos de clientes |
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

## 6. Capa 4 — Agente de respaldo independiente (no construido, requiere decisión)

Para que el número siga atendiendo aunque ElevenLabs esté caído hace falta un segundo agente que no dependa de ElevenLabs:
recibir los mensajes de WhatsApp por la API de Meta en el ERP, responder con otro proveedor de modelo de lenguaje y usar los mismos endpoints
(`/api/turnos/...`). Requiere credenciales de la API de WhatsApp de Meta y cambiar el destino del webhook del número,
por lo que **no se hace sin autorización expresa**. Se activaría de forma manual (un cambio de webhook) en caso de caída prolongada.

## 7. Pendientes de configuración detectados en la bitácora de ElevenLabs

1. `registrar_consulta` apunta a `aretesoluciones.space` (otra plataforma, otra base). **Quitarla**: el ERP ya recibe la conversación completa por el webhook post-llamada; mantenerla es un punto de falla más.
2. `consultar_historial` envía el mismo token que usa la herramienta de Areté. El ERP exige `TURNOS_AGENTE_SECRET`; verificar que el header de esa herramienta lleve ese valor.
3. `agendar_turno`: si el agente manda `pago: true` junto con `monto_reserva`, el ERP **crea automáticamente un ingreso** en finanzas. El agente no puede confirmar una transferencia: indicarle que mande `pago: true` solo cuando el cliente muestre el comprobante, y de lo contrario `pago: false`.
