import { useState } from 'react';
import type { CatalogCard, Inventory } from '@aikatsu/domain';
import { COORDINATE_COVERAGE, coordinateProgress, getSetCoordinates } from '@aikatsu/catalog';
import { CardArtwork } from '../../components/CardArtwork';
import './coordinates.css';

interface CoordinateViewProps {
  /** Complete registry, including members outside the selected display scope. */
  cards: readonly CatalogCard[];
  inventory: readonly Inventory[];
  selectedSetId: string;
}

export function CoordinateView({ cards, inventory, selectedSetId }: CoordinateViewProps) {
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const coordinates = getSetCoordinates(selectedSetId);
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const ownedIds = new Set(inventory.filter((entry) => entry.owned > 0).map((entry) => entry.cardId));
  const progress = coordinates.map((coordinate) => ({ coordinate, progress: coordinateProgress(coordinate, inventory) }));
  const completeCount = progress.filter((entry) => entry.progress.complete).length;
  const visible = progress.filter((entry) => !incompleteOnly || !entry.progress.complete);

  return <section className="coordinate-view" aria-labelledby="coordinate-heading">
    <div className="coordinate-summary">
      <h2 id="coordinate-heading">コーデ完成度</h2>
      <p><strong>{completeCount} / {coordinates.length}</strong> コーデ完成</p>
      <label><input type="checkbox" checked={incompleteOnly} onChange={(event) => setIncompleteOnly(event.target.checked)} /> 未完成だけ</label>
    </div>
    <p className="coordinate-coverage">確認済みの組み合わせを表示しています。完成条件は、コーデごとに指定したカードを各1枚以上所持することです。</p>
    <details className="coordinate-coverage">
      <summary>収録範囲と完成条件について</summary>
      {COORDINATE_COVERAGE.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
      <p>汎用アクセサリーのおすすめは完成枚数に含めません。通常版とパラレル版は別のカードIDで判定します。</p>
    </details>
    {coordinates.length === 0 && <p role="status">この範囲のコーデ構成は未確認です。</p>}
    {coordinates.length > 0 && visible.length === 0 && <p role="status">この範囲のコーデはすべて完成しています。</p>}
    <div className="coordinate-list">
      {visible.map(({ coordinate, progress: status }) => <article className={`coordinate-group ${status.complete ? 'is-complete' : ''}`} key={coordinate.id}>
        <header className="coordinate-group-header">
          <h3>{coordinate.name} <span className="coordinate-variant">{coordinate.variant === 'parallel' ? 'パラレル' : '通常'}</span></h3>
          <span className="coordinate-state">{status.complete ? '完成' : '未完成'} · {status.owned} / {status.total}</span>
        </header>
        <ul className="coordinate-members">
          {coordinate.requiredCardIds.map((id) => {
            const card = cardById.get(id);
            const owned = ownedIds.has(id);
            return <li className={`coordinate-member ${owned ? 'is-owned' : 'is-missing'}`} key={id}>
              {card && <CardArtwork card={card} />}
              <strong>{card?.number ?? id}</strong>
              <span>{card?.name ?? 'カード情報未確認'}</span>
              <span className="coordinate-ownership">{owned ? '✓ 所持' : '未所持'}</span>
            </li>;
          })}
        </ul>
        {!status.complete && <p className="coordinate-missing">不足: {status.missingIds.map((id) => {
          const card = cardById.get(id);
          return card ? `${card.number} ${card.name}` : id;
        }).join('、')}</p>}
        {coordinate.optionalCardIds.length > 0 && <p className="coordinate-optional">おすすめ（完成条件に含めません）: {coordinate.optionalCardIds.map((id) => {
          const card = cardById.get(id);
          return `${card?.number ?? id} ${card?.name ?? ''}（${ownedIds.has(id) ? '所持' : '未所持'}）`;
        }).join('、')}</p>}
        <details className="coordinate-evidence">
          <summary>完成条件・確認元</summary>
          <p>{coordinate.completionRule}</p>
          <p>{coordinate.note}</p>
          <a href={coordinate.evidence.url} target="_blank" rel="noreferrer">公式カード裏面で組み合わせを確認</a>
        </details>
      </article>)}
    </div>
  </section>;
}
