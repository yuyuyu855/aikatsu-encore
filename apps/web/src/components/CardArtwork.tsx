import { useState } from 'react';
import type { CatalogCard } from '@aikatsu/domain';
import { CARD_IMAGES_ENABLED, cardImageUrl } from '../publication';
import { Sparkle } from './UI';

export function CardArtwork({ card, className = '' }: { card: CatalogCard; className?: string }) {
  const [back, setBack] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const imageUrl = cardImageUrl(back ? card.imageBackUrl : card.imageUrl);
  const unavailable = !imageUrl || failedImages.includes(imageUrl);
  return <div className={`card-artwork ${className}`}>
    <div className="card-artwork-frame">
      {unavailable ? <div className="card-image-fallback"><Sparkle /><span>{card.number}</span><small>{CARD_IMAGES_ENABLED ? '画像を表示できません' : 'テスト公開では画像を掲載していません'}</small></div> : <a href={imageUrl} target="_blank" rel="noreferrer" aria-label={`${card.number} カード${back ? '裏面' : '表面'}の画像を開く`}><img src={imageUrl} alt={`${card.number} のカード${back ? '裏面' : '表面'}`} loading="lazy" width="460" height="670" onError={() => setFailedImages((urls) => [...urls, imageUrl])} /></a>}
    </div>
    {CARD_IMAGES_ENABLED && card.imageBackUrl && <button type="button" className="image-side-button" aria-label={`${card.number} カードの${back ? '表面' : '裏面'}を表示`} onClick={() => setBack((value) => !value)}>{back ? '表面を見る' : '裏面を見る'}</button>}
  </div>;
}
