import { utils, writeFile } from 'xlsx';

export default function ExportDashboardBtn({ data }: { data: any[] }) {
  const handleExport = () => {
    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Dashboard');
    writeFile(wb, 'dashboard_previsional.xlsx');
  };
  return (
    <button onClick={handleExport} className="btn-secondary text-xs px-3 py-1.5">
      Exportar Excel
    </button>
  );
}
