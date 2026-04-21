import { SOCIOS, type Socio } from '../types/database';

function normalizeSocioToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const SOCIO_TOKENS = SOCIOS.map(socio => ({
  socio,
  token: normalizeSocioToken(socio),
}));

export function resolveOperationalSocio(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const normalized = normalizeSocioToken(text);
  if (!normalized) return null;
  if (normalized === 'cjnoa') return 'CJ NOA';

  const exactMatch = SOCIO_TOKENS.find(item => item.token === normalized);
  if (exactMatch) return exactMatch.socio;

  const partialMatch = SOCIO_TOKENS.find(item => normalized.includes(item.token) || item.token.includes(normalized));
  if (partialMatch) return partialMatch.socio;

  return text;
}

export function sameOperationalSocio(left: string | null | undefined, right: string | null | undefined) {
  const resolvedLeft = resolveOperationalSocio(left);
  const resolvedRight = resolveOperationalSocio(right);

  if (!resolvedLeft || !resolvedRight) return false;
  return resolvedLeft === resolvedRight;
}

/**
 * Parses a `Distribucion: Socio Monto, Socio Monto, ...` segment from an ingreso `notas` field.
 * Returns the per-socio amounts, or null if no distribution segment is found.
 *
 * The monthly Excel imports historically emitted a single ingreso row with `socio_cobro = NULL`
 * and the per-socio split serialized in `notas`. This parser lets analytics reconstruct the
 * attribution from legacy data without requiring a database migration.
 */
export function parseDistributionShares(notas: string | null | undefined): Array<{ socio: string; amount: number }> | null {
  if (!notas) return null;

  const segment = notas
    .split('|')
    .map(part => part.trim())
    .find(part => /^distribuci[oó]n\s*:/i.test(part));

  if (!segment) return null;

  const body = segment.replace(/^distribuci[oó]n\s*:/i, '').trim();
  if (!body) return null;

  const shares = body
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const match = item.match(/^(.+?)\s+([0-9][0-9.,]*)$/);
      if (!match) return null;

      const socioRaw = match[1].trim();
      const amountRaw = match[2].replace(/\./g, '').replace(',', '.');
      const amount = Number(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) return null;

      const socio = resolveOperationalSocio(socioRaw);
      if (!socio) return null;

      return { socio, amount };
    })
    .filter((item): item is { socio: string; amount: number } => item !== null);

  return shares.length > 0 ? shares : null;
}

export interface OperationalSocioShare {
  socio: string;
  ratio: number;
}

/**
 * Resolves the operational socios that should receive credit for a given ingreso.
 * Prefers the canonical `socio_cobro` field; falls back to the legacy `Distribucion:` note.
 * Returns an empty array if no attribution can be determined.
 */
export function getIngresoSocioShares(ingreso: { socio_cobro: string | null; notas: string | null }): OperationalSocioShare[] {
  const direct = resolveOperationalSocio(ingreso.socio_cobro);
  if (direct) return [{ socio: direct, ratio: 1 }];

  const distribution = parseDistributionShares(ingreso.notas);
  if (!distribution) return [];

  const total = distribution.reduce((sum, share) => sum + share.amount, 0);
  if (total <= 0) return [];

  return distribution.map(share => ({ socio: share.socio, ratio: share.amount / total }));
}

export function sortOperationalSocios(values: Array<string | null | undefined>) {
  const deduped = new Set<string>();

  values.forEach(value => {
    const resolved = resolveOperationalSocio(value);
    if (resolved) deduped.add(resolved);
  });

  return [...deduped].sort((left, right) => {
    const leftIndex = SOCIOS.indexOf(left as Socio);
    const rightIndex = SOCIOS.indexOf(right as Socio);

    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.localeCompare(right, 'es');
  });
}