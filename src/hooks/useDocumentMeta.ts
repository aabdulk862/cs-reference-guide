import { useEffect } from 'react';

/**
 * Metadata to set on the document for SEO and social sharing.
 *
 * Requirements: 21.1, 21.2
 */
export interface DocumentMeta {
  title: string;
  description: string;
  ogImage?: string;
}

/** Default social image path used when no ogImage is specified */
const DEFAULT_OG_IMAGE = '/icons/icon-512.png';

/**
 * Truncate a string to a maximum character length, preserving whole words.
 * Appends an ellipsis ("…") when truncation occurs.
 *
 * If the string is already within the limit, it is returned unchanged.
 * If truncation at a word boundary would result in an empty string,
 * the text is hard-truncated at maxLength - 1 characters plus the ellipsis.
 */
export function truncatePreservingWords(text: string, maxLength: number): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  // Reserve space for the ellipsis character
  const limit = maxLength - 1;

  // Find the last space at or before the limit
  const slice = trimmed.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');

  if (lastSpace <= 0) {
    // No word boundary found — hard truncate
    return trimmed.slice(0, limit) + '…';
  }

  return trimmed.slice(0, lastSpace) + '…';
}

/**
 * Helper to get or create a <meta> element by name attribute.
 */
function getOrCreateMeta(name: string): HTMLMetaElement {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Helper to get or create a <meta> element by property attribute (for og: tags).
 */
function getOrCreateMetaProperty(property: string): HTMLMetaElement {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  return el;
}

/**
 * React hook that sets document.title, meta[name="description"],
 * and og:image based on the provided metadata.
 *
 * - Title is truncated to 60 characters preserving whole words
 * - Description is truncated to 160 characters preserving whole words
 * - og:image defaults to the application's social image
 *
 * Requirements: 21.1, 21.2
 */
export function useDocumentMeta(meta: DocumentMeta): void {
  useEffect(() => {
    // Set document title (max 60 chars)
    document.title = truncatePreservingWords(meta.title, 60);

    // Set meta description (max 160 chars)
    const descriptionEl = getOrCreateMeta('description');
    descriptionEl.setAttribute('content', truncatePreservingWords(meta.description, 160));

    // Set og:image
    const ogImageEl = getOrCreateMetaProperty('og:image');
    ogImageEl.setAttribute('content', meta.ogImage || DEFAULT_OG_IMAGE);
  }, [meta.title, meta.description, meta.ogImage]);
}
