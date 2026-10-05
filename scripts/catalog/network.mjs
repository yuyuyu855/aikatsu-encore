import { EnvHttpProxyAgent, fetch } from 'undici';
import { officialUrl } from './official.mjs';

// Use the machine's supported proxy environment; TLS verification stays enabled.
const dispatcher = new EnvHttpProxyAgent();
export async function getOfficial(url, kind) {
  const target = officialUrl(url, kind);
  const response = await fetch(target, {
    dispatcher, redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'AikatsuEncoreLocalCatalog/1.0' },
  });
  if (response.status !== 200) { await response.body?.cancel(); throw new Error(`Official source HTTP ${response.status}`); }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim();
  if (contentType !== (kind === 'image' ? 'image/webp' : 'text/html')) {
    await response.body?.cancel(); throw new Error(`Unexpected source content type: ${contentType}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > (kind === 'image' ? 5_000_000 : 10_000_000)) throw new Error('Source exceeds the expected download size');
  return { bytes, contentType, url: response.url, acquiredAt: new Date().toISOString() };
}
export async function closeNetwork() { await dispatcher.close(); }
