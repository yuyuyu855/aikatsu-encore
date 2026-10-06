import type { CatalogCard } from '@aikatsu/domain';
import { count } from './UI';

export function Quantity({ card, label, value, max, disabled, change }: { card: CatalogCard; label: '所持' | '譲れる枚数'; value: number; max: number; disabled: boolean; change: (delta: number) => void }) {
  return <div className="quantity">
    <span className="quantity-label">{label}</span>
    <div className="stepper">
      <button type="button" aria-label={`${card.number} ${label}を減らす`} disabled={disabled || value === 0} onClick={() => change(-1)}>−</button>
      <output aria-label={`${card.number} ${label}`}>{count(value)}<span>枚</span></output>
      <button type="button" aria-label={`${card.number} ${label}を増やす`} disabled={disabled || value >= max} onClick={() => change(1)}>+</button>
    </div>
  </div>;
}
