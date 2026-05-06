import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, LayoutList, LayoutGrid, Briefcase, CheckSquare, X, ChevronDown, Trash2, Upload } from 'lucide-react';
import { useCases, filterCases, emptyFilters } from '../hooks/useCases';
import CaseTable from '../components/cases/CaseTable';
import CaseKanban from '../components/cases/CaseKanban';
import CaseFilters from '../components/cases/CaseFilters';
import CaseModal from '../components/cases/CaseModal';
import CaseImportModal from '../components/cases/CaseImportModal';
import { CasoCompleto, FilterState, EstadoCaso, ESTADOS_CASO } from '../types/database';
import { exportToExcel } from '../lib/exportExcel';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';

export default function Cases() {
  const { casos, loading, refetch, removeCase, removeCasesBulk } = useCases();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...emptyFilters,
    busqueda: searchParams.get('q') || '',
  }));
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedCaso, setSelectedCaso] = useState<CasoCompleto | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => (sessionStorage.getItem('cases-view') as 'list' | 'kanban') || 'list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkEstado, setShowBulkEstado] = useState(false);

  const filteredCasos = filterCases(casos, filters);

  function mapCaseExportRow(caso: CasoCompleto) {
    return {
      'Nombre': caso.nombre_apellido,
      'Teléfono': caso.telefono || '',
      'Materia': caso.materia === 'Otro' ? caso.materia_otro || 'Otro' : caso.materia,
      'Estado': caso.estado,
      'Socio': caso.socio,
      'Interés': caso.interes || '',
      'Fuente': caso.fuente || '',
      'Captadora': caso.captadora || '',
      'Expediente': caso.expediente || '',
      'Radicado': caso.radicado || '',
      'Sistema': caso.sistema || '',
      'Personería': caso.personeria || '',
      'Prioridad': caso.prioridad || '',
      'Observaciones': caso.observaciones || '',
      'Fecha': caso.fecha || '',
      'Creado por': caso.creado_por_nombre || '',
    };
  }

  function handleToggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleToggleAll(ids: string[]) {
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }

  async function handleBulkEstado(estado: EstadoCaso) {
    setBulkLoading(true);
    setShowBulkEstado(false);
    const ids = Array.from(selected);
    await supabase.from('casos').update({ estado }).in('id', ids);
    setSelected(new Set());
    setBulkLoading(false);
    refetch();
  }

  async function handleBulkExport() {
    const selCasos = filteredCasos.filter(c => selected.has(c.id));
    const data = selCasos.map(mapCaseExportRow);
    await exportToExcel(data, `Casos_Trabajo_seleccionados_${selCasos.length}`, 'Casos Trabajo');
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminás ${ids.length} caso(s) seleccionado(s)? También se borrarán sus cuotas e ingresos vinculados. Esta acción NO se puede deshacer.`)) return;
    setBulkLoading(true);
    const r = await removeCasesBulk(ids);
    setBulkLoading(false);
    setSelected(new Set());
    showToast(`${r.ok} caso(s) eliminado(s)${r.fail ? `, ${r.fail} falló` : ''}`, r.fail ? 'error' : 'success');
  }

  async function handleDeleteAll() {
    if (filteredCasos.length === 0) return;
    const total = filteredCasos.length;
    const txt = filters.busqueda || Object.values(filters).some(v => Array.isArray(v) ? v.length : v)
      ? `los ${total} casos del filtro actual`
      : `TODOS los ${total} casos`;
    if (!window.confirm(`¿Eliminás ${txt}? También se borrarán sus cuotas e ingresos vinculados. Esta acción NO se puede deshacer.`)) return;
    const conf = window.prompt(`Para confirmar, escribí: BORRAR ${total}`);
    if (conf !== `BORRAR ${total}`) { showToast('Cancelado', 'info'); return; }
    setBulkLoading(true);
    const ids = filteredCasos.map(c => c.id);
    const r = await removeCasesBulk(ids);
    setBulkLoading(false);
    setSelected(new Set());
    showToast(`${r.ok} caso(s) eliminado(s)${r.fail ? `, ${r.fail} falló` : ''}`, r.fail ? 'error' : 'success');
  }

  async function handleExport() {
    const data = filteredCasos.map(mapCaseExportRow);
    await exportToExcel(data, 'Casos_Trabajo_CJ_NOA', 'Casos Trabajo');
  }

  function handleSelectCaso(caso: CasoCompleto) {
    setSelectedCaso(caso);
    setModalOpen(true);
  }

  function handleNewCaso() {
    setSelectedCaso(null);
    setModalOpen(true);
  }

  // Auto-open record when navigated from another module
  useEffect(() => {
    const openId = searchParams.get('openId');
    if (!openId || casos.length === 0) return;
    const target = casos.find(c => c.id === openId);
    if (target) handleSelectCaso(target);
  }, [casos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Casos - Trabajo</h1>
          <p className="text-gray-500 text-sm mt-1">
            Seguimiento operativo de casos
            {' · '}
            {filteredCasos.length} {filteredCasos.length === 1 ? 'caso' : 'casos'}
            {filters.busqueda && ` · Buscando "${filters.busqueda}"`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl border border-white/10 overflow-hidden">
            <button
              onClick={() => { setViewMode('list'); sessionStorage.setItem('cases-view', 'list'); }}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="Vista lista"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setViewMode('kanban'); sessionStorage.setItem('cases-view', 'kanban'); }}
              className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="Vista kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importar Excel</span>
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={filteredCasos.length === 0 || bulkLoading}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Eliminar todos los casos del filtro actual"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Eliminar todos</span>
          </button>
          <button onClick={handleNewCaso} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Caso</span>
          </button>
        </div>
      </div>

      {/* Bulk actions toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 glass-card border border-violet-500/20 rounded-2xl animate-fade-in">
          <CheckSquare className="w-4 h-4 text-violet-400" />
          <span className="text-sm text-white font-medium">{selected.size} seleccionados</span>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <button
                onClick={() => setShowBulkEstado(v => !v)}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 rounded-xl text-xs text-white transition-colors"
              >
                Cambiar estado <ChevronDown className="w-3 h-3" />
              </button>
              {showBulkEstado && (
                <div className="absolute right-0 top-full mt-1 w-48 glass-panel border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl z-50">
                  {ESTADOS_CASO.map(e => (
                    <button key={e} onClick={() => handleBulkEstado(e)} className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors">{e}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleBulkExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 rounded-xl text-xs text-white transition-colors">
              <Download className="w-3 h-3" /> Exportar
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-xs text-red-300 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" /> Eliminar
            </button>
            <button onClick={() => setSelected(new Set())} className="p-1.5 text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <CaseFilters filters={filters} onChange={setFilters} />

      {/* Table / Kanban */}
      {filteredCasos.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            <Briefcase className="w-8 h-8 text-gray-600" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">
              {casos.length === 0 ? 'Aún no hay casos' : 'Sin resultados'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {casos.length === 0
                ? 'Creá el primer caso para comenzar a gestionar tu estudio'
                : 'Probá ajustando los filtros de búsqueda'}
            </p>
          </div>
          {casos.length === 0 && (
            <button onClick={handleNewCaso} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              Crear primer caso
            </button>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        <CaseKanban casos={filteredCasos} onSelect={handleSelectCaso} onRefetch={refetch} />
      ) : (
        <CaseTable casos={filteredCasos} onSelect={handleSelectCaso} selected={selected} onToggle={handleToggle} onToggleAll={handleToggleAll} onDelete={removeCase} />
      )}

      {/* Modals */}
      <CaseModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedCaso(null); }}
        caso={selectedCaso}
        onSaved={refetch}
      />
      <CaseImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refetch}
      />
    </div>
  );
}
