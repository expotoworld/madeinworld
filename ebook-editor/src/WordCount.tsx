import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';

function countsFromText(text: string) {
  // Words: English tokens + individual CJK Han chars
  const hanRegex = /[\u3400-\u9FFF\uF900-\uFAFF]/g; // CJK Unified Ideographs + Extension A + Compatibility Ideographs
  const hanMatches = Array.from(text.matchAll(hanRegex));
  const textNoHan = text.replace(hanRegex, ' ');
  const enWordMatches = Array.from(textNoHan.matchAll(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g));
  const words = hanMatches.length + enWordMatches.length;

  const chars = Array.from(text).length;
  const charsNoSpaces = Array.from(text.replace(/\s+/g, '')).length;

  return { words, chars, charsNoSpaces };
}

export default function WordCount({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState({ words: 0, chars: 0, charsNoSpaces: 0 });
  const [selected, setSelected] = useState({ words: 0, chars: 0, charsNoSpaces: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const updateCounts = () => {
    const doc = editor.state.doc;
    const allText = doc.textBetween(0, doc.content.size, ' ', ' ');
    const t = countsFromText(allText);

    const { from, to } = editor.state.selection;
    const selText = from < to ? doc.textBetween(from, to, ' ', ' ') : '';
    const s = countsFromText(selText);

    setTotal(t);
    setSelected(s);
  };

  useEffect(() => {
    updateCounts();
    editor.on('update', updateCounts);
    editor.on('selectionUpdate', updateCounts);
    return () => {
      try {
        editor.off('update', updateCounts);
        editor.off('selectionUpdate', updateCounts);
      } catch {}
    };
  }, [editor]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const showSelected = selected.words > 0 || selected.chars > 0;
  const display = showSelected
    ? t('word.box_selected', { count: selected.words.toLocaleString() })
    : t('word.box', { count: total.words.toLocaleString() });

  return (
    <div className="wc-root" ref={ref}>
      <button className="wc-box" onClick={() => setOpen(v => !v)} aria-label={t('word.title')}>
        {display}
      </button>
      {open && (
        <div className="wc-pop" role="dialog" aria-label={t('word.stats_title')}>
          <div className="wc-row"><span>{t('word.words')}:</span> <span>{total.words.toLocaleString()}{showSelected ? ` (${selected.words.toLocaleString()})` : ''}</span></div>
          <div className="wc-row"><span>{t('word.characters')}:</span> <span>{total.chars.toLocaleString()}{showSelected ? ` (${selected.chars.toLocaleString()})` : ''}</span></div>
          <div className="wc-row"><span>{t('word.characters_no_spaces')}:</span> <span>{total.charsNoSpaces.toLocaleString()}{showSelected ? ` (${selected.charsNoSpaces.toLocaleString()})` : ''}</span></div>
        </div>
      )}
    </div>
  );
}

