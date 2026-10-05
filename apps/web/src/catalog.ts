import type { CatalogCard } from '@aikatsu/domain';

/** User-provided screenshots verify these display labels only; no code mapping. */
export const SAMPLE_CATALOG: readonly CatalogCard[] = [
  { id: 'e1-01', number: 'E1-01', name: 'オーロラキスキャミソール', rarity: 'PR', verificationStatus: 'user-screenshot' },
  { id: 'e1-02', number: 'E1-02', name: 'オーロラキスドレープスカート', rarity: 'PR', verificationStatus: 'user-screenshot' },
];
