let xlsxLoader: Promise<typeof import('xlsx')> | null = null;

function loadXlsx() {
  if (!xlsxLoader) {
    xlsxLoader = import('xlsx');
  }

  return xlsxLoader;
}

export async function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName = 'Datos') {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
