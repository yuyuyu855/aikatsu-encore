import type { CatalogCard } from '@aikatsu/domain';
import cards from '../data/cards.json';
import manifest from '../data/manifest.json';
import labels from '../data/labels.json';

export interface CatalogSet {
  id: string;
  name: string;
  sourceSeriesId: string;
  sourceUrl: string;
  fetchedAt: string;
  sourceStatus: 'available' | 'unpublished';
  coverageStatus: 'unimported' | 'partial' | 'complete';
  cardIds: string[];
  count: number;
}

export interface CatalogEntry extends CatalogCard {
  setId: string;
  sourceKey: string;
  metadata: {
    name: string | null;
    part: string | null;
    category: string | null;
    brand: string | null;
    availabilityText: string | null;
  };
  printedMetadata?: CardLabel;
}

export interface CardLabel {
  name: string | null;
  part?: string | null;
  category?: string | null;
  brand?: string | null;
  appealPoints?: number | null;
  source: { kind: 'official-card-image'; method: 'visual-transcription'; url: string; sha256: string; acquiredAt: string };
  verifiedFields: string[];
  uncertainFields: string[];
  note?: string;
}

const labelMap = labels as Record<string, CardLabel>;
/** Never remove IDs from this registry when a card disappears from the public list. */
export const CATALOG_CARDS: readonly CatalogEntry[] = (cards as CatalogEntry[]).map((card) => {
  const label = labelMap[card.id];
  return label ? { ...card, name: label.name ?? card.name, part: label.part ?? card.part,
    category: label.category ?? card.category, brand: label.brand ?? card.brand,
    appealPoints: label.appealPoints ?? card.appealPoints, printedMetadata: label } : card;
});
export const CATALOG_SETS: readonly CatalogSet[] = manifest.sets as CatalogSet[];
export const CATALOG_RELEASE = manifest.release;

export function getSetCards(setId: string): readonly CatalogEntry[] {
  const ids = new Set(CATALOG_SETS.find((set) => set.id === setId)?.cardIds ?? []);
  return CATALOG_CARDS.filter((card) => ids.has(card.id) && card.status !== 'retired');
}
