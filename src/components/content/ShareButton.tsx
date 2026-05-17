import { useState, useCallback } from 'react';

function copyToClipboard(text: string): boolean {
  // Use the textarea/execCommand approach — most reliable across all contexts
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }

  document.body.removeChild(textarea);
  return success;
}

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    const success = copyToClipboard(url);

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // Final fallback
      window.prompt('Copy this link:', url);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={handleShare}
      className="share-button"
      aria-label="Share this page"
      title="Share this page"
    >
      {copied ? '✓ Copied' : '🔗 Share'}
    </button>
  );
}
