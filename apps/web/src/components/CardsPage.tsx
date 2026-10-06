import type { CatalogEntry } from '@aikatsu/catalog';
import type { Inventory } from '@aikatsu/domain';
import { CardArtwork } from './CardArtwork';
import { Quantity } from './QuantityControls';
import { count, Sparkle } from './UI';

export type CardFilter = 'all' | 'owned' | 'unowned' | 'offered' | 'wanted';
export interface CardsPageProps {
  cards: readonly CatalogEntry[];
  inventory: ReadonlyMap<string, Inventory>;
  totalCount: number;
  ready: boolean;
  disabled: boolean;
  query: string;
  filter: CardFilter;
  rarity: string;
  part: string;
  rarities: readonly string[];
  parts: readonly string[];
  onQuery: (value: string) => void;
  onFilter: (value: CardFilter) => void;
  onRarity: (value: string) => void;
  onPart: (value: string) => void;
  onOwned: (card: CatalogEntry, item: Inventory, delta: number) => void;
  onOffered: (item: Inventory, delta: number) => void;
  onWanted: (item: Inventory, wanted: boolean) => void;
}

export function CardsPage(props: CardsPageProps) {
  return <section aria-labelledby="list-title" className="collection-panel">
    <div className="section-heading"><div><p className="eyebrow">CARD LIBRARY</p><h2 id="list-title">カード一覧</h2></div><span className="result-count">{props.cards.length} / {props.totalCount} 種表示<span> · 番号順</span></span></div>
    <div className="toolbar">
      <label className="search-field"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.8" /><path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span className="sr-only">カード名・番号で検索</span><input type="search" value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="カード名・番号で検索" /></label>
      <label className="filter-field"><span className="sr-only">カードの絞り込み</span><select value={props.filter} onChange={(event) => props.onFilter(event.target.value as CardFilter)}><option value="all">すべて</option><option value="owned">所持</option><option value="unowned">未所持</option><option value="offered">譲れる</option><option value="wanted">欲しい</option></select></label>
    </div>
    <div className="metadata-filters">
      {props.rarities.length > 1 && <label><span>レアリティ</span><select value={props.rarity} onChange={(event) => props.onRarity(event.target.value)}><option value="all">すべて</option>{props.rarities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      {props.parts.length > 1 && <label><span>パーツ</span><select value={props.part} onChange={(event) => props.onPart(event.target.value)}><option value="all">すべて</option>{props.parts.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
    </div>
    <div className="card-list card-grid">{props.cards.map((card) => {
      const item = props.inventory.get(card.id)!;
      return <article key={card.id} aria-label={`${card.number} ${card.name}`} data-testid={`card-${card.id}`} className="inventory-card">
        <CardArtwork card={card} />
        <div className="card-main">
          <div className="card-meta"><span className="card-number">{card.number}</span>{card.rarity && <span className="rarity">{card.rarity}</span>}<span className={`ownership-label ${item.owned > 0 ? 'is-owned' : ''}`}>{item.owned > 0 ? '所持' : '未所持'}</span></div>
          <h3>{card.name}</h3>
          <p className="card-source">{[card.part, card.brand, card.category, card.appealPoints !== undefined ? `AP ${count(card.appealPoints)}` : undefined].filter(Boolean).join(' · ') || '公式カード一覧'}</p>
          {card.metadata.availabilityText && <p className="card-availability">{card.metadata.availabilityText}</p>}
          <div className="card-controls">
            <Quantity card={card} label="所持" value={item.owned} max={Number.MAX_SAFE_INTEGER} disabled={props.disabled} change={(delta) => props.onOwned(card, item, delta)} />
            <Quantity card={card} label="譲れる枚数" value={item.offered} max={item.owned} disabled={props.disabled} change={(delta) => props.onOffered(item, delta)} />
            <label className={`wanted-control ${item.wanted ? 'is-wanted' : ''}`}><input type="checkbox" aria-label={`${card.number} 欲しい`} checked={item.wanted} disabled={props.disabled} onChange={(event) => props.onWanted(item, event.target.checked)} /><span aria-hidden="true">♡</span><span>欲しい</span></label>
          </div>
        </div>
      </article>;
    })}</div>
    {props.ready && props.cards.length === 0 && <div className="empty-state"><Sparkle /><h3>一致するカードがありません</h3><p>検索語や絞り込みを変えてみてください。</p></div>}
  </section>;
}
