import { supabase } from './supabase';

/**
 * Imprime un blob (PDF, imagen) abriendo una ventana oculta y disparando print().
 */
export async function printBlob(blob: Blob, nombre = 'documento') {
  const url = URL.createObjectURL(blob);
  const isPdf = blob.type === 'application/pdf' || nombre.toLowerCase().endsWith('.pdf');
  const isImg = blob.type.startsWith('image/');

  if (isPdf) {
    // PDF: iframe oculto, esperar carga, llamar print
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // fallback: abrir en nueva pestaña
        window.open(url, '_blank');
      }
      // cleanup tras un tiempo razonable (el dialog ya se mostró)
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60000);
    };
    return;
  }

  if (isImg) {
    const w = window.open('', '_blank');
    if (!w) { URL.revokeObjectURL(url); return; }
    w.document.write(`<!doctype html><html><head><title>${nombre}</title>
      <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}
      img{max-width:100%;max-height:100vh}@media print{body{min-height:auto}img{max-height:none}}</style>
      </head><body><img src="${url}" onload="setTimeout(()=>{window.focus();window.print();},200)"/></body></html>`);
    w.document.close();
    return;
  }

  // Otros formatos: Word, Excel, etc → no se puede imprimir directo desde el browser.
  // Abrimos para que el usuario vea/descargue.
  window.open(url, '_blank');
}

/**
 * Descarga e imprime un documento que está en Supabase Storage.
 */
export async function printStorageFile(bucket: string, path: string, nombre?: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw error || new Error('No se pudo descargar');
  await printBlob(data, nombre || path.split('/').pop() || 'documento');
}

/**
 * Imprime el contenido de un nodo HTML (un reporte) en una ventana nueva
 * con estilos heredados.
 */
export function printElement(el: HTMLElement, titulo = 'Reporte') {
  const w = window.open('', '_blank', 'width=1024,height=768');
  if (!w) return;
  // Copiar todos los <link rel=stylesheet> y <style> del documento actual
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(n => n.outerHTML)
    .join('\n');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
    ${styles}
    <style>
      body { background: #fff !important; color: #111 !important; padding: 24px; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      * { color: #111 !important; }
      .text-white, .text-zinc-300, .text-zinc-400, .text-emerald-200, .text-rose-200, .text-sky-200, .text-violet-200, .text-amber-200 { color: #111 !important; }
      .bg-white\\/\\[0\\.02\\], .bg-emerald-500\\/10, .bg-rose-500\\/10, .bg-sky-500\\/10, .bg-violet-500\\/10, .bg-amber-500\\/10, .bg-emerald-500\\/5, .bg-rose-500\\/5 { background: #fafafa !important; border: 1px solid #ddd !important; }
      .border-white\\/10, .border-white\\/5, .border-emerald-500\\/30, .border-rose-500\\/30, .border-sky-500\\/30, .border-violet-500\\/30, .border-amber-500\\/30 { border-color: #ddd !important; }
      .max-h-80, .max-h-96 { max-height: none !important; overflow: visible !important; }
      .overflow-auto, .overflow-y-auto, .overflow-x-auto { overflow: visible !important; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; }
      thead { background: #f3f3f3 !important; }
      h1, h2, h3 { color: #000 !important; }
      @page { size: A4; margin: 14mm; }
    </style>
    </head><body>
    <div id="print-root">${el.outerHTML}</div>
    <script>
      window.onload = function() {
        setTimeout(function() { window.focus(); window.print(); }, 300);
        window.onafterprint = function() { setTimeout(function(){ window.close(); }, 100); };
      };
    </script>
    </body></html>`);
  w.document.close();
}
