import type { ChangeEvent } from 'react';
import { Sparkle } from './UI';

export function BackupPage({ disabled, onDownload, onImport }: { disabled: boolean; onDownload: () => void; onImport: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <section className="backup-panel" aria-labelledby="backup-title">
    <div className="section-heading"><div><p className="eyebrow">KEEP YOUR COLLECTION SAFE</p><h2 id="backup-title">バックアップ</h2></div><Sparkle /></div>
    <p className="panel-description">所持・譲求・操作履歴・お店の設定をJSONファイルにまとめて保存・復元します。</p>
    <div className="backup-actions"><article><span className="action-icon" aria-hidden="true">↓</span><h3>ファイルに保存</h3><p>ブラウザのデータを消す前や、別の端末に移る前に保存してください。新形式はschemaVersion 2です。</p><button type="button" className="primary-button" disabled={disabled} onClick={onDownload}>JSONをダウンロード</button></article><article><span className="action-icon lilac-icon" aria-hidden="true">↑</span><h3>ファイルから復元</h3><p>全件を検証し、確認してから反映します。旧v1の在庫ファイルにも対応します。</p><label className="file-picker"><span>JSONファイルを選択</span><input type="file" accept=".json,application/json" aria-label="バックアップJSONファイル" disabled={disabled} onChange={onImport} /></label></article></div>
    <aside className="storage-note"><h3>全収録範囲のデータをバックアップ</h3><p>弾・検索・絞り込みにかかわらず、全登録カードの所持・譲求を保存します。通常のカタログ更新は既存値を保ち、新カードだけ0から追加します。</p><h3>復元は取り消せません</h3><p>v2では履歴・店舗設定も入れ替えます。v1では在庫だけを置き換え、現在の履歴・店舗設定を保持します。ファイルにないカードは未所持・譲0枚・欲しい未選択になります。</p><h3>このブラウザだけに保存されます</h3><p>保存先はIndexedDBです。ブラウザ・端末・ホスト名やポートが変わると別の保存先になります。ブラウザのデータ消去で失われるため、定期的にバックアップしてください。</p><p>ログイン・クラウド保存・友人との同期・QR読取はありません。同じ保存先を複数タブで同時編集しないでください。</p></aside>
  </section>;
}
