import { useState } from 'react';
import { LayoutGrid, List, Plus, Upload } from 'lucide-react';
import { ClientePrevisional } from '../types/previsional';
import { useClientesPrevisional } from '../hooks/usePrevisional';
import FichasList from '../components/previsional/FichasList';
import FichaModal from '../components/previsional/FichaModal';
import FichaDetalle from '../components/previsional/FichaDetalle';
import PrevisionalKanban from '../components/previsional/PrevisionalKanban';
import BulkImportPrevisionalModal from '../components/previsional/BulkImportPrevisionalModal';

export default function FichasClientes() {
  const { clientes, upsert, remove, refetch } = useClientesPrevisional();
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<ClientePrevisional | null>(null);
  const [detalle, setDetalle] = useState<ClientePrevisional | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'kanban'>('list');

  const handleNew = () => {
    setSelected(null);
    setModalOpen(true);
  };

  const handleEdit = (c: ClientePrevisional) => {
    setSelected(c);
    setModalOpen(true);
  };

  const handleView = (c: ClientePrevisional) => {
    setDetalle(c);
  };

  const handleSave = async (data: Partial<ClientePrevisional>, id?: string) => {
    return upsert(data, id);
  };

  const handleDelete = async (id: string) => {
    if (confirmDelete === id) {
      await remove(id);
      setConfirmDelete(null);
      if (detalle?.id === id) setDetalle(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  // Si hay un detalle seleccionado, mantenerlo sincronizado
  const detalleActualizado = detalle ? clientes.find(c => c.id === detalle.id) || detalle : null;

  if (detalleActualizado) {
    return (
      <>
        <FichaDetalle
          cliente={detalleActualizado}
          onBack={() => setDetalle(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
        <FichaModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          cliente={selected}
          onSave={handleSave}
        />
      </>
    );
  }

  return (
    <>
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06]">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
          >
            <List className="w-3.5 h-3.5" /> Lista
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'kanban' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Kanban
          </button>
        </div>
        {view === 'kanban' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setImportOpen(true)} className="text-xs px-3 py-1.5 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
              <Upload className="w-3.5 h-3.5" /> Importar Excel
            </button>
            <button onClick={handleNew} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nueva ficha
            </button>
          </div>
        )}
        {view === 'list' && (
          <button onClick={() => setImportOpen(true)} className="text-xs px-3 py-1.5 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
            <Upload className="w-3.5 h-3.5" /> Importar Excel
          </button>
        )}
      </div>

      {view === 'list' ? (
        <FichasList
          clientes={clientes}
          onNew={handleNew}
          onSelect={handleView}
          onRefetch={refetch}
        />
      ) : clientes.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <LayoutGrid className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-white font-semibold mb-1">Sin fichas aún</p>
          <p className="text-sm text-gray-500 mb-4">Creá la primera ficha de cliente previsional</p>
          <button onClick={handleNew} className="btn-primary text-sm px-4 py-2">
            <Plus className="w-4 h-4 inline mr-1" /> Crear primera ficha
          </button>
        </div>
      ) : (
        <PrevisionalKanban clientes={clientes} onSelect={handleView} onRefetch={refetch} />
      )}

      <FichaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cliente={selected}
        onSave={handleSave}
      />

      <BulkImportPrevisionalModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refetch}
      />
    </>
  );
}
