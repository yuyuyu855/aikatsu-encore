export const CARD_IMAGES_ENABLED = import.meta.env.MODE !== 'pages';

export function cardImageUrl(path: string | undefined): string | undefined {
  return CARD_IMAGES_ENABLED && path ? import.meta.env.BASE_URL + path.replace(/^\/+/, '') : undefined;
}
