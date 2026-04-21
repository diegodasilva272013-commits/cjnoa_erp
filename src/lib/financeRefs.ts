export type IncomeReference =
  | { type: 'cuota'; id: string }
  | { type: 'pago_unico'; caseId: string };

const REF_PREFIX = '[[CJNOA_REF:';
const REF_SUFFIX = ']]';

function serializeIncomeReference(reference: IncomeReference) {
  return reference.type === 'cuota'
    ? `cuota:${reference.id}`
    : `pago_unico:${reference.caseId}`;
}

function deserializeIncomeReference(rawValue: string): IncomeReference | null {
  if (rawValue.startsWith('cuota:')) {
    const id = rawValue.slice('cuota:'.length).trim();
    return id ? { type: 'cuota', id } : null;
  }

  if (rawValue.startsWith('pago_unico:')) {
    const caseId = rawValue.slice('pago_unico:'.length).trim();
    return caseId ? { type: 'pago_unico', caseId } : null;
  }

  return null;
}

export function withIncomeReference(reference: IncomeReference, publicNote?: string | null) {
  const metadata = `${REF_PREFIX}${serializeIncomeReference(reference)}${REF_SUFFIX}`;
  const cleanNote = publicNote?.trim();
  return cleanNote ? `${metadata} ${cleanNote}` : metadata;
}

export function parseIncomeReference(note?: string | null) {
  if (!note) {
    return { reference: null as IncomeReference | null, publicNote: null as string | null };
  }

  const trimmed = note.trim();
  if (!trimmed.startsWith(REF_PREFIX)) {
    return { reference: null as IncomeReference | null, publicNote: trimmed || null };
  }

  const metadataEnd = trimmed.indexOf(REF_SUFFIX);
  if (metadataEnd === -1) {
    return { reference: null as IncomeReference | null, publicNote: trimmed || null };
  }

  const reference = deserializeIncomeReference(trimmed.slice(REF_PREFIX.length, metadataEnd));
  const publicNote = trimmed.slice(metadataEnd + REF_SUFFIX.length).trim() || null;

  return { reference, publicNote };
}

export function stripIncomeReference(note?: string | null) {
  return parseIncomeReference(note).publicNote;
}

export function matchesIncomeReference(note: string | null | undefined, reference: IncomeReference) {
  const parsed = parseIncomeReference(note).reference;
  return parsed ? serializeIncomeReference(parsed) === serializeIncomeReference(reference) : false;
}