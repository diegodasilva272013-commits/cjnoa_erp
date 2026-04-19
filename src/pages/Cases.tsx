import { useState } from 'react';
import { Plus, Download, LayoutList, LayoutGrid } from 'lucide-react';
import { useCases, filterCases, emptyFilters } from '../hooks/useCases';
import CaseTable from '../components/cases/CaseTable';
import CaseKanban from '../components/cases/CaseKanban';
import CaseFilters from '../components/cases/CaseFilters';
import CaseModal from '../components/cases/CaseModal';
import PagoModal from '../components/finance/PagoModal';
import { CasoCompleto, FilterState } from '../types/database';
import { exportToExcel } from '../lib/exportExcel';

export default function Cases() {
  const { casos, loading, refetch } = useCases();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCaso, setSelectedCaso] = useState<CasoCompleto | null>(null);
  const [pagoModalOpen, setPagoModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => (sessionStorage.getItem('cases-view') as 'list' | 'kanban') || 'list');

  const filteredCasos = filterCases(casos, filters);

  function handleExport() {
    const data = filteredCasos.map(c => ({
      'Nombre': c.nombre_apellido,
      'Teléfono': c.telefono || '',
      'Materia': c.materia === 'Otro' ? c.materia_otro || 'Otro' : c.materia,
      'Estado': c.estado,
      'Socio': c.socio,
      'Interés': c.interes || '',
      'Fuente': c.fuente || '',
      'Captadora': c.captadora || '',
      'Honorarios': c.honorarios_monto,
      'Modalidad Pago': c.modalidad_pago || '',
      'Total Cobrado': c.total_cobrado,
      'Saldo Pendiente': c.saldo_pendiente,
      'Observaciones': c.observaciones || '',
      'Fecha': c.fecha || '',
      'Creado por': c.creado_por_nombre || '',
    }));
    exportToExcel(data, 'Casos_CJ_NOA', 'Casos');
  }

  function handleSelectCaso(caso: CasoCompleto) {
    setSelectedCaso(caso);
    setModalOpen(true);
  }

  function handleNewCaso() {
    setSelectedCaso(null);
    setModalOpen(true);
  }

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
          <h1 className="text-xl sm:text-2xl font-bold text-white">Casos</h1>
          <p className="text-gray-500 text-sm mt-1">
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
          <button onClick={handleNewCaso} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Caso</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <CaseFilters filters={filters} onChange={setFilters} />

      {/* Table / Kanban */}
      {viewMode === 'kanban' ? (
        <CaseKanban casos={filteredCasos} onSelect={handleSelectCaso} />
      ) : (
        <CaseTable casos={filteredCasos} onSelect={handleSelectCaso} />
      )}

      {/* Modals */}
      <CaseModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedCaso(null); }}
        caso={selectedCaso}
        onSaved={refetch}
      />
    </div>
  );
}
