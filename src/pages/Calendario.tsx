import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight, RefreshCw, Link as LinkIcon, Unlink, ExternalLink, Gavel, CalendarClock, Briefcase, Plus, X, Image as ImageIcon, Sparkles, Trash2, Mic, MicOff } from 'lucide-react';

type EventoCal = {
  id: string;
  source: 'audiencia_general' | 'consulta' | 'audiencia_legal' | 'gcal' | 'interno';
  fecha: Date;
  titulo: string;
  subtitulo?: string;
  color: string; // tailwind ring color
  bg: string;
  raw: any;
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 999); }
function fmtKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function buildGrid(monthDate: Date) {
  const first = startOfMonth(monthDate);
  // queremos lunes como primer dia (getDay: 0=dom..6=sab)
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(first.getDate() - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function Calendario() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [cursor, setCursor] = useState(() => new Date());
  const [eventos, setEventos] = useState<EventoCal[]>([]);
  const [loading, setLoading] = useState(false);
  const [conectado, setConectado] = useState<{ google_email?: string; conectado_at?: string } | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState<Array<{ id: string; titulo: string; subtitulo: string; fecha: Date; source: string }>>([]);
  const [buscando, setBuscando] = useState(false);
  const [nuevoEvento, setNuevoEvento] = useState<null | {
    fecha: string; hora: string; duracion: number;
    titulo: string; descripcion: string; ubicacion: string;
    todoElDia: boolean; guardando: boolean;
  }>(null);

  // Estado para subir fotos y extraer turnos con IA
  type TurnoExtraido = {
    titulo: string; fecha: string; hora: string;
    ubicacion: string; descripcion: string; persona: string;
    cuil?: string; oficina?: string; numero_solicitud?: string;
    incluir: boolean; creado?: boolean; error?: string;
  };
  const [iaModal, setIaModal] = useState<null | {
    fase: 'subir' | 'analizando' | 'revisar' | 'creando';
    archivos: { name: string; dataUrl: string }[];
    turnos: TurnoExtraido[];
    log: string;
  }>(null);

  // Dictado por voz
  const [voiceModal, setVoiceModal] = useState<null | {
    fase: 'idle' | 'grabando' | 'procesando' | 'listo' | 'error';
    segundos: number;
    transcripcion: string;
    log: string;
  }>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const grabTimerRef = useRef<any>(null);

  function abrirNuevoEvento(fechaKey: string) {
    setNuevoEvento({
      fecha: fechaKey,
      hora: '10:00',
      duracion: 60,
      titulo: '',
      descripcion: '',
      ubicacion: '',
      todoElDia: false,
      guardando: false,
    });
  }

  async function guardarNuevoEvento() {
    if (!nuevoEvento || !user) return;
    if (!nuevoEvento.titulo.trim()) { setMsg('Poné un título al evento.'); return; }
    setNuevoEvento({ ...nuevoEvento, guardando: true });
    try {
      const startISO = nuevoEvento.todoElDia
        ? `${nuevoEvento.fecha}T00:00:00`
        : `${nuevoEvento.fecha}T${nuevoEvento.hora}:00`;
      const startDate = new Date(startISO);
      const endDate = new Date(startDate.getTime() + Math.max(15, nuevoEvento.duracion) * 60_000);

      // 1) Siempre se guarda en el sistema interno.
      const { data: insertado, error: errInterno } = await supabase
        .from('eventos_internos')
        .insert({
          user_id: user.id,
          titulo: nuevoEvento.titulo,
          descripcion: nuevoEvento.descripcion || null,
          ubicacion: nuevoEvento.ubicacion || null,
          fecha_inicio: startDate.toISOString(),
          fecha_fin: endDate.toISOString(),
          todo_el_dia: nuevoEvento.todoElDia,
        })
        .select('id')
        .single();

      if (errInterno) {
        setMsg('❌ No se pudo guardar: ' + errInterno.message);
        setNuevoEvento({ ...nuevoEvento, guardando: false });
        return;
      }

      // 2) Si Google Calendar está conectado, además se sincroniza.
      let msgFinal = '✅ Evento agendado en el sistema.';
      if (conectado) {
        try {
          const r = await fetch('/api/google/create-event', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              summary: nuevoEvento.titulo,
              description: nuevoEvento.descripcion,
              location: nuevoEvento.ubicacion,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              allDay: nuevoEvento.todoElDia,
            }),
          });
          const j = await r.json();
          if (j.ok && j.event_id && insertado?.id) {
            await supabase.from('eventos_internos').update({ google_event_id: j.event_id }).eq('id', insertado.id);
            msgFinal = '✅ Evento agendado y sincronizado con Google Calendar.';
          } else if (!j.ok) {
            msgFinal = '✅ Evento agendado en el sistema (no se pudo sync a Google: ' + (j.error || 'error') + ').';
          }
        } catch (e: any) {
          msgFinal = '✅ Evento agendado en el sistema (no se pudo sync a Google: ' + (e?.message || 'error') + ').';
        }
      }

      setMsg(msgFinal);
      setNuevoEvento(null);
      // refrescar la grilla forzando un re-fetch (cambia un dummy en cursor)
      setCursor(new Date(cursor));
    } catch (e: any) {
      setMsg('❌ ' + (e?.message || 'error'));
      setNuevoEvento({ ...nuevoEvento, guardando: false });
    }
  }

  // ----- IA: subir fotos -> extraer turnos -> crear en Google -----
  function abrirSubirFotos() {
    setIaModal({ fase: 'subir', archivos: [], turnos: [], log: '' });
  }

  // ----- Dictado por voz -----
  async function iniciarGrabacion() {
    setVoiceModal({ fase: 'idle', segundos: 0, transcripcion: '', log: '' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (grabTimerRef.current) { clearInterval(grabTimerRef.current); grabTimerRef.current = null; }
        const blob = new Blob(audioChunksRef.current, { type: mime });
        await procesarAudio(blob, mime);
      };
      rec.start();
      mediaRecRef.current = rec;
      let secs = 0;
      grabTimerRef.current = setInterval(() => {
        secs += 1;
        setVoiceModal(v => v ? { ...v, segundos: secs } : v);
        if (secs >= 60) detenerGrabacion();
      }, 1000);
      setVoiceModal({ fase: 'grabando', segundos: 0, transcripcion: '', log: 'Hablando… (máx 60s)' });
    } catch (e: any) {
      setVoiceModal({ fase: 'error', segundos: 0, transcripcion: '', log: 'No se pudo acceder al micrófono: ' + (e?.message || 'permiso denegado') });
    }
  }

  function detenerGrabacion() {
    const rec = mediaRecRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
      setVoiceModal(v => v ? { ...v, fase: 'procesando', log: 'Transcribiendo y entendiendo lo que dijiste…' } : v);
    }
  }

  async function procesarAudio(blob: Blob, mime: string) {
    try {
      const buf = await blob.arrayBuffer();
      // a base64
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const r = await fetch('/api/google/voice-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_base64: b64, mime, fechaHoy: new Date().toISOString().slice(0,10) }),
      });
      const j = await r.json();
      if (!r.ok || !j.evento) {
        setVoiceModal(v => v ? { ...v, fase: 'error', log: '❌ ' + (j.error || 'no se entendió la frase'), transcripcion: j.transcripcion || '' } : v);
        return;
      }
      setVoiceModal(v => v ? { ...v, fase: 'listo', transcripcion: j.transcripcion, log: '' } : v);
      // Prellenar nuevoEvento con los datos extraídos
      const ev = j.evento;
      setNuevoEvento({
        fecha: ev.fecha || new Date().toISOString().slice(0,10),
        hora: ev.hora || '10:00',
        duracion: parseInt(ev.duracion_min) || 60,
        titulo: ev.titulo || j.transcripcion || '',
        descripcion: ev.descripcion || '',
        ubicacion: ev.ubicacion || '',
        todoElDia: !!ev.todoElDia,
        guardando: false,
      });
    } catch (e: any) {
      setVoiceModal(v => v ? { ...v, fase: 'error', log: '❌ ' + (e?.message || 'error') } : v);
    }
  }

  function cerrarVoz() {
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try { mediaRecRef.current.stop(); } catch {}
    }
    if (grabTimerRef.current) { clearInterval(grabTimerRef.current); grabTimerRef.current = null; }
    setVoiceModal(null);
  }

  async function onSelectFiles(files: FileList | null) {
    if (!iaModal || !files || files.length === 0) return;
    const arr: { name: string; dataUrl: string }[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      arr.push({ name: f.name, dataUrl });
    }
    setIaModal({ ...iaModal, archivos: [...iaModal.archivos, ...arr] });
  }

  async function analizarConIA() {
    if (!iaModal || iaModal.archivos.length === 0) return;
    setIaModal({ ...iaModal, fase: 'analizando', log: 'Analizando imágenes con IA…' });
    try {
      const r = await fetch('/api/google/extract-turnos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: iaModal.archivos.map(a => a.dataUrl) }),
      });
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.turnos)) {
        setIaModal({ ...iaModal, fase: 'subir', log: '❌ Error: ' + (j.error || 'no se pudieron leer los turnos') });
        return;
      }
      const turnos: TurnoExtraido[] = j.turnos.map((t: any) => ({
        titulo: t.titulo || '',
        fecha: t.fecha || '',
        hora: t.hora || '10:00',
        ubicacion: t.ubicacion || t.oficina || '',
        descripcion: t.descripcion || '',
        persona: t.persona || '',
        cuil: t.cuil || '',
        oficina: t.oficina || '',
        numero_solicitud: t.numero_solicitud || '',
        incluir: !!t.fecha,
      }));
      setIaModal({ ...iaModal, fase: 'revisar', turnos, log: '' });
    } catch (e: any) {
      setIaModal({ ...iaModal, fase: 'subir', log: '❌ ' + (e?.message || 'error') });
    }
  }

  async function crearTurnosEnGoogle() {
    if (!iaModal || !user || !conectado) {
      setMsg('Conectá Google Calendar primero.');
      return;
    }
    setIaModal({ ...iaModal, fase: 'creando', log: 'Creando eventos…' });
    const turnos = [...iaModal.turnos];
    let ok = 0, fail = 0;
    for (let i = 0; i < turnos.length; i++) {
      const t = turnos[i];
      if (!t.incluir || !t.fecha) continue;
      try {
        const startISO = `${t.fecha}T${(t.hora || '10:00')}:00`;
        const startDate = new Date(startISO);
        const endDate = new Date(startDate.getTime() + 60 * 60_000);
        const r = await fetch('/api/google/create-event', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            summary: t.titulo || `Turno ${t.persona || ''}`.trim(),
            description: [t.persona && `Titular: ${t.persona}`, t.cuil && `CUIL: ${t.cuil}`, t.numero_solicitud && `Nº solicitud: ${t.numero_solicitud}`, t.descripcion]
              .filter(Boolean).join('\n'),
            location: t.ubicacion || t.oficina || '',
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            allDay: false,
          }),
        });
        const j = await r.json();
        if (j.ok) { turnos[i] = { ...t, creado: true }; ok++; }
        else { turnos[i] = { ...t, error: j.error || 'fallo' }; fail++; }
      } catch (e: any) {
        turnos[i] = { ...t, error: e?.message || 'error' };
        fail++;
      }
    }
    setIaModal({ ...iaModal, fase: 'revisar', turnos, log: `Listo: ${ok} creados${fail ? `, ${fail} con error` : ''}.` });
    setMsg(`✅ ${ok} turno(s) agregado(s) al Google Calendar.`);
    setCursor(new Date(cursor));
  }

  // Mensaje desde callback
  useEffect(() => {
    if (params.get('connected') === '1') {
      setMsg('✅ Google Calendar conectado correctamente.');
      params.delete('connected');
      setParams(params, { replace: true });
    }
    const err = params.get('google_error');
    if (err) {
      setMsg('❌ Error conectando Google: ' + err);
      params.delete('google_error');
      setParams(params, { replace: true });
    }
  }, []);

  // Estado de conexion Google
  useEffect(() => {
    if (!user) return;
    supabase.from('google_oauth_tokens')
      .select('google_email, conectado_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setConectado(data || null));
  }, [user, msg]);

  // Cargar eventos del mes visible
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const startDate = fmtKey(start);
    const endDate = fmtKey(end);

    Promise.all([
      supabase.from('audiencias_general_completas')
        .select('*')
        .gte('fecha', startISO).lte('fecha', endISO),
      // Cargamos TODAS las consultas (la tabla es chica) para que nunca quede nada
      // fuera por un filtro de rango/fecha; el render por dia las ubica solo en su celda.
      supabase.from('consultas_agendadas')
        .select('*')
        .order('fecha_consulta', { ascending: false })
        .limit(2000),
      supabase.from('audiencias')
        .select('*')
        .gte('fecha', startISO).lte('fecha', endISO),
      // Eventos directos del Google Calendar del usuario (si esta conectado)
      conectado && user
        ? fetch(`/api/google/list-events?user_id=${encodeURIComponent(user.id)}&timeMin=${encodeURIComponent(startISO)}&timeMax=${encodeURIComponent(endISO)}`)
            .then(r => r.json()).catch(() => ({ events: [] }))
        : Promise.resolve({ events: [] as any[] }),
      // Eventos internos del sistema (no requieren Google)
      supabase.from('eventos_internos')
        .select('*')
        .gte('fecha_inicio', startISO).lte('fecha_inicio', endISO),
    ]).then(([ag, cs, al, gc, ei]) => {
      if (!alive) return;
      // Surface RLS / query errors al usuario para no fallar silencioso
      const errs: string[] = [];
      if ((ag as any)?.error) errs.push('Audiencias: ' + (ag as any).error.message);
      if ((cs as any)?.error) errs.push('Consultas (agendamiento): ' + (cs as any).error.message);
      if ((al as any)?.error) errs.push('Audiencias casos: ' + (al as any).error.message);
      if ((ei as any)?.error && !((ei as any).error.message || '').includes('does not exist'))
        errs.push('Eventos internos: ' + (ei as any).error.message);
      if (errs.length) setMsg('⚠️ ' + errs.join(' · '));
      const out: EventoCal[] = [];
      (ag.data || []).forEach((r: any) => {
        out.push({
          id: 'ag-' + r.id,
          source: 'audiencia_general',
          fecha: new Date(r.fecha),
          titulo: `Audiencia${r.tipo ? ' ' + r.tipo : ''}`,
          subtitulo: r.caso_general_titulo || r.cliente_nombre || r.juzgado || '',
          color: 'border-orange-400/40',
          bg: 'bg-orange-500/15 text-orange-200',
          raw: r,
        });
      });
      (cs.data || []).forEach((r: any) => {
        // Sanitizar: fecha_consulta puede venir como 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm:ss+00:00'
        const fechaStr = String(r.fecha_consulta || '').slice(0, 10);
        const horaStr = String(r.hora_consulta || '10:00').slice(0, 5);
        if (!fechaStr || !/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return;
        const [y, mo, da] = fechaStr.split('-').map(Number);
        const [hh, mm] = horaStr.split(':').map(Number);
        const d = new Date(y, mo - 1, da, hh || 10, mm || 0, 0);
        out.push({
          id: 'cs-' + r.id,
          source: 'consulta',
          fecha: d,
          titulo: `Consulta ${r.cliente_nombre || ''}`,
          subtitulo: r.detalle_consulta || r.telefono || '',
          color: 'border-violet-400/40',
          bg: 'bg-violet-500/15 text-violet-200',
          raw: r,
        });
      });
      (al.data || []).forEach((r: any) => {
        out.push({
          id: 'al-' + r.id,
          source: 'audiencia_legal',
          fecha: new Date(r.fecha),
          titulo: r.titulo || 'Audiencia',
          subtitulo: r.juzgado || r.descripcion || '',
          color: 'border-sky-400/40',
          bg: 'bg-sky-500/15 text-sky-200',
          raw: r,
        });
      });
      // Eventos de Google Calendar (excluye los que ya creamos nosotros para no duplicar)
      const idsLocales = new Set(
        (ag.data || [])
          .map((r: any) => r.google_event_id)
          .filter(Boolean)
      );
      // Tambien excluir los google_event_id de eventos internos sincronizados
      ((ei as any)?.data || []).forEach((r: any) => {
        if (r.google_event_id) idsLocales.add(r.google_event_id);
      });
      ((gc as any).events || []).forEach((e: any) => {
        if (!e.start) return;
        if (idsLocales.has(e.id)) return;
        out.push({
          id: 'gc-' + e.id,
          source: 'gcal',
          fecha: new Date(e.start),
          titulo: e.summary || '(sin título)',
          subtitulo: e.location || e.description || '',
          color: 'border-emerald-400/40',
          bg: 'bg-emerald-500/15 text-emerald-200',
          raw: e,
        });
      });
      // Eventos internos del sistema
      ((ei as any)?.data || []).forEach((r: any) => {
        out.push({
          id: 'ei-' + r.id,
          source: 'interno',
          fecha: new Date(r.fecha_inicio),
          titulo: r.titulo || '(sin título)',
          subtitulo: r.ubicacion || r.descripcion || '',
          color: 'border-pink-400/40',
          bg: 'bg-pink-500/15 text-pink-200',
          raw: r,
        });
      });
      setEventos(out.sort((a,b) => a.fecha.getTime() - b.fecha.getTime()));
      setLoading(false);
    });

    return () => { alive = false; };
  }, [cursor, conectado, user]);

  const grid = useMemo(() => buildGrid(cursor), [cursor]);
  const eventosPorDia = useMemo(() => {
    const m = new Map<string, EventoCal[]>();
    eventos.forEach(e => {
      const k = fmtKey(e.fecha);
      const arr = m.get(k) || [];
      arr.push(e);
      m.set(k, arr);
    });
    return m;
  }, [eventos]);

  async function conectarGoogle() {
    if (!user) return;
    const r = await fetch(`/api/google/auth-url?user_id=${encodeURIComponent(user.id)}`);
    const j = await r.json();
    if (j.url) window.location.href = j.url;
    else setMsg('❌ No se pudo iniciar OAuth: ' + (j.error || ''));
  }

  async function desconectarGoogle() {
    if (!user) return;
    if (!confirm('¿Desconectar Google Calendar? Las audiencias ya sincronizadas NO se borrarán de tu calendario.')) return;
    await supabase.from('google_oauth_tokens').delete().eq('user_id', user.id);
    setConectado(null);
    setMsg('Google Calendar desconectado.');
  }

  async function buscarGlobal() {
    const q = busquedaGlobal.trim();
    if (q.length < 2) { setResultadosBusqueda([]); return; }
    setBuscando(true);
    try {
      const [cs, ag, al, ei] = await Promise.all([
        supabase.from('consultas_agendadas')
          .select('id, cliente_nombre, detalle_consulta, fecha_consulta, hora_consulta')
          .ilike('cliente_nombre', `%${q}%`)
          .order('fecha_consulta', { ascending: false })
          .limit(15),
        supabase.from('audiencias_general_completas')
          .select('id, tipo, caso_general_titulo, cliente_nombre, juzgado, fecha')
          .or(`cliente_nombre.ilike.%${q}%,caso_general_titulo.ilike.%${q}%,juzgado.ilike.%${q}%`)
          .order('fecha', { ascending: false })
          .limit(15),
        supabase.from('audiencias')
          .select('id, titulo, juzgado, descripcion, fecha')
          .or(`titulo.ilike.%${q}%,juzgado.ilike.%${q}%,descripcion.ilike.%${q}%`)
          .order('fecha', { ascending: false })
          .limit(15),
        supabase.from('eventos_internos')
          .select('id, titulo, ubicacion, descripcion, fecha_inicio')
          .or(`titulo.ilike.%${q}%,ubicacion.ilike.%${q}%,descripcion.ilike.%${q}%`)
          .order('fecha_inicio', { ascending: false })
          .limit(15),
      ]);
      const out: Array<{ id: string; titulo: string; subtitulo: string; fecha: Date; source: string }> = [];
      (cs.data || []).forEach((r: any) => out.push({
        id: 'cs-' + r.id,
        titulo: `Consulta ${r.cliente_nombre || ''}`,
        subtitulo: r.detalle_consulta || '',
        fecha: new Date(`${r.fecha_consulta}T${(r.hora_consulta || '10:00')}:00`),
        source: 'consulta',
      }));
      (ag.data || []).forEach((r: any) => out.push({
        id: 'ag-' + r.id,
        titulo: `Audiencia${r.tipo ? ' ' + r.tipo : ''}`,
        subtitulo: r.caso_general_titulo || r.cliente_nombre || r.juzgado || '',
        fecha: new Date(r.fecha),
        source: 'audiencia_general',
      }));
      (al.data || []).forEach((r: any) => out.push({
        id: 'al-' + r.id,
        titulo: r.titulo || 'Audiencia',
        subtitulo: r.juzgado || r.descripcion || '',
        fecha: new Date(r.fecha),
        source: 'audiencia_legal',
      }));
      (ei.data || []).forEach((r: any) => out.push({
        id: 'ei-' + r.id,
        titulo: r.titulo || '(sin título)',
        subtitulo: r.ubicacion || r.descripcion || '',
        fecha: new Date(r.fecha_inicio),
        source: 'interno',
      }));
      out.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
      setResultadosBusqueda(out);
    } finally {
      setBuscando(false);
    }
  }

  function irAEvento(fecha: Date) {
    const k = fmtKey(fecha);
    setCursor(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
    setDiaSeleccionado(k);
    setResultadosBusqueda([]);
    setBusquedaGlobal('');
  }

  async function sincronizarMes() {
    if (!conectado) { setMsg('Primero conectá Google Calendar.'); return; }
    setSyncing(true); setMsg(null);
    let ok = 0, fail = 0;
    for (const e of eventos) {
      if (e.source === 'audiencia_legal') continue; // no sincronizamos las legales por ahora
      try {
        const r = await fetch('/api/google/sync-audiencia', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audiencia_id: e.raw.id, source: e.source === 'consulta' ? 'consulta' : 'audiencia' }),
        });
        const j = await r.json();
        if (j.ok || j.skipped) ok++; else fail++;
      } catch { fail++; }
    }
    setSyncing(false);
    setMsg(`Sincronización completa: ${ok} OK${fail ? `, ${fail} con error` : ''}.`);
  }

  const seleccion = diaSeleccionado ? (eventosPorDia.get(diaSeleccionado) || []) : [];
  const hoyKey = fmtKey(new Date());

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendario</h1>
          <p className="text-sm text-gray-500">Audiencias, consultas y eventos en una sola vista.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={iniciarGrabacion}
            className="px-3 py-2 text-xs rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/30 flex items-center gap-2"
            title="Dictar evento por voz">
            <Mic className="w-3.5 h-3.5" /> Dictar evento
          </button>
          <button onClick={abrirSubirFotos}
            className="px-3 py-2 text-xs rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-500/30 flex items-center gap-2"
            title="Subir fotos de turnos y agendar automáticamente con IA">
            <Sparkles className="w-3.5 h-3.5" /> Subir turnos con IA
          </button>
          {conectado ? (
            <>
              <span className="px-3 py-2 text-xs rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-2">
                <LinkIcon className="w-3.5 h-3.5" /> Google: {conectado.google_email || 'conectado'}
              </span>
              <button onClick={sincronizarMes} disabled={syncing}
                className="px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center gap-2 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar mes
              </button>
              <button onClick={desconectarGoogle}
                className="px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-red-500/10 text-red-300 border border-white/10 flex items-center gap-2">
                <Unlink className="w-3.5 h-3.5" /> Desconectar
              </button>
            </>
          ) : (
            <button onClick={conectarGoogle}
              className="px-3 py-2 text-xs rounded-lg bg-white text-black hover:bg-gray-100 flex items-center gap-2 font-medium">
              <LinkIcon className="w-3.5 h-3.5" /> Conectar Google Calendar
            </button>
          )}
        </div>
      </header>

      {msg && (
        <div className="px-4 py-2 rounded-lg bg-white/5 text-sm text-white border border-white/10">{msg}</div>
      )}

      <div className="text-[11px] text-gray-500 px-1">
        Cargados: {eventos.filter(e => e.source === 'consulta').length} consultas ·{' '}
        {eventos.filter(e => e.source === 'audiencia_general').length} audiencias generales ·{' '}
        {eventos.filter(e => e.source === 'audiencia_legal').length} audiencias casos ·{' '}
        {eventos.filter(e => e.source === 'interno').length} eventos internos ·{' '}
        {eventos.filter(e => e.source === 'gcal').length} de Google
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{MESES[cursor.getMonth()]} {cursor.getFullYear()}</h2>
          <button onClick={() => setCursor(new Date())}
            className="px-2 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">
            Hoy
          </button>
        </div>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500/60" /> Audiencias generales</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500/60" /> Consultas</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/60" /> Audiencias (casos legales)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-pink-500/60" /> Eventos del sistema</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Google Calendar</span>
      </div>

      {/* Búsqueda global de eventos (salta al mes correcto) */}
      <div className="rounded-xl border border-white/10 bg-[#0c0c0e] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={busquedaGlobal}
            onChange={(e) => setBusquedaGlobal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscarGlobal(); }}
            placeholder="Buscar consulta, audiencia o evento por nombre (ej: corsanigo)..."
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={buscarGlobal}
            disabled={buscando || busquedaGlobal.trim().length < 2}
            className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white border border-white/10 disabled:opacity-50"
          >
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
          {resultadosBusqueda.length > 0 && (
            <button
              onClick={() => { setResultadosBusqueda([]); setBusquedaGlobal(''); }}
              className="px-2 py-1.5 text-xs rounded-md text-gray-400 hover:text-white"
            >
              Limpiar
            </button>
          )}
        </div>
        {resultadosBusqueda.length > 0 && (
          <ul className="divide-y divide-white/[0.05] max-h-64 overflow-y-auto">
            {resultadosBusqueda.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => irAEvento(r.fecha)}
                  className="w-full text-left px-2 py-2 hover:bg-white/[0.04] rounded-md flex items-center gap-3"
                >
                  <span className={`w-2 h-2 rounded-full ${
                    r.source === 'consulta' ? 'bg-violet-400' :
                    r.source === 'audiencia_general' ? 'bg-orange-400' :
                    r.source === 'audiencia_legal' ? 'bg-sky-400' :
                    'bg-pink-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{r.titulo}</div>
                    {r.subtitulo && <div className="text-[11px] text-gray-500 truncate">{r.subtitulo}</div>}
                  </div>
                  <div className="text-[11px] text-gray-400 whitespace-nowrap">
                    {r.fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' '}
                    {r.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/10 rounded-xl overflow-hidden text-[11px]">
        {DOW.map(d => (
          <div key={d} className="bg-[#0c0c0e] px-2 py-1.5 text-gray-500 font-semibold uppercase tracking-wider">{d}</div>
        ))}
        {grid.map((d, idx) => {
          const k = fmtKey(d);
          const enMes = d.getMonth() === cursor.getMonth();
          const esHoy = k === hoyKey;
          const evs = eventosPorDia.get(k) || [];
          return (
            <button key={idx}
              onClick={() => setDiaSeleccionado(k)}
              className={`min-h-[92px] text-left bg-[#0a0a0a] hover:bg-white/[0.03] p-1.5 flex flex-col gap-1 transition ${enMes ? '' : 'opacity-40'} ${diaSeleccionado === k ? 'ring-2 ring-white/30 z-10' : ''}`}
            >
              <div className={`text-[11px] font-semibold ${esHoy ? 'text-emerald-300' : 'text-gray-300'}`}>
                {d.getDate()}
                {esHoy && <span className="ml-1 text-[9px] uppercase">hoy</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                {evs.slice(0, 3).map(e => (
                  <div key={e.id} className={`truncate px-1 py-0.5 rounded border ${e.color} ${e.bg} text-[10px]`}>
                    {e.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} {e.titulo}
                  </div>
                ))}
                {evs.length > 3 && <div className="text-[10px] text-gray-500">+{evs.length - 3} más…</div>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle del dia seleccionado */}
      {diaSeleccionado && (
        <div className="rounded-xl border border-white/10 bg-[#0c0c0e] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-white font-semibold">
              Eventos del {(() => {
                const [y, m, d] = diaSeleccionado.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
              })()}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => abrirNuevoEvento(diaSeleccionado)}
                className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 flex items-center gap-1"
                title={conectado ? 'Crear evento (sistema + Google Calendar)' : 'Crear evento en el sistema (sin Google Calendar)'}
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo evento
              </button>
              <button onClick={() => setDiaSeleccionado(null)} className="text-xs text-gray-500 hover:text-white">Cerrar</button>
            </div>
          </div>
          {seleccion.length === 0 ? (
            <p className="text-sm text-gray-500">Sin eventos.</p>
          ) : (
            <ul className="space-y-2">
              {seleccion.map(e => (
                <li key={e.id} className={`p-3 rounded-lg border ${e.color} ${e.bg.replace('text-','text-white ')} bg-white/[0.02]`}>
                  <div className="flex items-start gap-2">
                    {e.source === 'audiencia_general' && <Briefcase className="w-4 h-4 mt-0.5 text-orange-300" />}
                    {e.source === 'consulta' && <CalendarClock className="w-4 h-4 mt-0.5 text-violet-300" />}
                    {e.source === 'audiencia_legal' && <Gavel className="w-4 h-4 mt-0.5 text-sky-300" />}
                    {e.source === 'interno' && <CalendarClock className="w-4 h-4 mt-0.5 text-pink-300" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium">{e.titulo}</div>
                      {e.subtitulo && <div className="text-xs text-gray-400 truncate">{e.subtitulo}</div>}
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {e.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {e.raw.juzgado && ` · ${e.raw.juzgado}`}
                      </div>
                      {e.raw.notas && <div className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{e.raw.notas}</div>}
                      {e.raw.observaciones && <div className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{e.raw.observaciones}</div>}
                    </div>
                    {e.source === 'audiencia_general' && conectado && (
                      <button
                        onClick={async () => {
                          setMsg('Sincronizando…');
                          const r = await fetch('/api/google/sync-audiencia', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ audiencia_id: e.raw.id }),
                          });
                          const j = await r.json();
                          setMsg(j.ok ? '✅ Sincronizado' : ('❌ ' + (j.error || 'fallo')));
                        }}
                        className="text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Sync
                      </button>
                    )}
                    {e.raw.google_event_id && (
                      <a
                        href={`https://calendar.google.com/calendar/event?eid=${e.raw.google_event_id}`}
                        target="_blank" rel="noreferrer"
                        className="text-xs px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
                        title="Abrir en Google Calendar"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {e.source === 'interno' && (
                      <button
                        onClick={async () => {
                          if (!confirm('¿Eliminar este evento del sistema?')) return;
                          const { error } = await supabase.from('eventos_internos').delete().eq('id', e.raw.id);
                          if (error) { setMsg('❌ ' + error.message); return; }
                          setMsg('🗑️ Evento eliminado.');
                          setCursor(new Date(cursor));
                        }}
                        className="text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-300 border border-white/10 flex items-center gap-1"
                        title="Eliminar evento"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && <div className="text-xs text-gray-500">Cargando eventos…</div>}

      {/* Modal Dictado por voz */}
      {voiceModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => voiceModal.fase !== 'procesando' && cerrarVoz()}>
          <div className="w-full max-w-md rounded-2xl bg-[#0c0c0e] border border-white/10 p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Mic className="w-4 h-4 text-rose-300" /> Dictar evento
              </h3>
              <button onClick={cerrarVoz} disabled={voiceModal.fase === 'procesando'}
                className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {voiceModal.fase === 'idle' && (
              <div className="py-6 space-y-3">
                <p className="text-sm text-gray-300">Tocá el micrófono y decí algo como:</p>
                <p className="text-xs text-gray-500 italic">"Reunión con cliente Pérez mañana a las 10 en la oficina"</p>
                <button onClick={iniciarGrabacion}
                  className="mx-auto w-20 h-20 rounded-full bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center shadow-lg shadow-rose-500/30">
                  <Mic className="w-8 h-8" />
                </button>
              </div>
            )}

            {voiceModal.fase === 'grabando' && (
              <div className="py-6 space-y-3">
                <div className="mx-auto w-24 h-24 rounded-full bg-rose-500 text-white flex items-center justify-center animate-pulse shadow-lg shadow-rose-500/40">
                  <Mic className="w-10 h-10" />
                </div>
                <div className="text-2xl font-mono text-white">
                  {String(Math.floor(voiceModal.segundos / 60)).padStart(2,'0')}:{String(voiceModal.segundos % 60).padStart(2,'0')}
                </div>
                <p className="text-xs text-gray-400">{voiceModal.log}</p>
                <button onClick={detenerGrabacion}
                  className="px-4 py-2 text-sm rounded-lg bg-white text-black font-medium flex items-center gap-2 mx-auto">
                  <MicOff className="w-4 h-4" /> Detener y procesar
                </button>
              </div>
            )}

            {voiceModal.fase === 'procesando' && (
              <div className="py-10 flex flex-col items-center gap-3 text-gray-300">
                <RefreshCw className="w-8 h-8 animate-spin text-rose-400" />
                <div className="text-sm">{voiceModal.log}</div>
              </div>
            )}

            {voiceModal.fase === 'listo' && (
              <div className="py-4 space-y-3">
                <div className="text-emerald-300 text-sm">✅ Entendido</div>
                <div className="text-xs text-gray-300 italic bg-white/5 rounded-md p-3 border border-white/10">
                  "{voiceModal.transcripcion}"
                </div>
                <p className="text-xs text-gray-400">Revisá los datos en el formulario y guardalo en Google Calendar.</p>
                <button onClick={cerrarVoz}
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-500 text-black font-medium">
                  Ver evento
                </button>
              </div>
            )}

            {voiceModal.fase === 'error' && (
              <div className="py-6 space-y-3">
                <div className="text-red-300 text-sm">{voiceModal.log}</div>
                {voiceModal.transcripcion && (
                  <div className="text-xs text-gray-400 italic">Escuchamos: "{voiceModal.transcripcion}"</div>
                )}
                <button onClick={iniciarGrabacion}
                  className="px-4 py-2 text-sm rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-medium">
                  Probar otra vez
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Nuevo evento */}
      {nuevoEvento && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !nuevoEvento.guardando && setNuevoEvento(null)}>
          <div className="w-full max-w-md rounded-2xl bg-[#0c0c0e] border border-white/10 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-300" /> Nuevo evento</h3>
              <button onClick={() => setNuevoEvento(null)} disabled={nuevoEvento.guardando} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {!conectado && (
              <div className="text-xs px-3 py-2 rounded-md bg-amber-500/10 text-amber-200 border border-amber-500/30">
                Necesitás conectar Google Calendar para crear eventos.
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-500">Título</label>
                <input
                  autoFocus
                  value={nuevoEvento.titulo}
                  onChange={(e) => setNuevoEvento({ ...nuevoEvento, titulo: e.target.value })}
                  placeholder="Reunión con cliente…"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-gray-500">Fecha</label>
                  <input type="date" value={nuevoEvento.fecha}
                    onChange={(e) => setNuevoEvento({ ...nuevoEvento, fecha: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white focus:outline-none focus:border-white/30"
                  />
                </div>
                {!nuevoEvento.todoElDia && (
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-500">Hora</label>
                    <input type="time" value={nuevoEvento.hora}
                      onChange={(e) => setNuevoEvento({ ...nuevoEvento, hora: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                )}
              </div>

              {!nuevoEvento.todoElDia && (
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-gray-500">Duración (minutos)</label>
                  <input type="number" min={15} step={15} value={nuevoEvento.duracion}
                    onChange={(e) => setNuevoEvento({ ...nuevoEvento, duracion: parseInt(e.target.value) || 60 })}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white focus:outline-none focus:border-white/30"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input type="checkbox" checked={nuevoEvento.todoElDia}
                  onChange={(e) => setNuevoEvento({ ...nuevoEvento, todoElDia: e.target.checked })}
                />
                Evento de todo el día
              </label>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-500">Ubicación</label>
                <input value={nuevoEvento.ubicacion}
                  onChange={(e) => setNuevoEvento({ ...nuevoEvento, ubicacion: e.target.value })}
                  placeholder="Opcional…"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-500">Descripción</label>
                <textarea value={nuevoEvento.descripcion}
                  onChange={(e) => setNuevoEvento({ ...nuevoEvento, descripcion: e.target.value })}
                  rows={3}
                  placeholder="Notas, agenda…"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setNuevoEvento(null)} disabled={nuevoEvento.guardando}
                className="px-3 py-2 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">
                Cancelar
              </button>
              <button onClick={guardarNuevoEvento} disabled={nuevoEvento.guardando || !conectado}
                className="px-3 py-2 text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-black font-medium disabled:opacity-50 flex items-center gap-1.5">
                {nuevoEvento.guardando && <RefreshCw className="w-3 h-3 animate-spin" />}
                Crear en Google Calendar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal IA: subir fotos -> turnos */}
      {iaModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => iaModal.fase !== 'analizando' && iaModal.fase !== 'creando' && setIaModal(null)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0c0c0e] border border-white/10 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-300" /> Subir turnos con IA
              </h3>
              <button onClick={() => setIaModal(null)} disabled={iaModal.fase === 'analizando' || iaModal.fase === 'creando'}
                className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {!conectado && (
              <div className="text-xs px-3 py-2 rounded-md bg-amber-500/10 text-amber-200 border border-amber-500/30">
                Necesitás conectar Google Calendar para que los turnos se guarden ahí.
              </div>
            )}

            {iaModal.fase === 'subir' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-300">
                  Subí las fotos / capturas de los turnos (ANSES, juzgados, citas, etc.). La IA va a leer
                  fecha, hora, persona, oficina y crear los eventos en tu Google Calendar.
                </p>
                <label className="block border-2 border-dashed border-white/15 hover:border-fuchsia-400/40 rounded-xl p-6 text-center cursor-pointer transition">
                  <ImageIcon className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <div className="text-sm text-gray-300">Hacé click para elegir imágenes (podés subir varias)</div>
                  <div className="text-[11px] text-gray-500 mt-1">JPG / PNG / WEBP</div>
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => onSelectFiles(e.target.files)} />
                </label>

                {iaModal.archivos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {iaModal.archivos.map((a, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-white/10 bg-black/30">
                        <img src={a.dataUrl} alt={a.name} className="w-full h-32 object-cover" />
                        <button
                          onClick={() => setIaModal({ ...iaModal, archivos: iaModal.archivos.filter((_, j) => j !== i) })}
                          className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-red-300 opacity-0 group-hover:opacity-100 transition"
                          title="Quitar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white bg-black/70 truncate">{a.name}</div>
                      </div>
                    ))}
                  </div>
                )}

                {iaModal.log && <div className="text-xs text-amber-300">{iaModal.log}</div>}

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setIaModal(null)}
                    className="px-3 py-2 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">Cancelar</button>
                  <button onClick={analizarConIA} disabled={iaModal.archivos.length === 0}
                    className="px-3 py-2 text-xs rounded-md bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-medium disabled:opacity-50 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Analizar con IA
                  </button>
                </div>
              </div>
            )}

            {iaModal.fase === 'analizando' && (
              <div className="py-10 flex flex-col items-center gap-3 text-gray-300">
                <RefreshCw className="w-8 h-8 animate-spin text-fuchsia-400" />
                <div className="text-sm">Leyendo {iaModal.archivos.length} imagen(es) con IA…</div>
              </div>
            )}

            {(iaModal.fase === 'revisar' || iaModal.fase === 'creando') && (
              <div className="space-y-3">
                {iaModal.log && <div className="text-xs text-emerald-300">{iaModal.log}</div>}
                <p className="text-xs text-gray-400">Revisá los datos extraídos. Podés editar o desmarcar antes de crearlos en Google Calendar.</p>

                <div className="space-y-2">
                  {iaModal.turnos.map((t, i) => (
                    <div key={i} className={`p-3 rounded-lg border ${t.creado ? 'border-emerald-500/40 bg-emerald-500/5' : t.error ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                      <div className="flex items-start gap-2">
                        <input type="checkbox" checked={t.incluir && !t.creado} disabled={t.creado || iaModal.fase === 'creando'}
                          onChange={(e) => {
                            const turnos = [...iaModal.turnos];
                            turnos[i] = { ...turnos[i], incluir: e.target.checked };
                            setIaModal({ ...iaModal, turnos });
                          }}
                          className="mt-1" />
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="sm:col-span-2">
                            <label className="text-[10px] uppercase tracking-wider text-gray-500">Título</label>
                            <input value={t.titulo} disabled={t.creado}
                              onChange={(e) => { const ts = [...iaModal.turnos]; ts[i] = { ...t, titulo: e.target.value }; setIaModal({ ...iaModal, turnos: ts }); }}
                              className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-sm disabled:opacity-60" />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-gray-500">Fecha</label>
                            <input type="date" value={t.fecha} disabled={t.creado}
                              onChange={(e) => { const ts = [...iaModal.turnos]; ts[i] = { ...t, fecha: e.target.value }; setIaModal({ ...iaModal, turnos: ts }); }}
                              className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-sm disabled:opacity-60" />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-gray-500">Hora</label>
                            <input type="time" value={t.hora} disabled={t.creado}
                              onChange={(e) => { const ts = [...iaModal.turnos]; ts[i] = { ...t, hora: e.target.value }; setIaModal({ ...iaModal, turnos: ts }); }}
                              className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-sm disabled:opacity-60" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-[10px] uppercase tracking-wider text-gray-500">Ubicación</label>
                            <input value={t.ubicacion} disabled={t.creado}
                              onChange={(e) => { const ts = [...iaModal.turnos]; ts[i] = { ...t, ubicacion: e.target.value }; setIaModal({ ...iaModal, turnos: ts }); }}
                              className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-sm disabled:opacity-60" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-[10px] uppercase tracking-wider text-gray-500">Descripción</label>
                            <textarea value={t.descripcion} rows={2} disabled={t.creado}
                              onChange={(e) => { const ts = [...iaModal.turnos]; ts[i] = { ...t, descripcion: e.target.value }; setIaModal({ ...iaModal, turnos: ts }); }}
                              className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-sm disabled:opacity-60 resize-none" />
                          </div>
                          {t.error && <div className="sm:col-span-2 text-xs text-red-300">❌ {t.error}</div>}
                          {t.creado && <div className="sm:col-span-2 text-xs text-emerald-300">✅ Creado en Google Calendar</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center gap-2 pt-2">
                  <button onClick={() => setIaModal({ ...iaModal, fase: 'subir' })}
                    className="px-3 py-2 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">
                    ← Subir más
                  </button>
                  <button onClick={crearTurnosEnGoogle}
                    disabled={iaModal.fase === 'creando' || !conectado || iaModal.turnos.every(t => !t.incluir || t.creado)}
                    className="px-3 py-2 text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-black font-medium disabled:opacity-50 flex items-center gap-1.5">
                    {iaModal.fase === 'creando' && <RefreshCw className="w-3 h-3 animate-spin" />}
                    Crear {iaModal.turnos.filter(t => t.incluir && !t.creado).length} en Google Calendar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
