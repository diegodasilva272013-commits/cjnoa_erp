// Validador de URLs de Google Drive / Docs / Sheets

const DRIVE_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'sheets.google.com',
  'forms.google.com',
  'slides.google.com',
];

export interface DriveUrlCheck {
  valid: boolean;
  warning?: string;
  error?: string;
  normalized?: string;
}

/**
 * Valida que una URL sea de Google Drive / Docs y devuelve
 * info útil para UX (warning si falta permiso público aparente).
 */
export function validateDriveUrl(raw: string): DriveUrlCheck {
  const s = (raw || '').trim();
  if (!s) return { valid: true }; // vacío = OK (campo opcional)
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { valid: false, error: 'URL inválida. Debe empezar con https://' };
  }
  if (url.protocol !== 'https:') {
    return { valid: false, error: 'Usá una URL https://' };
  }
  const host = url.hostname.toLowerCase();
  const isDrive = DRIVE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  if (!isDrive) {
    return {
      valid: false,
      error: 'No parece un link de Google Drive/Docs. Usá drive.google.com o docs.google.com',
    };
  }
  // tip: si falta "usp=sharing" o similar, avisar que tal vez no esté compartida
  const path = url.pathname;
  const looksLikeFolder = path.includes('/folders/');
  const looksLikeFile = path.includes('/file/') || path.includes('/document/') ||
    path.includes('/spreadsheets/') || path.includes('/presentation/');
  if (!looksLikeFolder && !looksLikeFile) {
    return {
      valid: true,
      warning: 'La URL parece de Google pero no identifica una carpeta o archivo claramente.',
      normalized: url.toString(),
    };
  }
  return { valid: true, normalized: url.toString() };
}
