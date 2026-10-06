import { useState } from 'react';
import { canUndoLatest, type CatalogCard, type HistoryChange, type HistoryEvent, type StorePreference } from '@aikatsu/domain';
import { count, Sparkle } from './UI';

const actionNames: Record<HistoryEvent['action'], string> = {
  owned: '所持枚数を変更', offered: '譲れる枚数を変更', wanted: '欲しいを変更',
  adjust: '所持・譲を調整', store: '店舗の記録を変更', restore: 'バックアップを復元', undo: '操作を元に戻した',
};
const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
function storeSummary(preference: StorePreference | null) {
  if (!preference) return '個人記録なし';
  return `お気に入り ${preference.favorite ? '登録' : '未登録'} / 台数 ${preference.machineCount === null ? '未確認' : `${count(preference.machineCount)}台`} / メモ ${preference.note || 'なし'}`;
}
function ChangeDetails({ change, cards, storeNames }: { change: HistoryChange; cards: ReadonlyMap<string, CatalogCard>; storeNames: ReadonlyMap<string, string> }) {
  if (change.kind === 'inventory') {
    const card = cards.get(change.targetId);
    return <li><strong>{card ? `${card.number} ${card.name}` : change.targetId}</strong>
      <p>所持 {count(change.before.owned)} → {count(change.after.owned)} 枚 / 譲 {count(change.before.offered)} → {count(change.after.offered)} 枚 / 欲しい {change.before.wanted ? '選択' : '未選択'} → {change.after.wanted ? '選択' : '未選択'}</p>
    </li>;
  }
  return <li><strong>{storeNames.get(change.targetId) ?? change.targetId}</strong><p>変更前: {storeSummary(change.before)}</p><p>変更後: {storeSummary(change.after)}</p></li>;
}

export function HistoryPage({ history, cards, storeNames, disabled, onUndo }: { history: readonly HistoryEvent[]; cards: readonly CatalogCard[]; storeNames: ReadonlyMap<string, string>; disabled: boolean; onUndo: (eventId: string) => Promise<boolean> }) {
  const [limit, setLimit] = useState(50);
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const ordered = [...history].sort((a, b) => b.sequence - a.sequence);
  return <section className="history-page" aria-labelledby="history-title">
    <div className="section-heading"><div><p className="eyebrow">YOUR COLLECTION JOURNAL</p><h2 id="history-title">操作履歴</h2></div><span className="result-count">{count(history.length)} 件</span></div>
    <p className="panel-description">所持・譲求とお店の記録を、保存した順に表示します。直近の通常操作を1回だけ元に戻せます。復元・取り込んだ履歴・元に戻す操作自体は取り消せません。</p>
    {ordered.length === 0 ? <div className="empty-state"><Sparkle /><h3>操作履歴はまだありません</h3><p>カードやお店の記録を保存すると、変更前後がここに残ります。</p></div> : <ol className="history-list">{ordered.slice(0, limit).map((event) => <li key={event.id} className="history-event" data-testid={`history-${event.id}`}>
      <div className="history-event-heading"><div><span className="history-sequence">#{count(event.sequence)}</span><h3>{actionNames[event.action]}</h3><time dateTime={event.occurredAt}>{dateFormat.format(new Date(event.occurredAt))}</time>{event.importedFromId && <span className="imported-badge">取込履歴</span>}</div>
        {canUndoLatest(event, history) && <button type="button" className="secondary-button" disabled={disabled} onClick={() => { void onUndo(event.id); }}>元に戻す</button>}
      </div>
      {event.changes.length > 0 ? <details open={event.changes.length <= 2}><summary>変更内容 {count(event.changes.length)} 件</summary><ul className="history-changes">{event.changes.map((change) => <ChangeDetails key={`${change.kind}-${change.targetId}`} change={change} cards={cardMap} storeNames={storeNames} />)}</ul></details> : <p className="history-no-change">在庫・店舗設定の値は変更せず、バックアップを復元しました。</p>}
    </li>)}</ol>}
    {ordered.length > limit && <button type="button" className="secondary-button history-more" onClick={() => setLimit((value) => value + 50)}>さらに50件表示（残り{count(ordered.length - limit)}件）</button>}
  </section>;
}
