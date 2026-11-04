// Datos de las ofertas del cliente (CJ NOA): filtros, casilleros mínimos, condición, activo de valor y cierre.
// Es un archivo de DATOS, sin lógica: otro cliente = otro archivo. Es .ts (y no .json) porque el cargador ESM de Node que usa Vercel
// exige un atributo de importación para los .json y rompía toda la función.
export const CONFIG_CJNOA = {
  "cliente": "Centro Jurídico NOA",
  "agente": {
    "nombre": "Karina",
    "estudio": "Centro Jurídico NOA",
    "direccion": "Hipólito Yrigoyen 680, San Salvador de Jujuy",
    "alcance": "derecho previsional: jubilaciones y el reclamo por descuentos de Impuesto a las Ganancias (Artículo 9) para docentes jubilados de ANSES"
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
      "descripcion": "Docentes jubilados por ANSES a quienes les descuentan Artículo 9 y/o Impuesto a las Ganancias del haber. La persona habla de descuentos o retenciones en su jubilación, de Ganancias, del Artículo 9, de reclamar lo descontado o de si le descuentan bien.",
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
          "ayuda": "\"Me jubilé por ANSES\", \"jubilada de ANSES\", \"cobro de ANSES\" => si. \"Caja provincial\" u otra caja => no. Decir solo \"jubilada\" o \"jubilado\", sin nombrar la entidad, NO alcanza: no incluyas este campo (la persona todavía no lo dijo).",
          "pregunta": "¿Se jubiló por ANSES?",
          "ayuda_al_dudar": "Preguntale con qué entidad cobra su jubilación (ANSES o una caja provincial) o si en el recibo de haberes figura ANSES."
        },
        {
          "campo": "descuento_art9_ganancias",
          "tipo": "si_no",
          "descripcion": "si le descuentan Artículo 9 y/o Ganancias",
          "ayuda": "Cualquier descuento, retención o 'me sacan plata' del haber cuenta como SI. La persona no tiene por qué saber el nombre del descuento; lo revisa el abogado.",
          "pregunta": "¿Le están descontando ganancias en el recibo de su haber?"
        },
        {
          "campo": "monto_descuento",
          "tipo": "texto",
          "opcional": true,
          "descripcion": "el monto aproximado que le descuentan por mes",
          "ayuda": "Solo si la persona dice cuánto le descuentan (por ejemplo \"350 mil\", \"unos 200.000\", \"527000\"). Si no lo sabe o no lo dice, no lo inventes.",
          "pregunta": "¿Más o menos qué monto le descuentan por mes?"
        }
      ],
      "filtros_de_cierre": [],
      "casilleros_minimos": {
        "obligatorios": [],
        "al_menos_uno_de": []
      },
      "condicion": "La consulta con el Dr. Alejandro Reyes es SIN CARGO y sin compromiso, y puede ser presencial en San Salvador de Jujuy o virtual. En la consulta el Dr. Alejandro Reyes analiza su caso y le explica qué se puede hacer y cuáles son los pasos a seguir.",
      "urgencia": "La ley permite reclamar lo descontado hasta 2 años hacia atrás en Artículo 9 y hasta 5 años en Ganancias, contados desde la presentación de la demanda; por eso cada mes que se demora, los descuentos más antiguos pueden quedar fuera del reclamo. Es todo lo que podés decir sobre plazos y nunca prometés un resultado.",
      "activo_de_valor": null,
      "cierre": "turno_directo",
      "encuadre_del_caso": {
        "texto": "Su situación es de las que el estudio atiende, y esos descuentos son justamente lo que el Dr. Alejandro Reyes revisa en la consulta.",
        "estado": "pendiente de aprobación del estudio"
      },
      "vigencia_sin_cargo": "[PENDIENTE: hasta cuándo rige que la consulta es sin cargo; lo completa el estudio]",
      "escasez_umbral": 6,
      "llamada_con_el_dr": {
        "texto": "Si necesita saber cuánto cuesta el trámite completo antes de decidir, el Dr. Alejandro Reyes puede explicárselo por una llamada telefónica, sin compromiso: usted escucha, aclara sus dudas y después decide con tranquilidad.",
        "estado": "pendiente de aprobación del estudio"
      },
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
          "pregunta": "¿Prefiere que la consulta sea presencial o virtual?",
          "sinonimos": {
            "virtual": [
              "virtual",
              "videollamada",
              "video llamada",
              "meet",
              "zoom",
              "online",
              "a distancia",
              "desde casa",
              "por video",
              "remota",
              "no puedo viajar",
              "no puedo ir",
              "me queda lejos"
            ],
            "presencial": [
              "presencial",
              "en persona",
              "personalmente",
              "en el estudio",
              "en la oficina",
              "en las oficinas",
              "voy al estudio",
              "ir al estudio"
            ]
          }
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
      ],
      "como_se_conecta_virtual": "[PENDIENTE: lo completa el estudio]"
    },
    "jubilacion_aportes": {
      "etiqueta": "Jubilación y compra de aportes",
      "descripcion": "Cualquier persona (no solo docentes) que consulta por su jubilación: que le faltan años de aportes, que quiere comprar o pagar aportes, por la moratoria o el plan de la Ley 27.705, cuándo o cómo se va a poder jubilar, o que ya está jubilada y quiere revisar o mejorar su jubilación. Si habla de descuentos, retenciones o Ganancias en su haber, NO es esta oferta: es art9_ganancias.",
      "campana": "jubilacion_docente",
      "profesional": "fabricio",
      "tipo_consulta": "jubilacion_aportes",
      "filtros": [
        {
          "campo": "edad",
          "tipo": "numero",
          "descripcion": "su edad",
          "ayuda": "Solo el número que dice como su edad.",
          "pregunta": "¿Qué edad tiene?"
        },
        {
          "campo": "aportes_faltantes",
          "tipo": "texto",
          "opcional": true,
          "descripcion": "cuántos años de aportes le faltan, si lo sabe",
          "ayuda": "Solo si la persona dice cuántos años o meses de aportes le faltan (\"me faltan 8 años\", \"tengo 20 años aportados\") o que no le faltan. Si no lo sabe, no lo inventes.",
          "pregunta": "¿Sabe más o menos cuántos años de aportes le faltan?"
        }
      ],
      "filtros_de_cierre": [],
      "casilleros_minimos": {
        "obligatorios": [],
        "al_menos_uno_de": []
      },
      "condicion": "La consulta es con el Dr. Fabricio Reyes, en el estudio (Hipólito Yrigoyen 680, San Salvador de Jujuy). Reservar el turno por este chat no tiene costo; la consulta SÍ se paga: $50.000, que se abonan en el estudio el día de la consulta. Nunca digas que la consulta es sin costo o sin cargo. No hay reserva, ni transferencia, ni comprobante. En la consulta el Dr. Fabricio Reyes analiza su caso y le explica qué se puede hacer y cuáles son los pasos a seguir.",
      "urgencia": "El plan de pago de aportes de la Ley 27.705 es para quienes les faltan hasta 10 años para la edad jubilatoria (mujeres de 50 a 59 años, varones de 55 a 64) y permite ir pagando los aportes que faltan eligiendo qué períodos cancelar. Hay que terminar de pagarlo antes de cumplir la edad jubilatoria (60 las mujeres, 65 los varones): si se llega a esa edad sin cancelarlo, el plan se da de baja. La cuota se actualiza todos los meses: nunca digas un monto de cuota, y nunca prometas que se va a poder jubilar. Si la persona está fuera de esas edades o consulta por otra situación de su jubilación, igual se le ofrece la consulta: el Dr. Fabricio Reyes lo analiza en detalle.",
      "activo_de_valor": null,
      "cierre": "turno_directo",
      "datos_antes_de_horarios": [],
      "ideas_de_valor": [
        {
          "texto": "Si sabe que al llegar a la edad le van a faltar años de aportes, puede empezar a regularizarlos desde ahora, de a poco.",
          "estado": "texto de Rodrigo Reyes (3/11/2026)"
        },
        {
          "texto": "Es mejor revisarlo antes que llegar a la edad y encontrarse con que no se puede jubilar por falta de aportes.",
          "estado": "texto de Rodrigo Reyes (3/11/2026)"
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
