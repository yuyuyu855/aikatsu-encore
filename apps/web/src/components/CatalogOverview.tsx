import type { CatalogEntry } from '@aikatsu/catalog';
import type { Inventory } from '@aikatsu/domain';
import { CATALOG_RELEASE, CATALOG_SETS } from '../catalog';
import { count, summarize } from './UI';

export function CatalogOverview({ cards, inventory, setId, ready, onSet }: { cards: readonly CatalogEntry[]; inventory: readonly Inventory[]; setId: string; ready: boolean; onSet: (setId: string) => void }) {
  const selectedSet = CATALOG_SETS.find((set) => set.id === setId);
  const scopeName = selectedSet?.name ?? '全公開カード';
  const sets = selectedSet ? [selectedSet] : CATALOG_SETS;
  const complete = sets.every((set) => set.coverageStatus === 'complete');
  const unknownNames = cards.filter((card) => card.name === '名称未確認').length;
  const stats = summarize(inventory);
  return <>
    <section className="catalog-scope" aria-label="カタログの収録範囲">
      <div className="scope-note"><span className="scope-label">{scopeName} · {cards.length} 種</span><span>{complete ? '公式公開一覧を収録' : '収録済み範囲の集計'} · 取得 {(selectedSet?.fetchedAt ?? CATALOG_RELEASE.acquiredAt).slice(0, 10)}</span></div>
      <label className="set-picker"><span>収録範囲</span><select value={setId} onChange={(event) => onSet(event.target.value)}><option value="all">全公開カード</option>{CATALOG_SETS.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
      <div className="catalog-source">出典：{sets.map((set, index) => <span key={set.id}>{index > 0 && ' / '}<a href={set.sourceUrl} target="_blank" rel="noreferrer">公式 {set.name}</a></span>)}<span className="catalog-version">カタログ {CATALOG_RELEASE.catalogVersion}</span></div>
      {unknownNames > 0 && <p className="metadata-note">{unknownNames} 種の名称は未確認です。画像やカード番号で確認・管理できます。</p>}
    </section>
    <section className="stats" aria-label="コレクションの集計">
      <div className="stat-card"><span>所持種類</span><div><strong>{ready ? stats.kinds : '—'}</strong><span> / {cards.length} 種</span></div><div className="progress-track" role="progressbar" aria-label={`${scopeName}の所持種類率`} aria-valuenow={ready ? stats.kinds : 0} aria-valuemin={0} aria-valuemax={cards.length}><span style={{ width: `${ready && cards.length ? stats.kinds / cards.length * 100 : 0}%` }} /></div><small>{scopeName}の収録済み範囲</small></div>
      <div className="stat-card"><span>総所持枚数</span><div><strong>{ready ? count(stats.total) : '—'}</strong><span> 枚</span></div><small>同じカードの複数枚もカウント</small></div>
      <div className="stat-card exchange-stat"><span>わたしの譲・求</span><div><span>譲 </span><strong>{ready ? count(stats.offered) : '—'}</strong><span> 枚</span><span className="stat-separator">/</span><span>求 </span><strong>{ready ? stats.wanted : '—'}</strong><span> 種</span></div><small>自分の端末内で整理できます</small></div>
    </section>
  </>;
}
