import { useEffect, useRef, useState } from 'react';
import {
  Upload, Trash2, Download, Loader2, FileText, Image as ImageIcon,
  Music, Video, File as FileIcon, X, Eye,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useCasoGeneralDocs, uploadCasoGeneralDoc, deleteCasoGeneralDoc,
  downloadCasoGeneralDoc, getCasoGeneralDocSignedUrl, CasoGeneralDoc,
} from '../../hooks/useCasoGeneralDocs';

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function kindOf(mime: string, nombre: string): 'image' | 'pdf' | 'audio' | 'video' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/i.test(nombre)) return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'other';
}

function IconFor({ kind }: { kind: ReturnType<typeof kindOf> }) {
  const cls = 'w-5 h-5';
  if (kind === 'image') return <ImageIcon className={`${cls} text-violet-300`} />;
  if (kind === 'pdf')   return <FileText  className={`${cls} text-rose-300`} />;
  if (kind === 'audio') return <Music     className={`${cls} text-amber-300`} />;
  if (kind === 'video') return <Video     className={`${cls} text-sky-300`} />;
  return <FileIcon className={`${cls} text-gray-400`} />;
}

function Thumb({ doc }: { doc: CasoGeneralDoc }) {
  const [url, setUrl] = useState<string | null>(null);
  const kind = kindOf(doc.mime, doc.nombre);
  useEffect(() => {
    let alive = true;
    if (kind === 'image') {
      getCasoGeneralDocSignedUrl(doc.storage_path).then(u => { if (alive) setUrl(u); });
    }
    return () => { alive = false; };
  }, [doc.storage_path, kind]);
  if (kind === 'image' && url) {
    return <img src={url} alt={doc.nombre} className="w-full h-28 object-cover rounded-lg" />;
  }
  return (
    <div className="w-full h-28 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
      <IconFor kind={kind} />
    </div>
  );
}

function Preview({ doc, onClose }: { doc: CasoGeneralDoc; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const kind = kindOf(doc.mime, doc.nombre);
  useEffect(() => {
    let alive = true;
    getCasoGeneralDocSignedUrl(doc.storage_path).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [doc.storage_path]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <IconFor kind={kind} />
            <span className="text-sm text-white truncate">{doc.nombre}</span>
            <span className="text-[10px] text-gray-500">{fmtSize(doc.tamano)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadCasoGeneralDoc(doc)}
              className="px-2 py-1.5 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Descargar
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-black flex items-center justify-center min-h-[40vh]">
          {!url ? (
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          ) : kind === 'image' ? (
            <img src={url} alt={doc.nombre} className="max-w-full max-h-[85vh] object-contain" />
          ) : kind === 'pdf' ? (
            <iframe src={url} title={doc.nombre} className="w-full h-[85vh] bg-white" />
          ) : kind === 'audio' ? (
            <audio src={url} controls className="w-full max-w-xl" />
          ) : kind === 'video' ? (
            <video src={url} controls className="max-w-full max-h-[85vh]" />
          ) : (
            <div className="text-center p-8 text-gray-400 text-sm">
              <p>No hay vista previa para este tipo de archivo.</p>
              <button onClick={() => downloadCasoGeneralDoc(doc)} className="mt-3 btn-primary text-xs">Descargar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArchivosCasoGeneralPanel({ casoId }: { casoId: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { docs, loading } = useCasoGeneralDocs(casoId);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<CasoGeneralDoc | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    let okCount = 0;
    let firstErr: string | undefined;
    for (const f of arr) {
      const r = await uploadCasoGeneralDoc(casoId, f, user?.id || null);
      if (r.ok) okCount++;
      else if (!firstErr) firstErr = r.error;
    }
    setUploading(false);
    if (okCount > 0) showToast(`${okCount} archivo${okCount === 1 ? '' : 's'} subido${okCount === 1 ? '' : 's'}`, 'success');
    if (firstErr) showToast(firstErr, 'error');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleDelete(doc: CasoGeneralDoc) {
    const r = await deleteCasoGeneralDoc(doc);
    if (r.ok) { showToast('Archivo eliminado', 'success'); setConfirmDel(null); }
    else showToast(r.error || 'Error al eliminar', 'error');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileIcon className="w-4 h-4 text-violet-300" />
          Archivos del caso
          <span className="text-gray-500 font-normal">({docs.length})</span>
        </h3>
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/30 flex items-center gap-1.5 disabled:opacity-50">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Subir archivo(s)
        </button>
        <input ref={inputRef} type="file" multiple className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-4 text-center text-xs transition-colors ${
          dragOver ? 'border-violet-400 bg-violet-500/10 text-violet-200' : 'border-white/10 text-gray-500 hover:border-white/20'
        }`}
      >
        Arrastrá fotos, PDFs, audios, videos o cualquier archivo aquí.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-gray-600 italic text-center py-4">Aún no hay archivos para este caso.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {docs.map(d => {
            const kind = kindOf(d.mime, d.nombre);
            return (
              <div key={d.id} className="group rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden hover:border-violet-500/30 transition-colors">
                <button onClick={() => setPreview(d)} className="block w-full">
                  <Thumb doc={d} />
                </button>
                <div className="px-2 py-1.5 space-y-0.5">
                  <p className="text-[11px] text-white truncate" title={d.nombre}>{d.nombre}</p>
                  <p className="text-[9px] text-gray-500">{fmtSize(d.tamano)} · {kind}</p>
                  <div className="flex items-center justify-end gap-1 pt-1">
                    <button onClick={() => setPreview(d)} title="Ver"
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-violet-300">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => downloadCasoGeneralDoc(d)} title="Descargar"
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-emerald-300">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {confirmDel === d.id ? (
                      <>
                        <button onClick={() => handleDelete(d)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Sí</button>
                        <button onClick={() => setConfirmDel(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300">No</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDel(d.id)} title="Eliminar"
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && <Preview doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
