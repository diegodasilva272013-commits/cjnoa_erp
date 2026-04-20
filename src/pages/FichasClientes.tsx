import { useState } from 'react';
import { ClientePrevisional } from '../types/previsional';
import { useClientesPrevisional } from '../hooks/usePrevisional';
import FichasList from '../components/previsional/FichasList';
import FichaModal from '../components/previsional/FichaModal';
import FichaDetalle from '../components/previsional/FichaDetalle';

export default function FichasClientes() {
  const { clientes, upsert, remove } = useClientesPrevisional();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<ClientePrevisional | null>(null);
  const [detalle, setDetalle] = useState<ClientePrevisional | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      <FichasList
        clientes={clientes}
        onNew={handleNew}
        onSelect={handleView}
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
