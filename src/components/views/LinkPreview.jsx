import { useEffect, useState } from 'react';

export function LinkPreview() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const handleOver = (e) => {
      const link = e.target.closest('a[href]');
      if (link) setUrl(link.href);
    };
    const handleOut = (e) => {
      const link = e.target.closest('a[href]');
      if (link) setUrl(null);
    };
    document.addEventListener('pointerover', handleOver);
    document.addEventListener('pointerout', handleOut);
    return () => {
      document.removeEventListener('pointerover', handleOver);
      document.removeEventListener('pointerout', handleOut);
    };
  }, []);

  if (!url) return null;

  return (
    // `dir='rtl'` flips where overflow happens so the truncation ellipsis
    // appears at the START of the visible URL (e.g. `…/app-studio/.../1169842018`)
    // rather than the end. Useful here because the END of a URL — the path —
    // tells you where the click will land; the START (https://domo.domo.com) is
    // repetitive across all toolkit links. URL characters are all strong-LTR
    // or neutral, so they render in correct reading order despite the RTL
    // container.
    <div
      className='fixed bottom-0 left-0 z-50 max-w-full truncate rounded-tr-lg border border-border bg-background px-2 py-0.5 text-xs text-muted'
      dir='rtl'
    >
      {url}
    </div>
  );
}
