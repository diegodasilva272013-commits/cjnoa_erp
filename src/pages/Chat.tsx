import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Send, Paperclip, Smile, Mic, MicOff, Image as ImageIcon, Search, Plus, X,
  CheckCheck, MessageCircle, Users, FileText, Download, Pause, Play, ArrowLeft, Sparkles
} from 'lucide-react';

// --------------------- Tipos ---------------------
type Perfil = { id: string; nombre: string; rol: string; avatar_url?: string | null };

type Conversacion = {
  id: string;
  tipo: 'directo' | 'grupo';
  nombre: string | null;
  avatar_url: string | null;
  updated_at: string;
  ultimo_mensaje?: string | null;
  ultimo_tipo?: string | null;
  ultimo_at?: string | null;
  ultimo_emisor_nombre?: string | null;
  // calculados
  otros?: Perfil[];
  no_leidos?: number;
};

type Mensaje = {
  id: string;
  conversacion_id: string;
  emisor_id: string;
  tipo: 'texto' | 'imagen' | 'archivo' | 'audio' | 'gif' | 'sticker' | 'sistema';
  contenido: string | null;
  media_url: string | null;
  media_nombre: string | null;
  media_mime: string | null;
  media_size: number | null;
  duracion_seg: number | null;
  reply_to: string | null;
  editado: boolean;
  eliminado: boolean;
  created_at: string;
};

// Set chico de emojis usados frecuentemente (sin libs)
const EMOJI_SET = [
  '😀','😂','😅','😍','🥰','😎','🤔','🙄','😴','😭','🥲','🤯','😱',
  '👍','👏','🙌','🙏','👌','💪','✌️','🫶','❤️','🔥','✨','🎉','🎊',
  '😡','😤','😬','🤝','💯','✅','❌','⚠️','📌','📎','📷','🎤','🎵',
  '🍻','☕','🍕','🍔','💼','📁','📅','⏰','💸','💰','📞','💬','📝'
];

function formatHora(d: string) {
  return new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function formatFecha(d: string) {
  const f = new Date(d);
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  const dKey = new Date(f); dKey.setHours(0,0,0,0);
  if (dKey.getTime() === hoy.getTime()) return 'Hoy';
  if (dKey.getTime() === ayer.getTime()) return 'Ayer';
  return f.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });
}
function bytes(n: number | null) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/1024/1024).toFixed(1) + ' MB';
}

// ============================================================
export default function Chat() {
  const { user, perfil } = useAuth();
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [participantes, setParticipantes] = useState<Record<string, Perfil[]>>({});
  const [activaId, setActivaId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showMobileList, setShowMobileList] = useState(true);
  const [debug, setDebug] = useState<string>('');

  const conversacionActiva = conversaciones.find(c => c.id === activaId) || null;

  // Cargar perfiles
  useEffect(() => {
    if (!user) return;
    supabase.from('perfiles').select('id, nombre, rol, avatar_url').neq('id', user.id)
      .order('nombre').then(({ data }) => setPerfiles((data || []) as Perfil[]));
  }, [user]);

  // Cargar conversaciones + participantes
  async function cargarConversaciones() {
    if (!user) return;
    const { data: parts } = await supabase
      .from('chat_participantes').select('conversacion_id').eq('usuario_id', user.id);
    const convIds = (parts || []).map(p => p.conversacion_id);
    if (convIds.length === 0) { setConversaciones([]); return; }
    const { data: convs } = await supabase
      .from('chat_conv_resumen').select('*').in('id', convIds).order('updated_at', { ascending: false });
    const { data: allParts } = await supabase
      .from('chat_participantes').select('conversacion_id, usuario_id').in('conversacion_id', convIds);
    const userIds = Array.from(new Set((allParts || []).map(p => p.usuario_id)));
    const { data: pfs } = await supabase.from('perfiles').select('id, nombre, rol, avatar_url').in('id', userIds);
    const pfMap = new Map((pfs || []).map(p => [p.id, p as Perfil]));
    const partsByConv: Record<string, Perfil[]> = {};
    (allParts || []).forEach(p => {
      if (!partsByConv[p.conversacion_id]) partsByConv[p.conversacion_id] = [];
      const pf = pfMap.get(p.usuario_id);
      if (pf) partsByConv[p.conversacion_id].push(pf);
    });
    setParticipantes(partsByConv);
    // últimas lecturas para no leídos
    const { data: lecs } = await supabase.from('chat_lecturas')
      .select('conversacion_id, ultimo_leido').eq('usuario_id', user.id);
    const lecMap = new Map((lecs || []).map(l => [l.conversacion_id, l.ultimo_leido]));
    const enriched: Conversacion[] = (convs || []).map((c: any) => {
      const otros = (partsByConv[c.id] || []).filter(p => p.id !== user.id);
      let nombre = c.nombre;
      if (!nombre && c.tipo === 'directo' && otros.length > 0) nombre = otros[0].nombre;
      return { ...c, otros, nombre };
    });
    setConversaciones(enriched);
    // contar no leídos
    if (enriched.length > 0) {
      const counts = await Promise.all(enriched.map(async c => {
        const ultimo = lecMap.get(c.id) || '1970-01-01';
        const { count } = await supabase.from('chat_mensajes')
          .select('id', { count: 'exact', head: true })
          .eq('conversacion_id', c.id)
          .neq('emisor_id', user.id)
          .gt('created_at', ultimo);
        return { id: c.id, count: count || 0 };
      }));
      setConversaciones(prev => prev.map(c => {
        const x = counts.find(k => k.id === c.id);
        return { ...c, no_leidos: x?.count || 0 };
      }));
    }
  }
  useEffect(() => { cargarConversaciones(); }, [user]);

  // Cargar mensajes de la conversación activa
  async function cargarMensajes(convId: string) {
    const { data } = await supabase.from('chat_mensajes')
      .select('*').eq('conversacion_id', convId)
      .order('created_at', { ascending: true }).limit(500);
    setMensajes((data || []) as Mensaje[]);
    // marcar como leído
    if (user) {
      await supabase.from('chat_lecturas').upsert({
        conversacion_id: convId, usuario_id: user.id, ultimo_leido: new Date().toISOString(),
      });
      setConversaciones(prev => prev.map(c => c.id === convId ? { ...c, no_leidos: 0 } : c));
    }
  }
  useEffect(() => { if (activaId) cargarMensajes(activaId); }, [activaId]);

  // Realtime: nuevos mensajes
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('chat-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, (payload) => {
        const m = payload.new as Mensaje;
        if (m.conversacion_id === activaId) {
          setMensajes(prev => prev.find(x => x.id === m.id) ? prev : [...prev, m]);
          // marcar leído
          if (user) supabase.from('chat_lecturas').upsert({
            conversacion_id: m.conversacion_id, usuario_id: user.id, ultimo_leido: new Date().toISOString(),
          });
        } else {
          // refrescar lista para subir conv y aumentar contador
          cargarConversaciones();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, activaId]);

  // Filtrar conversaciones por búsqueda
  const convsFiltradas = useMemo(() => {
    if (!busqueda.trim()) return conversaciones;
    const q = busqueda.toLowerCase();
    return conversaciones.filter(c =>
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.otros || []).some(o => o.nombre.toLowerCase().includes(q))
    );
  }, [conversaciones, busqueda]);

  // Agrupar mensajes por día
  const mensajesAgrupados = useMemo(() => {
    const grupos: { fecha: string; mensajes: Mensaje[] }[] = [];
    mensajes.forEach(m => {
      const f = formatFecha(m.created_at);
      const ult = grupos[grupos.length - 1];
      if (ult && ult.fecha === f) ult.mensajes.push(m);
      else grupos.push({ fecha: f, mensajes: [m] });
    });
    return grupos;
  }, [mensajes]);

  // Crear nueva conversación 1-a-1
  async function abrirChatCon(otroId: string) {
    setDebug('1) click target=' + otroId);
    console.log('[chat] abrirChatCon target=', otroId);
    let data: any = null; let error: any = null;
    try {
      const r = await supabase.rpc('get_or_create_dm', { target_user: otroId });
      data = r.data; error = r.error;
    } catch (ex: any) {
      setDebug('EXCEPCION rpc: ' + (ex?.message || JSON.stringify(ex)));
      return;
    }
    setDebug('2) rpc data=' + JSON.stringify(data) + ' err=' + JSON.stringify(error));
    console.log('[chat] rpc result', { data, error });
    if (error) { setDebug('ERROR rpc: ' + (error.message || JSON.stringify(error))); return; }
    if (!data) { setDebug('rpc devolvio null/undefined'); return; }
    setShowNewModal(false);
    setDebug('3) recargando lista antes de activar...');
    try { await cargarConversaciones(); }
    catch (ex: any) { setDebug('lista fallo: ' + (ex?.message || JSON.stringify(ex))); }
    setActivaId(String(data));
    setShowMobileList(false);
    setDebug('4) chat abierto id=' + data);
    setTimeout(() => setDebug(''), 4000);
  }

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-6 flex bg-[#0a0a0a] relative">
      {/* DEBUG banner — build v2 */}
      {debug && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] max-w-[90%] px-4 py-2 rounded-lg bg-yellow-500 text-black text-xs font-mono shadow-2xl border border-yellow-700">
          <span className="font-bold mr-2">[DEBUG v2]</span>{debug}
          <button onClick={() => setDebug('')} className="ml-3 underline">ocultar</button>
        </div>
      )}
      {/* SIDEBAR DE CONVERSACIONES */}
      <aside className={`${showMobileList || !activaId ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 lg:w-96 border-r border-white/10 bg-[#0c0c0e]`}>
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <h2 className="text-white font-semibold flex-1 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" /> Chat
          </h2>
          <button onClick={() => setShowNewModal(true)}
            className="p-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30"
            title="Nuevo chat">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-500" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convsFiltradas.length === 0 && (
            <div className="text-center text-sm text-gray-500 px-4 py-10">
              No tenés chats todavía. Tocá <strong className="text-emerald-400">+</strong> para empezar uno.
            </div>
          )}
          {convsFiltradas.map(c => (
            <button key={c.id} onClick={() => { setActivaId(c.id); setShowMobileList(false); }}
              className={`w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-white/[0.03] border-b border-white/5 transition ${activaId === c.id ? 'bg-white/[0.05]' : ''}`}>
              <Avatar p={c.otros?.[0] || null} grupo={c.tipo === 'grupo'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white truncate">{c.nombre || 'Sin nombre'}</span>
                  {c.ultimo_at && (
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{formatHora(c.ultimo_at)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-gray-400 truncate">
                    {c.ultimo_tipo === 'imagen' && '📷 Foto'}
                    {c.ultimo_tipo === 'audio' && '🎤 Nota de voz'}
                    {c.ultimo_tipo === 'archivo' && '📎 Archivo'}
                    {c.ultimo_tipo === 'gif' && '🎞️ GIF'}
                    {(!c.ultimo_tipo || c.ultimo_tipo === 'texto') && (c.ultimo_mensaje || 'Sin mensajes')}
                  </span>
                  {!!c.no_leidos && c.no_leidos > 0 && (
                    <span className="bg-emerald-500 text-black text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center">
                      {c.no_leidos > 99 ? '99+' : c.no_leidos}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* THREAD */}
      <main className={`${!showMobileList && activaId ? 'flex' : 'hidden'} md:flex flex-col flex-1 bg-[#0a0a0a]`}>
        {!activaId ? (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div className="space-y-3">
              <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <MessageCircle className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="text-white text-lg font-semibold">Bienvenido al chat interno</div>
              <div className="text-sm text-gray-500">Seleccioná una conversación o creá una nueva.</div>
            </div>
          </div>
        ) : (
          <ChatThread
            user={user}
            perfil={perfil as any}
            conv={conversacionActiva}
            participantes={participantes[activaId] || []}
            mensajes={mensajes}
            mensajesAgrupados={mensajesAgrupados}
            onBack={() => setShowMobileList(true)}
            onSent={() => cargarConversaciones()}
          />
        )}
      </main>

      {/* MODAL: nuevo chat */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowNewModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[#0c0c0e] border border-white/10 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Nuevo chat</h3>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1">
              {perfiles.length === 0 && <div className="text-sm text-gray-500 text-center py-6">No hay otros usuarios.</div>}
              {perfiles.map(p => (
                <button key={p.id} onClick={() => abrirChatCon(p.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left">
                  <Avatar p={p} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">{p.nombre}</div>
                    <div className="text-[11px] text-gray-500 capitalize">{p.rol}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============== Avatar ===============
function Avatar({ p, grupo, size = 40 }: { p: Perfil | null; grupo?: boolean; size?: number }) {
  const cls = `flex-shrink-0 rounded-full flex items-center justify-center font-bold text-white shadow-lg`;
  const bgs = ['bg-emerald-500','bg-blue-500','bg-fuchsia-500','bg-orange-500','bg-rose-500','bg-violet-500','bg-amber-500','bg-cyan-500'];
  const seed = (p?.id || 'g').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
  const bg = bgs[seed % bgs.length];
  const ini = (p?.nombre || (grupo ? 'G' : '?')).split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (p?.avatar_url) {
    return <img src={p.avatar_url} alt={p.nombre} className={`${cls} object-cover`} style={style} />;
  }
  return <div className={`${cls} ${bg}`} style={style}>{grupo ? <Users className="w-1/2 h-1/2" /> : ini}</div>;
}

// =============== Thread ===============
function ChatThread({ user, perfil, conv, participantes, mensajes, mensajesAgrupados, onBack, onSent }: {
  user: any; perfil: any; conv: Conversacion | null; participantes: Perfil[];
  mensajes: Mensaje[]; mensajesAgrupados: { fecha: string; mensajes: Mensaje[] }[];
  onBack: () => void; onSent: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string }[]>([]);
  const [gifQuery, setGifQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // auto scroll bottom on new mensajes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length]);

  // Si todavía no cargó la conv en el array (puede pasar al recien crear), mostrar loading
  if (!conv) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Abriendo conversación...
      </div>
    );
  }

  // ----- enviar texto -----
  async function enviarTexto() {
    if (!texto.trim() || !user) return;
    setSending(true);
    const t = texto.trim();
    setTexto('');
    const { error } = await supabase.from('chat_mensajes').insert({
      conversacion_id: conv!.id,
      emisor_id: user.id,
      tipo: 'texto',
      contenido: t,
    });
    setSending(false);
    if (error) { alert('Error: ' + error.message); setTexto(t); }
    else onSent();
  }

  // ----- subir archivo / imagen -----
  async function subirArchivo(file: File, tipo: 'imagen' | 'archivo' | 'audio', extra: { duracion_seg?: number; contenido?: string } = {}) {
    if (!user) return;
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${conv!.id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, file, {
      contentType: file.type, upsert: false,
    });
    if (upErr) { alert('Error subiendo: ' + upErr.message); return; }
    const { data: pub } = supabase.storage.from('chat-media').getPublicUrl(path);
    const { error: insErr } = await supabase.from('chat_mensajes').insert({
      conversacion_id: conv!.id,
      emisor_id: user.id,
      tipo,
      contenido: extra.contenido || null,
      media_url: pub.publicUrl,
      media_nombre: file.name,
      media_mime: file.type,
      media_size: file.size,
      duracion_seg: extra.duracion_seg || null,
    });
    if (insErr) alert('Error: ' + insErr.message);
    else onSent();
  }

  // ----- grabar nota de voz -----
  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
        const dur = recSeconds;
        setRecording(false); setRecSeconds(0);
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], `voz_${Date.now()}.webm`, { type: mime });
        await subirArchivo(file, 'audio', { duracion_seg: dur });
      };
      rec.start();
      mediaRecRef.current = rec;
      setRecording(true); setRecSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecSeconds(s => {
          if (s >= 120) { stopRec(); return s; }
          return s + 1;
        });
      }, 1000);
    } catch (e: any) {
      alert('No se pudo acceder al micrófono: ' + (e?.message || 'permiso'));
    }
  }
  function stopRec() {
    const r = mediaRecRef.current;
    if (r && r.state !== 'inactive') r.stop();
  }
  function cancelRec() {
    chunksRef.current = [];
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.onstop = () => {
        mediaRecRef.current?.stream?.getTracks().forEach(t => t.stop());
      };
      mediaRecRef.current.stop();
    }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false); setRecSeconds(0);
  }

  // ----- GIFs (Giphy public beta key) -----
  async function buscarGifs(q: string) {
    const term = q.trim() || 'reaccion';
    const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(term)}&limit=24&rating=pg-13`);
    const j = await r.json();
    setGifs((j.data || []).map((g: any) => ({
      id: g.id,
      url: g.images?.original?.url || g.images?.fixed_height?.url,
      preview: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
    })));
  }
  useEffect(() => { if (showGif) buscarGifs(''); }, [showGif]);

  async function enviarGif(url: string) {
    setShowGif(false);
    if (!user) return;
    await supabase.from('chat_mensajes').insert({
      conversacion_id: conv!.id, emisor_id: user.id, tipo: 'gif', media_url: url, media_mime: 'image/gif',
    });
    onSent();
  }

  return (
    <>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/10 bg-[#0c0c0e] flex items-center gap-3">
        <button onClick={onBack} className="md:hidden p-1 text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Avatar p={conv.otros?.[0] || null} grupo={conv.tipo === 'grupo'} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{conv.nombre || 'Chat'}</div>
          <div className="text-[11px] text-gray-500">
            {conv.tipo === 'grupo' ? `${participantes.length} miembros` : (conv.otros?.[0]?.rol || 'Usuario')}
          </div>
        </div>
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4 bg-gradient-to-b from-[#0a0a0a] to-[#0c0c0e]">
        {mensajesAgrupados.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-10">Empezá la conversación 👋</div>
        )}
        {mensajesAgrupados.map((g, gi) => (
          <div key={gi} className="space-y-1.5">
            <div className="flex items-center justify-center my-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 bg-white/5 px-3 py-1 rounded-full">{g.fecha}</span>
            </div>
            {g.mensajes.map(m => {
              const propio = m.emisor_id === user.id;
              const emisor = participantes.find(p => p.id === m.emisor_id);
              return (
                <div key={m.id} className={`flex ${propio ? 'justify-end' : 'justify-start'} gap-2`}>
                  {!propio && conv.tipo === 'grupo' && <Avatar p={emisor || null} size={28} />}
                  <div className={`max-w-[78%] sm:max-w-[65%] rounded-2xl px-3 py-2 shadow-sm ${propio
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-br-sm'
                    : 'bg-white/[0.06] border border-white/10 text-white rounded-bl-sm'}`}>
                    {!propio && conv.tipo === 'grupo' && (
                      <div className="text-[11px] font-semibold text-emerald-300 mb-0.5">{emisor?.nombre || 'Usuario'}</div>
                    )}
                    {m.tipo === 'texto' && (
                      <div className="text-sm whitespace-pre-wrap break-words">{m.contenido}</div>
                    )}
                    {m.tipo === 'imagen' && m.media_url && (
                      <a href={m.media_url} target="_blank" rel="noreferrer" className="block">
                        <img src={m.media_url} alt={m.media_nombre || ''} className="rounded-lg max-w-full max-h-80 object-cover" />
                        {m.contenido && <div className="text-sm mt-1.5 whitespace-pre-wrap">{m.contenido}</div>}
                      </a>
                    )}
                    {m.tipo === 'gif' && m.media_url && (
                      <img src={m.media_url} alt="gif" className="rounded-lg max-w-[260px]" />
                    )}
                    {m.tipo === 'audio' && m.media_url && (
                      <AudioPlayer url={m.media_url} duracion={m.duracion_seg || 0} propio={propio} />
                    )}
                    {m.tipo === 'archivo' && m.media_url && (
                      <a href={m.media_url} target="_blank" rel="noreferrer"
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${propio ? 'bg-black/15' : 'bg-white/5'}`}>
                        <FileText className="w-5 h-5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{m.media_nombre || 'Archivo'}</div>
                          <div className="text-[10px] opacity-70">{bytes(m.media_size)}</div>
                        </div>
                        <Download className="w-4 h-4 opacity-70" />
                      </a>
                    )}
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${propio ? 'text-emerald-100/80 justify-end' : 'text-gray-500'}`}>
                      {formatHora(m.created_at)}
                      {propio && <CheckCheck className="w-3 h-3" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Composer */}
      {recording ? (
        <div className="border-t border-white/10 bg-[#0c0c0e] p-3 flex items-center gap-3">
          <button onClick={cancelRec} className="text-red-300 hover:text-red-200" title="Cancelar">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-white font-mono">
              {String(Math.floor(recSeconds / 60)).padStart(2,'0')}:{String(recSeconds % 60).padStart(2,'0')}
            </span>
            <span className="text-xs text-gray-400">grabando…</span>
          </div>
          <button onClick={stopRec}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-medium flex items-center gap-1.5">
            <Send className="w-4 h-4" /> Enviar
          </button>
        </div>
      ) : (
        <div className="border-t border-white/10 bg-[#0c0c0e] relative">
          {showEmoji && (
            <div className="absolute bottom-full left-2 mb-2 bg-[#1a1a1c] border border-white/10 rounded-xl p-3 shadow-xl grid grid-cols-10 gap-1 max-w-md z-10">
              {EMOJI_SET.map(e => (
                <button key={e} onClick={() => { setTexto(t => t + e); setShowEmoji(false); }}
                  className="text-xl p-1 hover:bg-white/10 rounded">{e}</button>
              ))}
            </div>
          )}
          {showGif && (
            <div className="absolute bottom-full right-2 mb-2 bg-[#1a1a1c] border border-white/10 rounded-xl p-3 shadow-xl w-[360px] max-h-[400px] overflow-y-auto z-10">
              <div className="flex items-center gap-2 mb-2">
                <input value={gifQuery} onChange={e => setGifQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && buscarGifs(gifQuery)}
                  placeholder="Buscar GIFs…"
                  className="flex-1 px-2 py-1.5 text-sm bg-white/5 border border-white/10 rounded text-white placeholder:text-gray-500" />
                <button onClick={() => buscarGifs(gifQuery)} className="text-emerald-300 text-xs px-2 py-1 hover:bg-white/5 rounded">Buscar</button>
                <button onClick={() => setShowGif(false)} className="text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {gifs.map(g => (
                  <button key={g.id} onClick={() => enviarGif(g.url)} className="hover:opacity-80 transition">
                    <img src={g.preview} alt="gif" className="w-full h-24 object-cover rounded" />
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-600 text-center mt-2">Powered by GIPHY</div>
            </div>
          )}

          <div className="p-2 flex items-end gap-1.5">
            <button onClick={() => { setShowEmoji(s => !s); setShowGif(false); }}
              className={`p-2 rounded-lg ${showEmoji ? 'text-yellow-300 bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              title="Emojis"><Smile className="w-5 h-5" /></button>
            <button onClick={() => { setShowGif(s => !s); setShowEmoji(false); }}
              className={`p-2 rounded-lg ${showGif ? 'text-fuchsia-300 bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              title="GIFs"><Sparkles className="w-5 h-5" /></button>
            <button onClick={() => imgInputRef.current?.click()}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" title="Foto">
              <ImageIcon className="w-5 h-5" />
            </button>
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await subirArchivo(f, 'imagen'); e.target.value = ''; }} />
            <button onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" title="Adjuntar">
              <Paperclip className="w-5 h-5" />
            </button>
            <input ref={fileInputRef} type="file" className="hidden"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await subirArchivo(f, 'archivo'); e.target.value = ''; }} />

            <textarea value={texto} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }}
              placeholder="Escribir mensaje…" rows={1}
              className="flex-1 max-h-32 resize-none px-3 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30" />

            {texto.trim() ? (
              <button onClick={enviarTexto} disabled={sending}
                className="p-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-50">
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={startRec}
                className="p-2.5 rounded-full bg-rose-500 hover:bg-rose-400 text-white" title="Nota de voz">
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// =============== Audio player ===============
function AudioPlayer({ url, duracion, propio }: { url: string; duracion: number; propio: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  return (
    <div className={`flex items-center gap-2 px-1 min-w-[200px]`}>
      <button onClick={() => {
        const a = audioRef.current; if (!a) return;
        if (playing) { a.pause(); setPlaying(false); }
        else { a.play(); setPlaying(true); }
      }}
        className={`p-2 rounded-full ${propio ? 'bg-black/20' : 'bg-white/10'} text-white`}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1">
        <div className={`h-1 rounded-full ${propio ? 'bg-black/20' : 'bg-white/10'} overflow-hidden`}>
          <div className={`h-full ${propio ? 'bg-white' : 'bg-emerald-400'}`} style={{ width: progress + '%' }} />
        </div>
        <div className="text-[10px] mt-1 opacity-80">
          {Math.floor(duracion / 60)}:{String(duracion % 60).padStart(2,'0')}
        </div>
      </div>
      <audio ref={audioRef} src={url} preload="metadata"
        onTimeUpdate={e => {
          const a = e.currentTarget; setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); }} />
    </div>
  );
}
