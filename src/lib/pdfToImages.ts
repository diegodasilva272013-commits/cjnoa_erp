// Convierte cada página de un PDF en una imagen JPEG (dataURL), en el navegador.
// Se usa para que "Subir turnos con IA" procese PDFs con exactamente el mismo
// pipeline de IA (visión, /api/google/extract-turnos) que ya funciona para
// fotos/capturas — en vez de depender de un endpoint aparte (/api/extract-pdf)
// que requiere una API key de Anthropic que no está configurada.
const MAX_PAGINAS = 10; // tope de seguridad para no ahogar la IA con PDFs enormes
// JPEG en vez de PNG: el body del endpoint /api/google/extract-turnos tiene un
// límite de tamaño (Vercel serverless function, ~4.5MB). Un PDF de varias
// páginas en PNG a 2x escala puede superarlo fácil; JPEG comprime ~10x mejor
// para este tipo de documento (texto escaneado) sin perder legibilidad.
const CALIDAD_JPEG = 0.85;

/**
 * Recibe un PDF como dataURL (data:application/pdf;base64,...) y devuelve
 * un array de dataURLs JPEG, uno por página (hasta MAX_PAGINAS).
 * pdfjs-dist se importa dinámicamente: es una librería pesada (~350kb) que
 * solo debe bajar el navegador cuando alguien efectivamente sube un PDF,
 * no en cada visita al Calendario.
 */
export async function pdfDataUrlAImagenes(pdfDataUrl: string): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist');
  const { default: pdfjsWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const base64 = pdfDataUrl.split(',')[1] || pdfDataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const totalPaginas = Math.min(pdf.numPages, MAX_PAGINAS);
  const imagenes: string[] = [];

  for (let numPagina = 1; numPagina <= totalPaginas; numPagina++) {
    const pagina = await pdf.getPage(numPagina);
    // Escala 2x para que el texto sea legible por la IA (mejora precisión de OCR/visión)
    const viewport = pagina.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    // Fondo blanco: los PDF pueden tener transparencia y el JPEG no la soporta (queda negro si no se rellena)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    imagenes.push(canvas.toDataURL('image/jpeg', CALIDAD_JPEG));
  }

  return imagenes;
}
