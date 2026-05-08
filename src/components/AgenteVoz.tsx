import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Loader2, X, Check, Volume2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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

  if (!user) return null;

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => {
          if (estado === 'grabando') detenerGrabacion();
          else if (estado === 'idle') iniciarGrabacion();
          else setOpen(true);
        }}
        title="Asistente de voz NOA (mantené presionado para hablar)"
        className={`fixed bottom-5 right-5 z-[90] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all border-2 ${
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
      </button>

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
                  Ej: "Crear tarea llamar a Pérez para mañana asignada a Karina con prioridad alta"
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
  const [eq, cs] = await Promise.all([equipoQ, casosQ]);
  return {
    usuario: { id: userId || '', nombre, rol },
    fecha_actual: new Date().toISOString().slice(0, 10),
    equipo: (eq.data || []) as any[],
    casos_recientes: (cs.data || []) as any[],
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
      default:
        return { ok: false, mensaje: `Tool no implementada: ${plan.tool}` };
    }
  } catch (e: any) {
    return { ok: false, mensaje: 'Error: ' + (e?.message || 'desconocido') };
  }
}
