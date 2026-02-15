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
    <div className='fixed bottom-0 left-0 z-50 max-w-[90%] truncate rounded-tr-lg border border-border bg-background px-2 py-0.5 text-xs text-muted'>
      {url}
    </div>
  );
}
