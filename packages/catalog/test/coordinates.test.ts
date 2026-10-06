import { describe, expect, it } from 'vitest';
import type { Inventory } from '@aikatsu/domain';
import { CATALOG_CARDS } from '../src/index';
import { CATALOG_COORDINATES, coordinateProgress, getSetCoordinates } from '../src/coordinates';
import images from '../data/images.json';

const owned = (cardId: string, quantity = 1): Inventory => ({ cardId, owned: quantity, offered: 0, wanted: false });

describe('curated coordinate completion', () => {
  it('pins every group to an official back and exact verified member names', () => {
    const known = new Map(CATALOG_CARDS.map((card) => [card.id, card]));
    expect(new Set(CATALOG_COORDINATES.map((group) => group.id)).size).toBe(CATALOG_COORDINATES.length);
    for (const group of CATALOG_COORDINATES) {
      const members = [...group.requiredCardIds, ...group.optionalCardIds];
      expect(new Set(members).size).toBe(members.length);
      expect(group.evidence.printedMemberNames).toEqual(members.map((id) => known.get(id)?.name));
      expect(images.find((image) => image.sourceUrl === group.evidence.url && image.side === 'back')?.sha256).toBe(group.evidence.sha256);
    }
  });
  it('counts unique required cards, not copies, offers, wants or recommendations', () => {
    const ice = CATALOG_COORDINATES.find((group) => group.id.includes('ice-blue'))!;
    expect(coordinateProgress(ice, [owned('e1-05', 99), owned('e1-08')])).toMatchObject({ total: 3, owned: 1, complete: false, missingIds: ['e1-06', 'e1-07'] });
    expect(coordinateProgress(ice, ice.requiredCardIds.map((id) => ({ ...owned(id), offered: 1, wanted: true })))).toMatchObject({ owned: 3, complete: true });
    expect(coordinateProgress(ice, [{ cardId: 'e1-05', owned: 0, offered: 0, wanted: true }]).owned).toBe(0);
    expect(coordinateProgress({ requiredCardIds: ['e1-05', 'e1-05'] }, [owned('e1-05')])).toMatchObject({ total: 1, owned: 1 });
  });
  it('keeps parallel ownership independent even when names match', () => {
    const normal = { requiredCardIds: ['normal-top', 'normal-shoes'] };
    const parallel = { requiredCardIds: ['parallel-top', 'parallel-shoes'] };
    const inventory = [owned('normal-top'), owned('normal-shoes')];
    expect(coordinateProgress(normal, inventory).complete).toBe(true);
    expect(coordinateProgress(parallel, inventory)).toMatchObject({ owned: 0, complete: false });
  });
  it('filters groups by set without dropping members from another set', () => {
    expect(getSetCoordinates('all')).toHaveLength(CATALOG_COORDINATES.length);
    expect(getSetCoordinates('encore-promo')).toEqual([]);
    expect(getSetCoordinates('unknown')).toEqual([]);
    const legendary = getSetCoordinates('encore-1').find((group) => group.id.includes('legendary'))!;
    expect(legendary.requiredCardIds).toContain('ep-002');
    expect(coordinateProgress(legendary, legendary.requiredCardIds.map((id) => owned(id))).complete).toBe(true);
    expect(coordinateProgress(legendary, [owned('e1-51'), owned('e1-52')]).missingIds).toEqual(['ep-002']);
  });
});
