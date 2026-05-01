import { useState, useMemo, useRef } from 'react';
import {
  ArrowLeft, Briefcase, Clock, ExternalLink, Edit3, Trash2, CheckSquare,
  CalendarDays, Plus, Calculator, FileText, Download, Printer, Upload,
  Loader2, X as XIcon,
} from 'lucide-react';
import {
  ClientePrevisional, SexoCliente, TareaPrevisional, Audiencia,
  PIPELINE_LABELS, PIPELINE_COLORS, calcularSemaforo, SEMAFORO_COLORS,
  PRIORIDAD_LABELS, ESTADO_TAREA_LABELS, formatFechaLocal,
} from '../../types/previsional';
import { useAportesLaborales, useHistorialAvances, useTareasPrevisional, useAudiencias } from '../../hooks/usePrevisional';
import { useDocumentos, uploadDocumento, deleteDocumento, downloadDocumento } from '../../hooks/useDocumentos';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { exportToPdf } from '../../lib/exportPdf';
import CopilotoBtn from '../CopilotoBtn';
import AportesTable from './AportesTable';
import HistorialTimeline from './HistorialTimeline';
import TareaModal from './TareaModal';
import AudienciaModal from './AudienciaModal';
import CrossLinkPanel from '../cases/CrossLinkPanel';

interface Props {
  cliente: ClientePrevisional;
  onBack: () => void;
  onEdit: (c: ClientePrevisional) => void;
  onDelete: (id: string) => void;
}

function CalculadoraTab({ cliente, aportes }: { cliente: ClientePrevisional; aportes: any[] }) {
  const totalMesesLaborados = useMemo(() =>
    aportes.reduce((sum, a) => sum + (a.total_meses || 0), 0),
  [aportes]);

  const totalMoratoria = (cliente.meses_moratoria_24476 || 0) + (cliente.meses_moratoria_27705 || 0);
  const totalConsolidado = totalMesesLaborados + totalMoratoria;
  const mesesNecesarios = 360;
  const mesesFaltantes = Math.max(0, mesesNecesarios - totalConsolidado);
  const porcentaje = Math.min(100, Math.round((totalConsolidado / mesesNecesarios) * 100));
  const califica = totalConsolidado >= mesesNecesarios;

  const edad = cliente.fecha_nacimiento
    ? Math.floor((Date.now() - new Date(cliente.fecha_nacimiento).getTime()) / 31556952000)
    : null;
  const edadJubilatoria = cliente.sexo === 'MUJER' ? 60 : 65;
  const aptoPorEdad = edad !== null ? edad >= edadJubilatoria : false;

  return (
    <div className="space-y-4">
      <div className={`glass-card p-5 border ${califica && aptoPorEdad ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-amber-500/20 bg-amber-500/[0.02]'}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${califica && aptoPorEdad ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
            <Calculator className={`w-5 h-5 ${califica && aptoPorEdad ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <div>
            <p className={`text-base font-bold ${califica && aptoPorEdad ? 'text-emerald-400' : 'text-amber-400'}`}>
              {califica && aptoPorEdad ? '✓ Califica para jubilación' : 'No califica aún'}
            </p>
            <p className="text-[10px] text-gray-500">
              {!califica && `Faltan ${mesesFaltantes} meses (${(mesesFaltantes/12).toFixed(1)} años) de aportes`}
              {califica && !aptoPorEdad && `Aportes OK · Falta alcanzar edad jubilatoria (${edadJubilatoria} años)`}
              {califica && aptoPorEdad && 'Cumple todos los requisitos'}
            </p>
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-gray-500">Aportes consolidados</p>
            <p className="text-[10px] text-gray-500">{totalConsolidado} / {mesesNecesarios} meses ({porcentaje}%)</p>
          </div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${califica ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Meses laborados</p>
          <p className="text-2xl font-bold text-white">{totalMesesLaborados}</p>
          <p className="text-[10px] text-gray-600">≈ {(totalMesesLaborados / 12).toFixed(1)} años</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Moratoria total</p>
          <p className="text-2xl font-bold text-blue-400">{totalMoratoria}</p>
          <p className="text-[10px] text-gray-600">24476: {cliente.meses_moratoria_24476 || 0} · 27705: {cliente.meses_moratoria_27705 || 0}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Edad actual</p>
          <p className="text-2xl font-bold text-white">{edad !== null ? `${edad} años` : '—'}</p>
          <p className="text-[10px] text-gray-600">Jubilatoria: {edadJubilatoria} años {aptoPorEdad ? '✓' : ''}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Hijos</p>
          <p className="text-2xl font-bold text-white">{cliente.hijos || 0}</p>
          {cliente.sexo === 'MUJER' && (cliente.hijos || 0) > 0 && (
            <p className="text-[10px] text-emerald-600">+{Math.min(cliente.hijos, 3)} años Ley 26812</p>
          )}
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Meses faltantes</p>
          <p className={`text-2xl font-bold ${mesesFaltantes === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{mesesFaltantes}</p>
          <p className="text-[10px] text-gray-600">para 30 años de aportes</p>
        </div>
        {cliente.fecha_edad_jubilatoria && (
          <div className="glass-card p-4">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Fecha edad jubilatoria</p>
            <p className="text-sm font-bold text-white">{formatFechaLocal(cliente.fecha_edad_jubilatoria)}</p>
          </div>
        )}
      </div>
      {(cliente.resumen_informe || cliente.conclusion) && (
        <div className="glass-card p-4 space-y-3">
          {cliente.resumen_informe && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mb-1">Resumen</p>
              <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{cliente.resumen_informe}</p>
            </div>
          )}
          {cliente.conclusion && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mb-1">Conclusión</p>
              <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{cliente.conclusion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentosTab({ cliente }: { cliente: ClientePrevisional }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { documentos, loading, refetch } = useDocumentos(cliente.caso_id);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!cliente.caso_id) {
    return (
      <div className="glass-card p-10 text-center">
        <FileText className="w-10 h-10 text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-400 font-medium">Sin caso vinculado</p>
        <p className="text-xs text-gray-600 mt-1">Vinculá esta ficha a un caso desde Editar para ver documentos</p>
      </div>
    );
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocumento(cliente.caso_id!, file, user?.id);
      showToast('Documento subido', 'success');
      refetch();
    } catch (err: any) {
      showToast('Error al subir: ' + err.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{documentos.length} documento{documentos.length !== 1 ? 's' : ''}</p>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Subir documento
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : documentos.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <FileText className="w-10 h-10 text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Sin documentos adjuntos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc: any) => (
            <div key={doc.id} className="glass-card p-3 flex items-center gap-3">
              <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{doc.nombre}</p>
                <p className="text-[10px] text-gray-500">{(doc.tamano / 1024).toFixed(0)} KB · {new Date(doc.created_at).toLocaleDateString('es-AR')}</p>
              </div>
              <button onClick={() => downloadDocumento(doc)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={async () => { try { await deleteDocumento(doc); showToast('Eliminado', 'success'); refetch(); } catch (e: any) { showToast(e.message, 'error'); }}}
                className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FichaDetalle({ cliente, onBack, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<'aportes' | 'historial' | 'tareas' | 'audiencias' | 'calc' | 'docs'>('aportes');
  const [tareaOpen, setTareaOpen] = useState(false);
  const [tareaEdit, setTareaEdit] = useState<TareaPrevisional | null>(null);
  const [audienciaOpen, setAudienciaOpen] = useState(false);
  const [audienciaEdit, setAudienciaEdit] = useState<Audiencia | null>(null);

  const { aportes, loading: loadAp, add: addAporte, update: updateAporte, remove: removeAporte, removeAll: removeAllAportes } = useAportesLaborales(cliente.id);
  const { avances, loading: loadHist, add: addAvance } = useHistorialAvances(cliente.id);
  const { tareas: allTareas, upsert: upsertTarea } = useTareasPrevisional();
  const { audiencias: allAudiencias, upsert: upsertAudiencia } = useAudiencias();
  const tareas = allTareas.filter(t => t.cliente_prev_id === cliente.id);
  const audiencias = allAudiencias.filter(a => a.cliente_prev_id === cliente.id);
  const semaforo = calcularSemaforo(cliente.fecha_ultimo_contacto);
  const score = (cliente as any).score_probabilidad as number | null | undefined;

  const handleExportPdf = () => {
    exportToPdf({
      title: `Ficha Previsional — ${cliente.apellido_nombre}`,
      subtitle: `CUIL: ${cliente.cuil || '—'} · ${PIPELINE_LABELS[cliente.pipeline]} · ${new Date().toLocaleDateString('es-AR')}`,
      columns: [{ key: 'campo', label: 'Campo' }, { key: 'valor', label: 'Valor' }],
      rows: [
        { campo: 'Apellido y Nombre', valor: cliente.apellido_nombre },
        { campo: 'CUIL', valor: cliente.cuil || '—' },
        { campo: 'Teléfono', valor: cliente.telefono || '—' },
        { campo: 'Dirección', valor: cliente.direccion || '—' },
        { campo: 'Fecha de Nacimiento', valor: formatFechaLocal(cliente.fecha_nacimiento) },
        { campo: 'Sexo', valor: cliente.sexo || '—' },
        { campo: 'Hijos', valor: (cliente.hijos || 0).toString() },
        { campo: 'Pipeline', valor: PIPELINE_LABELS[cliente.pipeline] },
        { campo: 'Sub-estado', valor: cliente.sub_estado || '—' },
        { campo: 'Captado por', valor: cliente.captado_por || '—' },
        { campo: 'Situación actual', valor: cliente.situacion_actual || '—' },
        { campo: 'Cobro total', valor: `$${(cliente.cobro_total || 0).toLocaleString('es-AR')}` },
        { campo: 'Monto cobrado', valor: `$${(cliente.monto_cobrado || 0).toLocaleString('es-AR')}` },
        { campo: 'Saldo pendiente', valor: `$${(cliente.saldo_pendiente || 0).toLocaleString('es-AR')}` },
        { campo: 'Meses Moratoria 24476', valor: (cliente.meses_moratoria_24476 || 0).toString() },
        { campo: 'Meses Moratoria 27705', valor: (cliente.meses_moratoria_27705 || 0).toString() },
        { campo: 'Resumen informe', valor: cliente.resumen_informe || '—' },
        { campo: 'Conclusión', valor: cliente.conclusion || '—' },
      ],
      summary: [
        { label: 'Cobrado', value: `$${(cliente.monto_cobrado || 0).toLocaleString('es-AR')}` },
        { label: 'Pendiente', value: `$${(cliente.saldo_pendiente || 0).toLocaleString('es-AR')}` },
        { label: 'Pipeline', value: PIPELINE_LABELS[cliente.pipeline] },
      ],
    });
  };

  const TABS = [
    { id: 'aportes', icon: Briefcase, label: 'Aportes', count: aportes.length },
    { id: 'historial', icon: Clock, label: 'Historial', count: avances.length },
    { id: 'tareas', icon: CheckSquare, label: 'Tareas', badge: tareas.filter(t => t.estado !== 'completada').length },
    { id: 'audiencias', icon: CalendarDays, label: 'Audiencias', count: audiencias.length },
    { id: 'calc', icon: Calculator, label: 'Calculadora' },
    { id: 'docs', icon: FileText, label: 'Docs' },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleExportPdf} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Printer className="w-3 h-3" /> PDF
          </button>
          <CopilotoBtn
            tipo="analizar_previsional"
            label="Analizar"
            datos={{
              apellido_nombre: cliente.apellido_nombre,
              cuil: cliente.cuil,
              fecha_nacimiento: cliente.fecha_nacimiento,
              sexo: cliente.sexo,
              pipeline: cliente.pipeline,
              meses_laborados: aportes.reduce((s: number, a: any) => s + (a.total_meses || 0), 0),
              meses_moratoria_24476: cliente.meses_moratoria_24476,
              meses_moratoria_27705: cliente.meses_moratoria_27705,
              total_consolidado: aportes.reduce((s: number, a: any) => s + (a.total_meses || 0), 0) + (cliente.meses_moratoria_24476 || 0) + (cliente.meses_moratoria_27705 || 0),
              resumen_informe: cliente.resumen_informe,
              historial: avances.slice(0, 5).map((a: any) => ({ fecha: a.fecha, nota: a.nota })),
            }}
          />
          {cliente.url_drive && (
            <a href={cliente.url_drive} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" /> Drive
            </a>
          )}
          <button onClick={() => onEdit(cliente)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Edit3 className="w-3 h-3" /> Editar
          </button>
          <button onClick={() => onDelete(cliente.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Client header */}
      <div className="glass-card p-5">
        <div className="flex items-start gap-4">
          <div className={`w-3 h-3 rounded-full mt-1.5 ${SEMAFORO_COLORS[semaforo]}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white truncate">{cliente.apellido_nombre}</h2>
              {score != null && (
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-1.5 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-[9px] text-gray-500 uppercase">Score</p>
                    <p className={`text-sm font-bold ${score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{score}%</p>
                  </div>
                  <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none"
                      stroke={score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="3"
                      strokeDasharray={`${(score / 100) * 94.25} 94.25`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {cliente.cuil && <span className="text-xs text-gray-400 font-mono">{cliente.cuil}</span>}
              {cliente.telefono && <span className="text-xs text-gray-400">{cliente.telefono}</span>}
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PIPELINE_COLORS[cliente.pipeline]}`}>
                {PIPELINE_LABELS[cliente.pipeline]}
              </span>
              {cliente.sub_estado && (
                <span className="text-[10px] text-gray-500 bg-white/[0.03] px-2 py-0.5 rounded-full">{cliente.sub_estado}</span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Captado por</p>
            <p className="text-sm font-medium text-white mt-0.5">{cliente.captado_por || '—'}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Cobro Total</p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">${(cliente.cobro_total || 0).toLocaleString('es-AR')}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Cobrado</p>
            <p className="text-sm font-bold text-white mt-0.5">${(cliente.monto_cobrado || 0).toLocaleString('es-AR')}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Pendiente</p>
            <p className="text-sm font-bold text-amber-400 mt-0.5">${(cliente.saldo_pendiente || 0).toLocaleString('es-AR')}</p>
          </div>
        </div>
        {cliente.situacion_actual && (
          <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Situación Actual</p>
            <p className="text-xs text-gray-300 leading-relaxed">{cliente.situacion_actual}</p>
          </div>
        )}
        {cliente.resumen_informe && (
          <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Resumen / Informe Administrativo</p>
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{cliente.resumen_informe}</p>
          </div>
        )}
        {cliente.cobro_total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-gray-500">Progreso de cobro</p>
              <p className="text-[10px] text-gray-500">{Math.round(((cliente.monto_cobrado || 0) / cliente.cobro_total) * 100)}%</p>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${Math.min(100, ((cliente.monto_cobrado || 0) / cliente.cobro_total) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl flex-wrap">
        {TABS.map(({ id, icon: Icon, label, ...rest }) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center min-w-0 ${
              tab === id ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'
            }`}>
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{label}</span>
            {'badge' in rest && (rest as any).badge > 0 && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0">{(rest as any).badge}</span>
            )}
            {'count' in rest && (rest as any).count > 0 && (
              <span className="text-[10px] text-gray-600 flex-shrink-0">({(rest as any).count})</span>
            )}
          </button>
        ))}
      </div>

      <CrossLinkPanel clienteId={cliente.id} tipo="previsional" />

      {tab === 'aportes' && (
        <AportesTable aportes={aportes} loading={loadAp} hijos={cliente.hijos} sexo={cliente.sexo as SexoCliente} meses24476={cliente.meses_moratoria_24476 || 0} onAdd={addAporte} onRemove={removeAporte} onUpdate={updateAporte} onRemoveAll={removeAllAportes} />
      )}
      {tab === 'historial' && <HistorialTimeline avances={avances} loading={loadHist} onAdd={addAvance} />}
      {tab === 'tareas' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{tareas.length} tarea{tareas.length !== 1 ? 's' : ''}</p>
            <button onClick={() => { setTareaEdit(null); setTareaOpen(true); }} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nueva tarea
            </button>
          </div>
          {tareas.length === 0 ? (
            <div className="glass-card p-8 text-center"><CheckSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" /><p className="text-sm text-gray-500">Sin tareas</p></div>
          ) : (
            <div className="space-y-2">
              {tareas.map(tarea => {
                const vencida = tarea.fecha_limite && new Date(tarea.fecha_limite) < new Date() && tarea.estado !== 'completada';
                return (
                  <div key={tarea.id} className="glass-card p-4 flex items-start gap-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                    onClick={() => { setTareaEdit(tarea); setTareaOpen(true); }}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${tarea.estado === 'completada' ? 'bg-emerald-500' : vencida ? 'bg-red-500' : tarea.prioridad === 'alta' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${tarea.estado === 'completada' ? 'text-gray-500 line-through' : 'text-white'}`}>{tarea.titulo}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-[10px] text-gray-500">{ESTADO_TAREA_LABELS[tarea.estado]}</span>
                        {tarea.prioridad !== 'sin_prioridad' && <span className="text-[10px] text-gray-500">· {PRIORIDAD_LABELS[tarea.prioridad]}</span>}
                        {tarea.fecha_limite && <span className={`text-[10px] ${vencida ? 'text-red-400' : 'text-gray-500'}`}>· {new Date(tarea.fecha_limite).toLocaleDateString('es-AR')}</span>}
                        {tarea.responsable_nombre && <span className="text-[10px] text-gray-500">· {tarea.responsable_nombre}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'audiencias' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{audiencias.length} audiencia{audiencias.length !== 1 ? 's' : ''}</p>
            <button onClick={() => { setAudienciaEdit(null); setAudienciaOpen(true); }} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nueva audiencia
            </button>
          </div>
          {audiencias.length === 0 ? (
            <div className="glass-card p-8 text-center"><CalendarDays className="w-8 h-8 text-gray-700 mx-auto mb-2" /><p className="text-sm text-gray-500">Sin audiencias</p></div>
          ) : (
            <div className="space-y-2">
              {audiencias.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(a => (
                <div key={a.id} className="glass-card p-4 flex items-start gap-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                  onClick={() => { setAudienciaEdit(a); setAudienciaOpen(true); }}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${new Date(a.fecha) < new Date() ? 'bg-gray-600' : 'bg-purple-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      {new Date(a.fecha).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      {a.hora && <span className="text-gray-400 font-normal"> – {a.hora}</span>}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {a.tipo && <span className="text-[10px] text-gray-500">{a.tipo}</span>}
                      {a.juzgado && <span className="text-[10px] text-gray-500">· {a.juzgado}</span>}
                      {a.abogado_cargo && <span className="text-[10px] text-gray-500">· {a.abogado_cargo}</span>}
                    </div>
                    {a.notas && <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">{a.notas}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'calc' && <CalculadoraTab cliente={cliente} aportes={aportes} />}
      {tab === 'docs' && <DocumentosTab cliente={cliente} />}

      <TareaModal open={tareaOpen} onClose={() => { setTareaOpen(false); setTareaEdit(null); }} tarea={tareaEdit} clientes={[cliente]}
        onSave={async (data, id) => { const ok = await upsertTarea({ ...data, cliente_prev_id: cliente.id }, id); if (ok) setTareaOpen(false); return ok; }} />
      <AudienciaModal open={audienciaOpen} onClose={() => { setAudienciaOpen(false); setAudienciaEdit(null); }} audiencia={audienciaEdit} clientes={[cliente]}
        onSave={async (data, id) => { const ok = await upsertAudiencia({ ...data, cliente_prev_id: cliente.id }, id); if (ok) setAudienciaOpen(false); return ok; }} />
    </div>
  );
}
