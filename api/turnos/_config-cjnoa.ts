// Datos de las ofertas del cliente (CJ NOA): filtros, casilleros mínimos, condición, activo de valor y cierre.
// Es un archivo de DATOS, sin lógica: otro cliente = otro archivo. Es .ts (y no .json) porque el cargador ESM de Node que usa Vercel
// exige un atributo de importación para los .json y rompía toda la función.
export const CONFIG_CJNOA = {
  "cliente": "Centro Jurídico NOA",
  "agente": {
    "nombre": "Karina",
    "estudio": "Centro Jurídico NOA",
    "direccion": "Hipólito Yrigoyen 680, San Salvador de Jujuy",
    "alcance": "derecho previsional: jubilaciones y el reclamo por descuentos de Impuesto a las Ganancias (Artículo 9) para docentes jubilados de ANSES",
    "ciudad": "San Salvador de Jujuy",
    "tipo_de_organizacion": "estudio jurídico",
    "especialidad": "derecho previsional",
    "publico": "Muchas de las personas que escriben son adultos mayores: usá un lenguaje simple y claro, con paciencia y respeto."
  },
  "oferta_por_defecto": null,
  "modelo_del_agente": "gpt-4.1-mini",
  "modelo_del_extractor": "gpt-4.1",
  "saludo_explica_el_servicio": false,
  "saludo_inicial": "Hola, mucho gusto. Lo saluda Karina, del Centro Jurídico NOA.",
  "ideas_de_valor_en": [
    "ofrecer_consulta"
  ],
  "max_ideas_por_conversacion": 1,
  "umbrales": {
    "horarios_a_ofrecer": 2,
    "mensajes_recientes_para_el_extractor": 8,
    "mensajes_anteriores_del_agente": 4,
    "max_intentos_del_redactor": 8,
    "max_correcciones_de_estilo": 3,
    "max_rechazos_del_verificador": 2,
    "reintentos_del_extractor": 2,
    "bloqueo_respuestas_sin_el_dato": 2,
    "bloqueo_turnos_pidiendo_lo_mismo": 4,
    "hora_de_corte_manana_tarde": "13:00",
    "aclaraciones_por_dato": 1,
    "largo_maximo_de_frase_guardada": 300,
    "largo_maximo_de_dato_de_texto": 120,
    "largo_minimo_de_cita": 4,
    "largo_maximo_del_motivo_de_cancelacion": 300,
    "largo_minimo_de_dato_de_pago": 4,
    "digitos_maximos_de_numero": 3,
    "casilleros_en_el_reflejo": 2,
    "palabras_de_apertura": 3,
    "palabras_minimas_de_apertura": 2,
    "palabras_minimas_de_frase_repetida": 4,
    "digitos_minimos_de_cifra": 3,
    "largo_maximo_del_motivo": 500,
    "mensajes_para_el_redactor": 10
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
      "grupos_de_filtros": [
        [
          "es_docente",
          "jubilado_anses",
          "descuento_art9_ganancias"
        ]
      ],
      "max_preguntas_por_mensaje": 2,
      "estilos": {
        "breve": "La persona escribe corto: mensaje corto y directo, sin reflejar lo que contó y agrupando en una sola pregunta los datos que faltan del grupo.",
        "expresivo": "La persona se explaya: respondé con una frase propia y humana (sin repetir lo que dijo ni anunciar que lo viste); después preguntá lo que falte."
      },
      "filtros": [
        {
          "campo": "es_docente",
          "tipo": "si_no",
          "descripcion": "si es docente jubilado/a",
          "ayuda": "Docente incluye maestra/o, profesora/o y personal de escuela o de colegio. \"Soy maestra\", \"fui maestra 30 años\", \"me jubilé como docente\" => si. Solo es no si lo niega o dice otra ocupación (administrativa, empleada, etc.)."
        },
        {
          "campo": "jubilado_anses",
          "tipo": "si_no",
          "descripcion": "si se jubiló por ANSES",
          "ayuda": "\"Me jubilé por ANSES\", \"jubilada de ANSES\", \"cobro de ANSES\" => si. \"Caja provincial\" u otra caja => no. Decir solo \"jubilada\" o \"jubilado\", sin nombrar la entidad, NO alcanza: no incluyas este campo (la persona todavía no lo dijo).",
          "ayuda_al_dudar": "Preguntale con qué entidad cobra su jubilación (ANSES o una caja provincial) o si en el recibo de haberes figura ANSES."
        },
        {
          "campo": "descuento_art9_ganancias",
          "tipo": "si_no",
          "subtipo": {
            "campo": "tipo_de_descuento",
            "opciones": [
              "ganancias",
              "art9",
              "ambos"
            ],
            "descripcion": "cuál es el descuento: Ganancias, Artículo 9 o ambos"
          },
          "descripcion": "si le descuentan Artículo 9 y/o Ganancias",
          "ayuda": "Cualquier descuento, retención o 'me sacan plata' del haber cuenta como SI. La persona no tiene por qué saber el nombre del descuento; lo revisa el abogado. Si dice que consulta por el impuesto a las ganancias, por el Artículo 9 o por los descuentos del haber, ya está diciendo que los tiene: es SI, con el subtipo que nombre. 'No sé' o 'no me acuerdo' NO es NO: es una duda."
        },
        {
          "campo": "monto_descuento",
          "tipo": "texto",
          "opcional": true,
          "descripcion": "el monto aproximado que le descuentan por mes",
          "ayuda": "Solo si la persona dice cuánto le descuentan (por ejemplo \"350 mil\", \"unos 200.000\", \"527000\"). Si no lo sabe o no lo dice, no lo inventes."
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
        "texto": "Es un tipo de caso que el estudio atiende: el Dr. Alejandro Reyes revisa este tipo de descuentos en la consulta.",
        "estado": "pendiente de aprobación del estudio"
      },
      "vigencia_sin_cargo": {
        "texto": "hasta cuándo rige que la consulta es sin cargo (lo completa el estudio)",
        "aprobado": false
      },
      "escasez_umbral": 6,
      "llamada_con_el_dr": {
        "texto": "El Dr. Alejandro Reyes puede explicar por una llamada telefónica, sin compromiso, cuánto cuesta el trámite completo; la persona escucha, aclara dudas y después decide.",
        "estado": "pendiente de aprobación del estudio",
        "aprobado": false
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
          "texto": "El descuento suele aparecer en el recibo sin que nadie explique de dónde sale.",
          "estado": "pendiente de aprobación del estudio"
        },
        {
          "texto": "Cada caso depende del haber y de cómo se calculó el descuento; por eso lo analiza un abogado.",
          "estado": "pendiente de aprobación del estudio"
        },
        {
          "texto": "Revisar el recibo con alguien que conoce el tema suele aclarar mucho.",
          "estado": "pendiente de aprobación del estudio"
        }
      ],
      "como_se_conecta_virtual": {
        "texto": "cómo se conecta la persona a la consulta virtual (lo completa el estudio)",
        "aprobado": false
      }
    },
    "jubilacion_aportes": {
      "etiqueta": "Jubilación y compra de aportes",
      "descripcion": "Cualquier persona (no solo docentes) que consulta por su jubilación: que le faltan años de aportes, que quiere comprar o pagar aportes, por la moratoria o el plan de la Ley 27.705, cuándo o cómo se va a poder jubilar, o que ya está jubilada y quiere revisar o mejorar su jubilación. Si dice que quiere jubilarse o que todavía no se jubiló, es esta oferta aunque no nombre la compra de aportes. Si habla de descuentos, retenciones o Ganancias en su haber, NO es esta oferta: es art9_ganancias.",
      "campana": "jubilacion_docente",
      "profesional": "fabricio",
      "tipo_consulta": "jubilacion_aportes",
      "grupos_de_filtros": [
        [
          "edad"
        ],
        [
          "aportes_faltantes"
        ]
      ],
      "max_preguntas_por_mensaje": 1,
      "estilos": {
        "breve": "La persona escribe corto: mensaje corto y directo, sin reflejar lo que contó.",
        "expresivo": "La persona se explaya: respondé con una frase propia y humana (sin repetir lo que dijo ni anunciar que lo viste); después preguntá lo que falte."
      },
      "filtros": [
        {
          "campo": "edad",
          "tipo": "numero",
          "descripcion": "su edad",
          "ayuda": "Solo el número que dice como su edad."
        },
        {
          "campo": "aportes_faltantes",
          "tipo": "texto",
          "opcional": true,
          "descripcion": "cuántos años de aportes le faltan, si lo sabe",
          "ayuda": "Solo si la persona dice cuántos años o meses de aportes le faltan (\"me faltan 8 años\", \"tengo 20 años aportados\") o que no le faltan. Si no lo sabe, no lo inventes."
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
          "texto": "Quien sabe que al llegar a la edad de jubilarse le van a faltar años de aportes puede empezar a regularizarlos desde ahora, de a poco.",
          "estado": "texto de Rodrigo Reyes (3/11/2026)"
        },
        {
          "texto": "Conviene revisar los aportes antes de llegar a la edad de jubilarse, para no descubrir tarde que faltan.",
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
      "ayuda": "Solo si la persona dice su nombre (\"me llamo…\", \"soy Ana López\") o contesta a una pregunta por su nombre. Una palabra suelta que contesta OTRA pregunta (virtual, presencial, sí, no) NO es un nombre."
    }
  ]
};
