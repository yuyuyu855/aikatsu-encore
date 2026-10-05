import { describe, expect, it } from 'vitest';
import { parseBackup } from '@aikatsu/domain';
import { CATALOG_CARDS, CATALOG_RELEASE, CATALOG_SETS, getSetCards } from '../src/index';
import images from '../data/images.json';

describe('official catalog snapshot', () => {
  it('covers both observed published scopes and their observed totals', () => {
    expect(CATALOG_SETS.map((set) => [set.sourceSeriesId, set.count])).toEqual([['629001', 85], ['629901', 22]]);
    expect(CATALOG_CARDS).toHaveLength(107);
    expect(CATALOG_RELEASE.totalCards).toBe(CATALOG_CARDS.length);
    expect(new Set(CATALOG_CARDS.map((card) => card.id)).size).toBe(CATALOG_CARDS.length);
  });
  it('retains both legacy IDs and can restore the old schema-1 snapshot', () => {
    expect(CATALOG_CARDS.find((card) => card.id === 'e1-01')?.number).toBe('E1-01');
    expect(CATALOG_CARDS.find((card) => card.id === 'e1-02')?.number).toBe('E1-02');
    const inventory = [{ cardId: 'e1-01', owned: 2, offered: 1, wanted: true }];
    expect(parseBackup(JSON.stringify({ schemaVersion: 1, inventory }), CATALOG_CARDS)).toEqual({ ok: true, value: { schemaVersion: 1, inventory } });
  });
  it('maps all display IDs to the registry and every card to front/back provenance', () => {
    expect(images).toHaveLength(214);
    expect(new Set(images.map((image) => image.localUrl)).size).toBe(images.length);
    for (const set of CATALOG_SETS) expect(getSetCards(set.id)).toHaveLength(set.count);
    for (const card of CATALOG_CARDS) {
      expect(images.filter((image) => image.cardId === card.id).map((image) => image.side).sort()).toEqual(['back', 'front']);
      expect(card.source?.sourceSeriesId).toBeTruthy();
    }
  });
  it('keeps HTML-unpublished fields explicitly unknown rather than deriving them', () => {
    expect(CATALOG_CARDS.every((card) => card.metadata.name === null && card.metadata.part === null && card.metadata.brand === null)).toBe(true);
    expect(getSetCards('unknown-set')).toEqual([]);
  });
  it('separates image transcription from raw HTML fields with pinned image provenance', () => {
    for (const card of CATALOG_CARDS) {
      expect(card.name).not.toBe('名称未確認');
      const image = images.find((image) => image.cardId === card.id && image.side === 'front');
      expect(card.printedMetadata?.source.sha256).toBe(image?.sha256);
      expect(card.printedMetadata?.source.url).toBe(image?.sourceUrl);
      expect(card.printedMetadata?.verifiedFields).toContain('name');
      expect(card.metadata.name).toBeNull();
    }
  });
});
