import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Loader2, X, Check, Volume2, Ear, EarOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Wake-word: el usuario dice "CJ" (CE JOTA) y el agente arranca a escuchar el comando
const WAKE_PATTERNS = [
  /\bc\s*j\b/i,
  /\bce\s*jota\b/i,
  /\bcejota\b/i,
  /\bceyota\b/i,
  /\bsejota\b/i,
  /\bse\s*jota\b/i,
  /\bsi\s*jota\b/i,
];
function contieneWakeWord(texto: string): boolean {
  const t = texto.toLowerCase().trim();
  return WAKE_PATTERNS.some(rx => rx.test(t));
}
const WAKE_PREF_KEY = 'noa_wake_word_enabled';

// ============================================================
// Agente de voz NOA — botón flotante global
// Flujo:
//   1) Usuario aprieta el mic → se graba audio.
//   2) Usuario suelta → se manda a /api/voz-agente con contexto.
//   3) Backend transcribe + arma plan con tool calls.
//   4) Front muestra confirmación y, al aceptar, ejecuta usando
//      la sesión de Supabase del propio usuario (RLS aplica).
//   5) Lee la respuesta con SpeechSynthesis del navegador.
// ============================================================

interface Plan {
  tool: string;
  args: Record<string, unknown>;
  explicacion_humana: string;
  respuesta_voz: string;
  destructiva: boolean;
}

type Estado = 'idle' | 'grabando' | 'procesando' | 'esperando_confirmacion' | 'ejecutando';

export default function AgenteVoz() {
  const { user, perfil } = useAuth();
  const { showToast } = useToast();
  const [estado, setEstado] = useState<Estado>('idle');
  const [open, setOpen] = useState(false);
  const [transcripcion, setTranscripcion] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Wake-word
  const [wakeOn, setWakeOn] = useState<boolean>(() => {
    try { return localStorage.getItem(WAKE_PREF_KEY) !== '0'; } catch { return true; }
  });
  const [wakeActivo, setWakeActivo] = useState(false);
  const wakeRecRef = useRef<any>(null);
  const wakeReiniciarRef = useRef(true);
  const estadoRef = useRef<Estado>('idle');
  useEffect(() => { estadoRef.current = estado; }, [estado]);

  function hablar(texto: string) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-AR';
      u.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* noop */ }
  }

  const reset = useCallback(() => {
    setEstado('idle');
    setTranscripcion('');
    setPlan(null);
    setError('');
    setResultado('');
    chunksRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  async function iniciarGrabacion() {
    setError(''); setResultado(''); setPlan(null); setTranscripcion('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no soporta grabación de audio.');
      setOpen(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = procesarAudio;
      rec.start();
      setEstado('grabando');
      setOpen(true);
    } catch (e: any) {
      setError('No se pudo acceder al micrófono: ' + (e?.message || ''));
      setOpen(true);
    }
  }

  function detenerGrabacion() {
    try { recorderRef.current?.stop(); } catch { /* noop */ }
  }

  async function procesarAudio() {
    setEstado('procesando');
    try {
      const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' });
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      // Convertir a base64
      const arr = await blob.arrayBuffer();
      const b64 = arrayBufferToBase64(arr);

      // Armar contexto
      const contexto = await armarContexto(user?.id, perfil?.nombre || 'Usuario', perfil?.rol || 'usuario');

      const res = await fetch('/api/voz-agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_base64: b64,
          audio_mime: blob.type,
          contexto,
        }),
      });
      const j = await res.json();
      if (j.error && !j.plan) {
        setError(j.error);
        setTranscripcion(j.transcripcion || '');
        setEstado('idle');
        return;
      }
      setTranscripcion(j.transcripcion || '');
      const p: Plan = j.plan;
      setPlan(p);

      if (!p.destructiva) {
        // consultar: ejecutar / responder directo
        setResultado(p.respuesta_voz || p.args?.respuesta as string || '');
        hablar(p.respuesta_voz || (p.args?.respuesta as string) || 'Listo.');
        setEstado('idle');
      } else {
        setEstado('esperando_confirmacion');
        hablar(p.explicacion_humana + '. ¿Confirmás?');
      }
    } catch (e: any) {
      setError('Error: ' + (e?.message || ''));
      setEstado('idle');
    }
  }

  async function ejecutarPlan() {
    if (!plan) return;
    setEstado('ejecutando');
    try {
      const r = await ejecutarTool(plan, user?.id || '');
      if (r.ok) {
        setResultado(r.mensaje);
        hablar(plan.respuesta_voz || r.mensaje);
        showToast(r.mensaje, 'success');
      } else {
        setError(r.mensaje);
        showToast(r.mensaje, 'error');
      }
    } catch (e: any) {
      setError('Error al ejecutar: ' + (e?.message || ''));
    }
    setEstado('idle');
  }

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { reset(); setOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reset]);

  // ── Wake-word: escucha continua en background con Web Speech API ──
  const onWakeDetectado = useCallback(() => {
    if (estadoRef.current !== 'idle') return;
    const nombre = (perfil?.nombre || 'Usuario').split(' ')[0];
    hablar(`Acá estoy ${nombre}, ¿en qué puedo ayudarte?`);
    // pequeño delay para que termine de hablar antes de empezar a grabar
    setTimeout(() => { iniciarGrabacion(); }, 1400);
  }, [perfil?.nombre]);

  useEffect(() => {
    if (!user || !wakeOn) {
      // apagar si estaba prendido
      wakeReiniciarRef.current = false;
      try { wakeRecRef.current?.stop?.(); } catch { /* noop */ }
      wakeRecRef.current = null;
      setWakeActivo(false);
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      // Navegador sin Web Speech API (Firefox, algunos iOS) — silencioso
      setWakeActivo(false);
      return;
    }
    wakeReiniciarRef.current = true;
    const rec = new SR();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onresult = (ev: any) => {
      // Sólo nos interesa detectar si en algún resultado (incluso interim) aparece la wake word
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        for (let j = 0; j < r.length; j++) {
          const txt = r[j].transcript || '';
          if (contieneWakeWord(txt)) {
            // Detener y disparar; onend reinicia
            try { rec.stop(); } catch { /* noop */ }
            onWakeDetectado();
            return;
          }
        }
      }
    };
    rec.onerror = (_ev: any) => {
      // 'not-allowed' / 'service-not-allowed' / 'no-speech' — dejar que onend re-arranque
    };
    rec.onend = () => {
      // Auto-reinicio mientras esté habilitado y el agente no esté grabando/procesando
      if (!wakeReiniciarRef.current) { setWakeActivo(false); return; }
      if (estadoRef.current !== 'idle') {
        // se reanudará cuando vuelva a idle (efecto se vuelve a montar via wakeOn toggling no aplica;
        // usamos un pequeño timer que reintenta)
        setTimeout(() => {
          if (wakeReiniciarRef.current && estadoRef.current === 'idle') {
            try { rec.start(); setWakeActivo(true); } catch { /* noop */ }
          }
        }, 1200);
        return;
      }
      try { rec.start(); setWakeActivo(true); } catch { /* noop */ }
    };

    wakeRecRef.current = rec;
    try { rec.start(); setWakeActivo(true); } catch { /* noop */ }

    return () => {
      wakeReiniciarRef.current = false;
      try { rec.stop(); } catch { /* noop */ }
      wakeRecRef.current = null;
      setWakeActivo(false);
    };
  }, [user, wakeOn, onWakeDetectado]);

  // Cuando el agente termina (vuelve a idle), reanudar wake-word si quedó frenado
  useEffect(() => {
    if (estado !== 'idle') return;
    if (!wakeOn || !wakeReiniciarRef.current) return;
    if (wakeRecRef.current && !wakeActivo) {
      try { wakeRecRef.current.start(); setWakeActivo(true); } catch { /* noop */ }
    }
  }, [estado, wakeOn, wakeActivo]);

  function toggleWake() {
    setWakeOn(prev => {
      const next = !prev;
      try { localStorage.setItem(WAKE_PREF_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }

  if (!user) return null;

  return (
    <>
      {/* Botón flotante CJ */}
      <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-2">
        {/* Toggle wake-word */}
        <button
          onClick={toggleWake}
          title={wakeOn ? (wakeActivo ? 'Escuchando "CJ" — click para apagar' : 'Wake-word ON (sin soporte del navegador)') : 'Activar escucha de "CJ"'}
          className={`w-9 h-9 rounded-full shadow-lg flex items-center justify-center border transition-all ${
            wakeOn && wakeActivo
              ? 'bg-emerald-600/90 border-emerald-300 text-white animate-pulse'
              : wakeOn
              ? 'bg-amber-600/80 border-amber-300 text-white'
              : 'bg-gray-700/80 border-gray-500 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {wakeOn ? <Ear className="w-4 h-4" /> : <EarOff className="w-4 h-4" />}
        </button>

        {/* Botón principal */}
        <button
          onClick={() => {
            if (estado === 'grabando') detenerGrabacion();
            else if (estado === 'idle') iniciarGrabacion();
            else setOpen(true);
          }}
          title='Decí "CJ" para activar, o tocá para hablar'
          className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all border-2 relative ${
            estado === 'grabando'
              ? 'bg-red-500 border-red-300 animate-pulse'
              : estado === 'procesando' || estado === 'ejecutando'
              ? 'bg-amber-500 border-amber-300'
              : 'bg-emerald-500 border-emerald-300 hover:scale-110'
          }`}
        >
          {estado === 'procesando' || estado === 'ejecutando'
            ? <Loader2 className="w-6 h-6 text-white animate-spin" />
            : <Mic className="w-6 h-6 text-white" />}
          <span className="absolute -top-1 -left-1 text-[9px] font-black bg-black/70 text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-500/50">CJ</span>
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-gray-900 border border-emerald-500/30 rounded-2xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  estado === 'grabando' ? 'bg-red-500 animate-pulse' :
                  estado === 'procesando' || estado === 'ejecutando' ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`} />
                <h3 className="text-sm font-bold text-white">Asistente NOA</h3>
              </div>
              <button onClick={() => { reset(); setOpen(false); }} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {estado === 'grabando' && (
              <div className="text-center py-6">
                <div className="text-red-300 text-sm font-semibold mb-2">🎙️ Grabando...</div>
                <button onClick={detenerGrabacion}
                  className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white text-xs font-bold rounded-lg">
                  Detener y procesar
                </button>
              </div>
            )}

            {estado === 'procesando' && (
              <div className="text-center py-6 text-amber-300 text-sm">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Transcribiendo y analizando...
              </div>
            )}

            {transcripcion && (
              <div className="mb-3 rounded-lg bg-white/5 p-3 border border-white/10">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Vos dijiste</div>
                <div className="text-sm text-gray-200 italic">"{transcripcion}"</div>
              </div>
            )}

            {plan && estado === 'esperando_confirmacion' && (
              <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/40 p-3">
                <div className="text-[10px] text-amber-300 uppercase tracking-wider mb-1">Voy a hacer esto</div>
                <div className="text-sm text-white font-semibold mb-3">{plan.explicacion_humana}</div>
                <details className="mb-3">
                  <summary className="text-[10px] text-gray-400 cursor-pointer">Ver detalle técnico</summary>
                  <pre className="text-[10px] text-gray-400 mt-1 overflow-auto max-h-40">
                    {JSON.stringify({ tool: plan.tool, args: plan.args }, null, 2)}
                  </pre>
                </details>
                <div className="flex gap-2">
                  <button onClick={() => { reset(); }}
                    className="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs rounded-lg border border-white/10">
                    Cancelar
                  </button>
                  <button onClick={ejecutarPlan}
                    className="flex-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Confirmar
                  </button>
                </div>
              </div>
            )}

            {resultado && (
              <div className="mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40 p-3">
                <div className="text-[10px] text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Respuesta
                </div>
                <div className="text-sm text-white">{resultado}</div>
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/40 p-3 text-xs text-red-200">
                {error}
              </div>
            )}

            {(estado === 'idle' && !plan && !transcripcion) && (
              <div className="text-center py-4">
                <button onClick={iniciarGrabacion}
                  className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold rounded-xl flex items-center gap-2 mx-auto">
                  <Mic className="w-4 h-4" /> Apretá para hablar
                </button>
                <p className="text-[10px] text-gray-500 mt-3">
                  Decí <span className="text-emerald-300 font-bold">"CJ"</span> en voz alta para activar, o tocá el botón. Ej: "Crear tarea llamar a Pérez para mañana asignada a Karina"
                </p>
              </div>
            )}

            {estado === 'idle' && (plan || transcripcion) && (
              <div className="text-center mt-2">
                <button onClick={iniciarGrabacion}
                  className="text-xs text-emerald-300 hover:text-emerald-200 underline">
                  Hablar de nuevo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

async function armarContexto(userId: string | undefined, nombre: string, rol: string) {
  const equipoQ = supabase.from('perfiles').select('id, nombre, rol').eq('activo', true).limit(50);
  const casosQ = supabase.from('casos_generales').select('id, titulo, expediente').eq('archivado', false).order('updated_at', { ascending: false }).limit(50);
  const previsQ = supabase.from('clientes_previsional').select('id, apellido_nombre, pipeline').order('updated_at', { ascending: false }).limit(30);
  const tareasQ = supabase.from('tareas')
    .select('id, titulo, estado, estado_dia, responsable_id')
    .neq('estado', 'completada')
    .order('updated_at', { ascending: false })
    .limit(40);
  const [eq, cs, pv, tk] = await Promise.all([equipoQ, casosQ, previsQ, tareasQ]);
  const tareasMias = (tk.data || []).filter((t: any) => !userId || t.responsable_id === userId).slice(0, 30);
  return {
    usuario: { id: userId || '', nombre, rol },
    fecha_actual: new Date().toISOString().slice(0, 10),
    equipo: (eq.data || []) as any[],
    casos_recientes: (cs.data || []) as any[],
    clientes_previsional_recientes: (pv.data || []) as any[],
    tareas_recientes: tareasMias,
  };
}

async function ejecutarTool(plan: Plan, userId: string): Promise<{ ok: boolean; mensaje: string }> {
  const a = plan.args as any;
  try {
    switch (plan.tool) {
      case 'crear_tarea': {
        const payload: any = {
          titulo: a.titulo,
          descripcion: a.descripcion || null,
          responsable_id: a.responsable_id || userId,
          caso_id: a.caso_id || null,
          prioridad: a.prioridad || 'media',
          estado: 'en_curso',
          fecha_limite: a.fecha_limite || null,
          created_by: userId,
          updated_by: userId,
        };
        const { error } = await supabase.from('tareas').insert(payload);
        if (error) return { ok: false, mensaje: 'Error al crear tarea: ' + error.message };
        return { ok: true, mensaje: `Tarea "${a.titulo}" creada.` };
      }
      case 'crear_nota_caso': {
        const { error } = await supabase.from('caso_general_notas').insert({
          caso_id: a.caso_id,
          contenido: a.contenido,
          created_by: userId,
        });
        if (error) return { ok: false, mensaje: 'Error al crear nota: ' + error.message };
        return { ok: true, mensaje: 'Nota agregada al seguimiento.' };
      }
      case 'marcar_escrito_subido': {
        const ts = new Date().toISOString();
        const update = a.subido
          ? { escrito_subido: true, escrito_subido_at: ts, escrito_ultima_verificacion: ts }
          : { escrito_subido: false, escrito_subido_at: null, escrito_ultima_verificacion: null };
        const { error } = await supabase.from('casos_generales').update(update).eq('id', a.caso_id);
        if (error) return { ok: false, mensaje: 'Error: ' + error.message };
        return { ok: true, mensaje: a.subido ? 'Escrito marcado como subido.' : 'Escrito desmarcado.' };
      }
      case 'crear_evento_agenda': {
        const payload: any = {
          titulo: a.titulo,
          fecha: a.fecha,
          hora: a.hora || null,
          observaciones: a.observaciones || null,
          caso_general_id: a.caso_general_id || null,
          created_by: userId,
        };
        const { error } = await supabase.from('audiencias_general').insert(payload);
        if (error) return { ok: false, mensaje: 'Error al agendar: ' + error.message };
        return { ok: true, mensaje: `Evento "${a.titulo}" agendado para ${a.fecha}.` };
      }
      case 'consultar': {
        return { ok: true, mensaje: a.respuesta || 'OK' };
      }
      case 'registrar_ingreso': {
        const hoy = new Date().toISOString().slice(0, 10);
        const monto = Number(a.monto_total) || 0;
        const payload: any = {
          fecha: a.fecha || hoy,
          cliente_nombre: a.cliente_nombre || '',
          materia: a.materia || null,
          concepto: a.concepto || 'Honorarios',
          monto_total: monto,
          monto_cj_noa: monto,
          comision_captadora: 0,
          captadora_nombre: null,
          socio_cobro: a.socio_cobro || null,
          modalidad: a.modalidad || 'Efectivo',
          notas: a.notas || null,
          es_manual: true,
          created_by: userId,
        };
        const { error } = await supabase.from('ingresos').insert(payload);
        if (error) return { ok: false, mensaje: 'Error al registrar ingreso: ' + error.message };
        return { ok: true, mensaje: `Ingreso de $${monto.toLocaleString('es-AR')} registrado.` };
      }
      case 'registrar_egreso': {
        const hoy = new Date().toISOString().slice(0, 10);
        const monto = Number(a.monto) || 0;
        const payload: any = {
          fecha: a.fecha || hoy,
          concepto: a.concepto,
          concepto_detalle: a.concepto_detalle || null,
          monto,
          modalidad: a.modalidad || 'Efectivo',
          responsable: a.responsable || null,
          observaciones: a.observaciones || null,
          created_by: userId,
        };
        const { error } = await supabase.from('egresos').insert(payload);
        if (error) return { ok: false, mensaje: 'Error al registrar egreso: ' + error.message };
        return { ok: true, mensaje: `Egreso de $${monto.toLocaleString('es-AR')} registrado.` };
      }
      case 'agregar_avance_previsional': {
        const { error } = await supabase.from('historial_avances').insert({
          cliente_prev_id: a.cliente_id,
          titulo: 'Avance por voz',
          descripcion: a.descripcion,
          usuario_id: userId,
        });
        if (error) return { ok: false, mensaje: 'Error: ' + error.message };
        return { ok: true, mensaje: 'Avance agregado a la ficha.' };
      }
      case 'cambiar_pipeline_previsional': {
        const { error } = await supabase.from('clientes_previsional')
          .update({ pipeline: a.pipeline })
          .eq('id', a.cliente_id);
        if (error) return { ok: false, mensaje: 'Error: ' + error.message };
        return { ok: true, mensaje: `Ficha movida a ${a.pipeline}.` };
      }
      case 'iniciar_cronometro_tarea': {
        const startedAt = new Date().toISOString();
        const { error } = await supabase.rpc('tarea_set_estado_dia', {
          p_tarea_id: a.tarea_id,
          p_estado_dia: 'en_progreso',
          p_started_at: startedAt,
          p_tiempo_real_min: null,
        });
        if (error) {
          const { error: e2 } = await supabase.from('tareas').update({
            estado_dia: 'en_progreso',
            started_at: startedAt,
          }).eq('id', a.tarea_id);
          if (e2) return { ok: false, mensaje: 'No se pudo iniciar: ' + e2.message };
        }
        return { ok: true, mensaje: 'Cronómetro iniciado.' };
      }
      case 'pausar_cronometro_tarea': {
        const { data: t } = await supabase.from('tareas')
          .select('started_at, tiempo_real_min')
          .eq('id', a.tarea_id).maybeSingle();
        const startedAt = (t as any)?.started_at;
        const acumulado = Number((t as any)?.tiempo_real_min || 0);
        const min = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000) : 0;
        const totalMin = acumulado + min;
        const { error } = await supabase.rpc('tarea_set_estado_dia', {
          p_tarea_id: a.tarea_id,
          p_estado_dia: 'pausada',
          p_started_at: null,
          p_tiempo_real_min: totalMin,
        });
        if (error) {
          const { error: e2 } = await supabase.from('tareas').update({
            estado_dia: 'pausada',
            started_at: null,
            tiempo_real_min: totalMin,
          }).eq('id', a.tarea_id);
          if (e2) return { ok: false, mensaje: 'No se pudo pausar: ' + e2.message };
        }
        return { ok: true, mensaje: `Cronómetro pausado (${totalMin} min acumulados).` };
      }
      case 'completar_tarea': {
        const { data: t } = await supabase.from('tareas')
          .select('started_at, tiempo_real_min')
          .eq('id', a.tarea_id).maybeSingle();
        let totalMin = Number((t as any)?.tiempo_real_min || 0);
        const startedAt = (t as any)?.started_at;
        if (startedAt) totalMin += Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
        const { error } = await supabase.from('tareas').update({
          estado: 'completada',
          estado_dia: 'completada',
          tiempo_real_min: totalMin,
          started_at: null,
          fecha_completada: new Date().toISOString(),
          culminacion: a.culminacion || null,
          updated_by: userId,
        }).eq('id', a.tarea_id);
        if (error) return { ok: false, mensaje: 'No se pudo completar: ' + error.message };
        return { ok: true, mensaje: 'Tarea completada.' };
      }
      case 'verificar_escrito': {
        const ts = new Date().toISOString();
        const { error } = await supabase.from('casos_generales')
          .update({ escrito_ultima_verificacion: ts })
          .eq('id', a.caso_id);
        if (error) return { ok: false, mensaje: 'Error: ' + error.message };
        return { ok: true, mensaje: 'Escrito verificado.' };
      }
      default:
        return { ok: false, mensaje: `Tool no implementada: ${plan.tool}` };
    }
  } catch (e: any) {
    return { ok: false, mensaje: 'Error: ' + (e?.message || 'desconocido') };
  }
}
