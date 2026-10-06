import type { Inventory } from '@aikatsu/domain';
import data from '../data/coordinates.json';

export interface Coordinate {
  id: string;
  name: string;
  setId: string;
  variant: 'normal' | 'parallel';
  requiredCardIds: readonly string[];
  optionalCardIds: readonly string[];
  completionRule: string;
  evidence: {
    kind: 'official-card-back';
    method: 'visual-transcription';
    url: string;
    sha256: string;
    acquiredAt: string;
    printedMemberNames: readonly string[];
  };
  note: string;
}

export const CATALOG_COORDINATES: readonly Coordinate[] = data.coordinates as Coordinate[];
export const COORDINATE_COVERAGE = { status: data.coverage, limitations: data.limitations } as const;

export function getSetCoordinates(setId: string): readonly Coordinate[] {
  return setId === 'all' ? CATALOG_COORDINATES : CATALOG_COORDINATES.filter((coordinate) => coordinate.setId === setId);
}

/** Ownership is independent of offers/wants and the quantities of other variants. */
export function coordinateProgress(coordinate: Pick<Coordinate, 'requiredCardIds'>, inventory: readonly Inventory[]) {
  const ownedIds = new Set(inventory.filter((entry) => entry.owned > 0).map((entry) => entry.cardId));
  const requiredIds = [...new Set(coordinate.requiredCardIds)];
  const missingIds = requiredIds.filter((id) => !ownedIds.has(id));
  return { total: requiredIds.length, owned: requiredIds.length - missingIds.length, missingIds,
    complete: requiredIds.length > 0 && missingIds.length === 0 };
}
