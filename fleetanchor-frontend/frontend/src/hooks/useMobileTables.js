import { useEffect } from 'react';

/**
 * On phones, wide tables are shown as one card per row (see `.m-cards` in
 * styles/index.css). Each cell needs its column name for that, so this copies
 * the header text onto every cell as data-label — for every table inside the
 * given container, including ones that render later.
 */
export default function useMobileTables(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    const label = () => {
      root.querySelectorAll('table').forEach((table) => {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        if (!heads.length) return;
        table.classList.add('m-cards');
        table.querySelectorAll('tbody tr').forEach((tr) => {
          let col = 0;
          [...tr.children].forEach((td) => {
            const text = heads[col] ?? '';
            if (td.getAttribute('data-label') !== text) td.setAttribute('data-label', text);
            col += Number(td.getAttribute('colspan') || 1);
          });
        });
      });
    };

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; label(); });
    });
    label();
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref]);
}
