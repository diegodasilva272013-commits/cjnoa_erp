/** Lightweight PDF export using browser print dialog. No external deps. */

interface PdfRow {
  [key: string]: string | number;
}

interface PdfOptions {
  title: string;
  subtitle?: string;
  columns: { key: string; label: string; align?: 'left' | 'right' | 'center' }[];
  rows: PdfRow[];
  summary?: { label: string; value: string }[];
}

export function exportToPdf({ title, subtitle, columns, rows, summary }: PdfOptions) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const formatCell = (val: unknown, align?: string) => {
    if (val == null) return '';
    return String(val);
  };

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; padding: 40px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #1a1a2e; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; }
  tr:last-child td { border-bottom: none; }
  .right { text-align: right; }
  .center { text-align: center; }
  .summary { margin-top: 24px; display: flex; gap: 24px; flex-wrap: wrap; }
  .summary-item { padding: 12px 16px; background: #f8f9fa; border-radius: 8px; }
  .summary-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .footer { margin-top: 32px; font-size: 9px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
  @media print {
    body { padding: 20px; }
    @page { margin: 15mm; }
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">${subtitle || `Generado el ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}`}</div>
  
  ${summary ? `<div class="summary">${summary.map(s => `<div class="summary-item"><div class="summary-label">${s.label}</div><div class="summary-value">${s.value}</div></div>`).join('')}</div><br/>` : ''}

  <table>
    <thead>
      <tr>${columns.map(c => `<th class="${c.align || 'left'}">${c.label}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.map(row => `<tr>${columns.map(c => `<td class="${c.align || 'left'}">${formatCell(row[c.key], c.align)}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>

  <div class="footer">CJ NOA — Sistema de Gestión</div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}
