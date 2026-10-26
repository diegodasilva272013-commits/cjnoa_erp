// Datos de las ofertas del cliente (CJ NOA): filtros, casilleros mínimos, condición, activo de valor y cierre.
// Es un archivo de DATOS, sin lógica: otro cliente = otro archivo. Es .ts (y no .json) porque el cargador ESM de Node que usa Vercel
// exige un atributo de importación para los .json y rompía toda la función.
export const CONFIG_CJNOA = {
  "cliente": "Centro Jurídico NOA",
  "agente": {
    "nombre": "Karina",
    "estudio": "Centro Jurídico NOA",
    "direccion": "Hipólito Yrigoyen 680, San Salvador de Jujuy"
  },
  "casilleros": {
    "situacion": "qué le pasa hoy, en concreto",
    "objetivo": "qué quiere lograr",
    "brecha": "qué la frenó hasta ahora o por qué todavía no lo resolvió",
    "historial": "qué intentó antes (otro abogado, un reclamo, un trámite, nada)",
    "compromiso": "qué tan importante y urgente es para ella resolverlo ahora"
  },
  "ofertas": {
    "art9_ganancias": {
      "etiqueta": "Artículo 9 e Impuesto a las Ganancias",
      "descripcion": "Docentes jubilados por ANSES a quienes les descuentan Artículo 9 y/o Impuesto a las Ganancias del haber.",
      "campana": "art9_ganancias",
      "profesional": "alejandro",
      "tipo_consulta": "articulo9_ganancias",
      "filtros": [
        {
          "campo": "es_docente",
          "tipo": "si_no",
          "descripcion": "si es docente jubilado/a",
          "ayuda": "Docente incluye maestra/o, profesora/o y personal de escuela o de colegio. \"Soy maestra\", \"fui maestra 30 años\", \"me jubilé como docente\" => si. Solo es no si lo niega o dice otra ocupación (administrativa, empleada, etc.).",
          "pregunta": "¿Usted es docente?"
        },
        {
          "campo": "jubilado_anses",
          "tipo": "si_no",
          "descripcion": "si se jubiló por ANSES",
          "ayuda": "\"Me jubilé por ANSES\", \"jubilada de ANSES\", \"cobro de ANSES\" => si. \"Caja provincial\" u otra caja => no.",
          "pregunta": "¿Se jubiló por ANSES?"
        },
        {
          "campo": "descuento_art9_ganancias",
          "tipo": "si_no",
          "descripcion": "si le descuentan Artículo 9 y/o Ganancias",
          "ayuda": "Cualquier descuento, retención o 'me sacan plata' del haber cuenta como SI. La persona no tiene por qué saber el nombre del descuento; lo revisa el abogado.",
          "pregunta": "¿Le están descontando ganancias en el recibo de su haber?"
        }
      ],
      "filtros_de_cierre": [],
      "casilleros_minimos": {
        "obligatorios": [
          "objetivo"
        ],
        "al_menos_uno_de": [
          "brecha",
          "historial",
          "compromiso"
        ]
      },
      "condicion": "La consulta con el Dr. Alejandro Reyes es SIN CARGO y sin compromiso, y puede ser presencial en San Salvador de Jujuy o virtual. En la consulta el Dr. Alejandro Reyes analiza su caso y le explica qué se puede hacer y cuáles son los pasos a seguir.",
      "urgencia": "La ley permite reclamar lo descontado hasta 2 años hacia atrás en Artículo 9 y hasta 5 años en Ganancias, contados desde la presentación de la demanda; por eso cada mes que se demora, los descuentos más antiguos pueden quedar fuera del reclamo. Es todo lo que podés decir sobre plazos y nunca prometés un resultado.",
      "activo_de_valor": null,
      "cierre": "turno_directo",
      "datos_antes_de_horarios": [
        {
          "campo": "modalidad_consulta",
          "tipo": "opcion",
          "valores": [
            "presencial",
            "virtual"
          ],
          "descripcion": "si prefiere la consulta presencial (en San Salvador de Jujuy) o virtual",
          "ayuda": "\"Virtual\", \"por videollamada\", \"por Meet o Zoom\", \"desde casa\" => virtual; \"presencial\", \"en persona\", \"voy al estudio\" => presencial.",
          "pregunta": "¿Prefiere que la consulta sea presencial o virtual?"
        }
      ],
      "ideas_de_valor": [
        {
          "texto": "Muchas veces ese descuento aparece en el recibo y nadie explica de dónde sale.",
          "estado": "pendiente de aprobación del estudio"
        },
        {
          "texto": "Cada caso es distinto, porque depende del haber y de cómo se calculó el descuento. Por eso lo mira un abogado.",
          "estado": "pendiente de aprobación del estudio"
        },
        {
          "texto": "Revisar el recibo con alguien que conoce el tema suele aclarar mucho.",
          "estado": "pendiente de aprobación del estudio"
        }
      ]
    },
    "jubilacion": {
      "etiqueta": "Jubilación docente",
      "descripcion": "Personas que quieren jubilarse o consultan por el trámite jubilatorio docente.",
      "campana": "jubilacion_docente",
      "profesional": "fabricio",
      "tipo_consulta": "jubilacion_docente",
      "filtros": [
        {
          "campo": "nombre",
          "tipo": "texto",
          "descripcion": "su nombre",
          "ayuda": "Solo si la persona dice su nombre (\"me llamo…\", \"soy Ana López\") o contesta a una pregunta por su nombre. Una palabra suelta que contesta OTRA pregunta (virtual, presencial, sí, no) NO es un nombre.",
          "pregunta": "¿Me indica su nombre y apellido?"
        },
        {
          "campo": "edad",
          "tipo": "numero",
          "descripcion": "su edad",
          "ayuda": "Solo el número que dice como su edad.",
          "pregunta": "¿Qué edad tiene?"
        },
        {
          "campo": "trabaja_docente",
          "tipo": "si_no",
          "descripcion": "si actualmente trabaja como docente",
          "ayuda": "\"Sigo trabajando como docente\", \"todavía doy clases\" => si.",
          "pregunta": "¿Sigue trabajando como docente?"
        }
      ],
      "filtros_de_cierre": [
        {
          "campo": "forma_reserva",
          "tipo": "opcion",
          "valores": [
            "efectivo",
            "transferencia"
          ],
          "descripcion": "cómo prefiere abonar la reserva (transferencia o efectivo)",
          "ayuda": "\"Transferencia\", \"por banco\", \"por Mercado Pago\" => transferencia; \"efectivo\", \"en las oficinas\" => efectivo.",
          "pregunta": "¿Prefiere abonar la reserva por transferencia o en efectivo?"
        }
      ],
      "casilleros_minimos": {
        "obligatorios": [
          "objetivo"
        ],
        "al_menos_uno_de": [
          "brecha",
          "historial",
          "compromiso"
        ]
      },
      "condicion": "La consulta es con el Dr. Fabricio Reyes. El valor y la reserva (la mitad; el resto se abona el día de la consulta) los informa el sistema: nunca los inventes. En la consulta el Dr. Fabricio Reyes analiza su caso y le explica qué se puede hacer y cuáles son los pasos a seguir.",
      "urgencia": null,
      "activo_de_valor": {
        "tipo": "video",
        "herramienta": "enviar_video_jubilacion",
        "descripcion": "video grabado por el Dr. Fabricio Reyes"
      },
      "cierre": "reserva_y_turno",
      "datos_antes_de_horarios": [],
      "ideas_de_valor": [
        {
          "texto": "La edad y los años de servicio abren opciones distintas, por eso conviene revisarlo antes de iniciar el trámite.",
          "estado": "pendiente de aprobación del estudio"
        },
        {
          "texto": "Muchas personas llegan al trámite sin saber qué les conviene, y ahí se pierden opciones.",
          "estado": "pendiente de aprobación del estudio"
        }
      ]
    }
  },
  "datos_agenda": [
    {
      "campo": "nombre",
      "tipo": "texto",
      "descripcion": "su nombre y apellido",
      "ayuda": "Solo si la persona dice su nombre (\"me llamo…\", \"soy Ana López\") o contesta a una pregunta por su nombre. Una palabra suelta que contesta OTRA pregunta (virtual, presencial, sí, no) NO es un nombre.",
      "pregunta": "¿Me indica su nombre y apellido?"
    }
  ],
  "ejemplos_pregunta": {
    "objetivo": [
      "¿Qué le gustaría lograr con esto?",
      "¿Qué es lo que más le importa resolver?",
      "¿Qué le gustaría que cambiara?"
    ],
    "brecha": [
      "¿Qué fue lo que hasta ahora le impidió resolverlo?",
      "¿Por qué cree que todavía no pudo resolverlo?"
    ],
    "historial": [
      "¿Probó algo antes para resolverlo?",
      "¿Llegó a consultar o reclamar en algún lado?"
    ],
    "compromiso": [
      "¿Qué tan importante es para usted resolverlo ahora?",
      "¿Hay algo que haga urgente resolverlo?"
    ],
    "situacion": [
      "¿Qué le está pasando hoy, en concreto?",
      "¿Me cuenta cómo está hoy esa situación?"
    ]
  }
};
