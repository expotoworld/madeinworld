import React, { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next'


function Btn({ active, onClick, title, children }: React.PropsWithChildren<{ active?: boolean; onClick: ()=>void; title?: string }>) {
  return (
    <button
      className={`toolbar-btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      data-tooltip={title || undefined}
      aria-label={title}
      type="button"
    >
      {children}
    </button>
  );
}

function Dropdown({ label, active, children, title }: React.PropsWithChildren<{ label: React.ReactNode; active?: boolean; title?: string }>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dropdown">
      <button
        className={`toolbar-btn${active ? ' is-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        type="button"
        data-tooltip={title || undefined}
        aria-label={title}
      >
        {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="dropdown-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function HighlightPicker({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const apply = (color: string) => {
    editor.chain().focus().setHighlight({ color }).run();
    setOpen(false);
  };
  const clear = () => { editor.chain().focus().unsetHighlight().run(); setOpen(false); };
  return (
    <div className="dropdown" style={{ position: 'relative' }}>
      <button
        className={`toolbar-btn${editor.isActive('highlight') ? ' is-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        type="button"
        data-tooltip={t('toolbar.highlight')}
        aria-label={t('toolbar.highlight')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M15.2427 4.51149L8.50547 11.2487L7.79836 13.37L6.7574 14.411L9.58583 17.2394L10.6268 16.1985L12.7481 15.4913L19.4853 8.75413L15.2427 4.51149ZM21.6066 8.04702C21.9972 8.43755 21.9972 9.07071 21.6066 9.46124L13.8285 17.2394L11.7071 17.9465L10.2929 19.3607C9.90241 19.7513 9.26925 19.7513 8.87872 19.3607L4.63608 15.1181C4.24556 14.7276 4.24556 14.0944 4.63608 13.7039L6.0503 12.2897L6.7574 10.1683L14.5356 2.39017C14.9261 1.99964 15.5593 1.99964 15.9498 2.39017L21.6066 8.04702ZM15.2427 7.33992L16.6569 8.75413L11.7071 13.7039L10.2929 12.2897L15.2427 7.33992ZM4.28253 16.8859L7.11096 19.7143L5.69674 21.1285L1.4541 19.7143L4.28253 16.8859Z"/>
        </svg>
      </button>
      {open && (
        <div className="hl-picker" role="menu" onMouseLeave={() => setOpen(false)}>
          <button className="hl-swatch" style={{ background: 'rgba(239,68,68,0.28)' }} onClick={() => apply('rgba(239,68,68,0.28)')} aria-label="Red highlight" />
          <button className="hl-swatch" style={{ background: 'rgba(249,115,22,0.28)' }} onClick={() => apply('rgba(249,115,22,0.28)')} aria-label="Orange highlight" />
          <button className="hl-swatch" style={{ background: 'rgba(234,179,8,0.28)' }} onClick={() => apply('rgba(234,179,8,0.28)')} aria-label="Yellow highlight" />
          <button className="hl-swatch" style={{ background: 'rgba(34,197,94,0.28)' }} onClick={() => apply('rgba(34,197,94,0.28)')} aria-label="Green highlight" />
          <button className="hl-swatch" style={{ background: 'rgba(59,130,246,0.28)' }} onClick={() => apply('rgba(59,130,246,0.28)')} aria-label="Blue highlight" />
          <button className="hl-swatch" style={{ background: 'rgba(168,85,247,0.28)' }} onClick={() => apply('rgba(168,85,247,0.28)')} aria-label="Purple highlight" />
          <div className="picker-sep" aria-hidden />
          <button className="hl-remove" onClick={clear} aria-label={t('toolbar.remove_highlight')}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18.1537 19.5646C14.6255 22.8742 9.08161 22.8062 5.6362 19.3608C2.19078 15.9154 2.12284 10.3715 5.43239 6.8433L1.39355 2.80445L2.80777 1.39024L22.6068 21.1892L21.1925 22.6034L18.1537 19.5646ZM6.84756 8.25846C4.3185 11.0046 4.38612 15.2823 7.05041 17.9466C9.7147 20.6109 13.9924 20.6785 16.7385 18.1494L6.84756 8.25846ZM20.4144 16.1969L18.8156 14.598C19.3488 12.3187 18.7269 9.82407 16.9499 8.0471L12.0002 3.09735L9.65751 5.43999L8.2433 4.02578L12.0002 0.268921L18.3641 6.63288C20.9499 9.21864 21.6333 12.9863 20.4144 16.1969Z"/>
            </svg>
          </button>
        </div>
      )}
    </div>

  );
}


function LinkPicker({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const selectionEmpty = editor.state.selection.empty;
  const rootRef = useRef<HTMLDivElement>(null);
  const canAct = url.trim().length > 0;

  const activeHref = (editor.getAttributes('link').href as string | undefined) || '';
  const hasLink = !!activeHref;
  const toggle = () => {
    if (selectionEmpty && !hasLink) return; // no-op when nothing selected and no existing link
    setUrl(activeHref || '');
    setOpen(v => !v);
  };
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const apply = () => {
    if (!canAct) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setOpen(false);
  };
  const unlink = () => {
    if (!canAct) return;
    editor.chain().focus().unsetLink().run();
    setOpen(false);
  };
  const openHref = () => {
    if (!canAct) return;
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    window.open(u, '_blank');
    setOpen(false);
  };
  useEffect(() => {
    if (!editor) return;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('href') || '';
        setUrl(href);
        setOpen(true);
      }
    };
    editor.view.dom.addEventListener('click', onClick);
    return () => editor.view.dom.removeEventListener('click', onClick);
  }, [editor]);

  return (
    <div ref={rootRef} className="dropdown" style={{ position: 'relative' }}>
      <button
        className={`toolbar-btn${editor.isActive('link') ? ' is-active' : ''}`}
        onClick={toggle}
        type="button"
        data-tooltip={selectionEmpty && !hasLink ? t('toolbar.link_select') : t('toolbar.link')}
        aria-label={t('toolbar.link')}
        disabled={selectionEmpty && !hasLink}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.3638 15.5355L16.9496 14.1213L18.3638 12.7071C20.3164 10.7545 20.3164 7.58866 18.3638 5.63604C16.4112 3.68341 13.2453 3.68341 11.2927 5.63604L9.87849 7.05025L8.46428 5.63604L9.87849 4.22182C12.6122 1.48815 17.0443 1.48815 19.778 4.22182C22.5117 6.95549 22.5117 11.3876 19.778 14.1213L18.3638 15.5355ZM15.5353 18.364L14.1211 19.7782C11.3875 22.5118 6.95531 22.5118 4.22164 19.7782C1.48797 17.0445 1.48797 12.6123 4.22164 9.87868L5.63585 8.46446L7.05007 9.87868L5.63585 11.2929C3.68323 13.2455 3.68323 16.4113 5.63585 18.364C7.58847 20.3166 10.7543 20.3166 12.7069 18.364L14.1211 16.9497L15.5353 18.364ZM14.8282 7.75736L16.2425 9.17157L9.17139 16.2426L7.75717 14.8284L14.8282 7.75736Z"></path>
        </svg>
      </button>
      {open && (
        <div className="link-pop" role="menu">
          <input className="link-input" value={url} onChange={e => setUrl(e.target.value)}
                 placeholder={t('link.placeholder')}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') { e.preventDefault(); if (canAct) { apply(); editor.chain().focus().run(); } }
                   if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setUrl(activeHref || ''); }
                 }} />
          <button className="link-action" onClick={apply} data-tooltip={t('toolbar.apply_link')} aria-label={t('toolbar.apply_link')} disabled={!canAct}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z"></path>
            </svg>
          </button>
          <div className="picker-sep" aria-hidden />
          <button className="link-action" onClick={openHref} data-tooltip={t('toolbar.open_link_new')} aria-label={t('toolbar.open_link_new')} disabled={!canAct}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M10 6V8H5V19H16V14H18V20C18 20.5523 17.5523 21 17 21H4C3.44772 21 3 20.5523 3 20V7C3 6.44772 3.44772 6 4 6H10ZM21 3V11H19L18.9999 6.413L11.2071 14.2071L9.79289 12.7929L17.5849 5H13V3H21Z"></path>
            </svg>
          </button>
          <button className="link-action" onClick={unlink} data-tooltip={t('toolbar.remove_link')} aria-label={t('toolbar.remove_link')} disabled={!canAct}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 4V6H15V4H9Z"></path>
            </svg>
          </button>
        </div>
      )}
    </div>

  );
}

function MenuItem({ onClick, children }: React.PropsWithChildren<{ onClick: ()=>void }>) {
  return (
    <div className="menu-item" role="menuitem" onClick={onClick}>
      {children}
    </div>
  );
}


export default function Toolbar({ editor, zoomLevel, onZoomChange }: { editor: Editor | null; zoomLevel: number; onZoomChange: (n: number) => void }) {
  if (!editor) return null;
  const { t } = useTranslation()
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting toolbar">
      <Btn onClick={() => editor.chain().focus().undo().run()} title={t('toolbar.undo')} aria-label={t('toolbar.undo')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5.82843 6.99955L8.36396 9.53509L6.94975 10.9493L2 5.99955L6.94975 1.0498L8.36396 2.46402L5.82843 4.99955H13C17.4183 4.99955 21 8.58127 21 12.9996C21 17.4178 17.4183 20.9996 13 20.9996H4V18.9996H13C16.3137 18.9996 19 16.3133 19 12.9996C19 9.68584 16.3137 6.99955 13 6.99955H5.82843Z"></path>
        </svg>
      </Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} title={t('toolbar.redo')} aria-label={t('toolbar.redo')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.1716 6.99955H11C7.68629 6.99955 5 9.68584 5 12.9996C5 16.3133 7.68629 18.9996 11 18.9996H20V20.9996H11C6.58172 20.9996 3 17.4178 3 12.9996C3 8.58127 6.58172 4.99955 11 4.99955H18.1716L15.636 2.46402L17.0503 1.0498L22 5.99955L17.0503 10.9493L15.636 9.53509L18.1716 6.99955Z"></path>
        </svg>
      </Btn>
      <div className="toolbar-sep" />

      {/* Group 2 */}
      <Dropdown label={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17 11V4H19V21H17V13H7V21H5V4H7V11H17Z"/></svg>} active={editor.isActive('heading')}>
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13 20H11V13H4V20H2V4H4V11H11V4H13V20ZM21.0005 8V20H19.0005L19 10.204L17 10.74V8.67L19.5005 8H21.0005Z"/></svg>
          <span>{t('toolbar.heading1')}</span>
        </MenuItem>
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4 4V11H11V4H13V20H11V13H4V20H2V4H4ZM18.5 8C20.5711 8 22.25 9.67893 22.25 11.75C22.25 12.6074 21.9623 13.3976 21.4781 14.0292L21.3302 14.2102L18.0343 18H22V20H15L14.9993 18.444L19.8207 12.8981C20.0881 12.5908 20.25 12.1893 20.25 11.75C20.25 10.7835 19.4665 10 18.5 10C17.5818 10 16.8288 10.7071 16.7558 11.6065L16.75 11.75H14.75C14.75 9.67893 16.4289 8 18.5 8Z"/></svg>
          <span>{t('toolbar.heading2')}</span>
        </MenuItem>
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M22 8L21.9984 10L19.4934 12.883C21.0823 13.3184 22.25 14.7728 22.25 16.5C22.25 18.5711 20.5711 20.25 18.5 20.25C16.674 20.25 15.1528 18.9449 14.8184 17.2166L16.7821 16.8352C16.9384 17.6413 17.6481 18.25 18.5 18.25C19.4665 18.25 20.25 17.4665 20.25 16.5C20.25 15.5335 19.4665 14.75 18.5 14.75C18.214 14.75 17.944 14.8186 17.7056 14.9403L16.3992 13.3932L19.3484 10H15V8H22ZM4 4V11H11V4H13V20H11V13H4V20H2V4H4Z"/></svg>
          <span>{t('toolbar.heading3')}</span>
        </MenuItem>
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13 20H11V13H4V20H2V4H4V11H11V4H13V20ZM22 8V16H23.5V18H22V20H20V18H14.5V16.66L19.5 8H22ZM20 11.133L17.19 16H20V11.133Z"/></svg>
          <span>{t('toolbar.heading4')}</span>
        </MenuItem>
      </Dropdown>
      <Dropdown label={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 4H21V6H8V4ZM3 3.5H6V6.5H3V3.5ZM3 10.5H6V13.5H3V10.5ZM3 17.5H6V20.5H3V17.5ZM8 11H21V13H8V11ZM8 18H21V20H8V18Z"/></svg>} active={editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')}>
        <MenuItem onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 4H21V6H8V4ZM4.5 6.5C3.67157 6.5 3 5.82843 3 5C3 4.17157 3.67157 3.5 4.5 3.5C5.32843 3.5 6 4.17157 6 5C6 5.82843 5.32843 6.5 4.5 6.5ZM4.5 13.5C3.67157 13.5 3 12.8284 3 12C3 11.1716 3.67157 10.5 4.5 10.5C5.32843 10.5 6 11.1716 6 12C6 12.8284 5.32843 13.5 4.5 13.5ZM4.5 20.4C3.67157 20.4 3 19.7284 3 18.9C3 18.0716 3.67157 17.4 4.5 17.4C5.32843 17.4 6 18.0716 6 18.9C6 19.7284 5.32843 20.4 4.5 20.4ZM8 11H21V13H8V11ZM8 18H21V20H8V18Z"/></svg>
          <span>{t('toolbar.bullet_list')}</span>
        </MenuItem>
        <MenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M5.75024 3.5H4.71733L3.25 3.89317V5.44582L4.25002 5.17782L4.25018 8.5H3V10H7V8.5H5.75024V3.5ZM10 4H21V6H10V4ZM10 11H21V13H10V11ZM10 18H21V20H10V18ZM2.875 15.625C2.875 14.4514 3.82639 13.5 5 13.5C6.17361 13.5 7.125 14.4514 7.125 15.625C7.125 16.1106 6.96183 16.5587 6.68747 16.9167L6.68271 16.9229L5.31587 18.5H7V20H3.00012L2.99959 18.8786L5.4717 16.035C5.5673 15.9252 5.625 15.7821 5.625 15.625C5.625 15.2798 5.34518 15 5 15C4.67378 15 4.40573 15.2501 4.37747 15.5688L4.3651 15.875H2.875V15.625Z"/></svg>
          <span>{t('toolbar.ordered_list')}</span>
        </MenuItem>
        <MenuItem onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8.00008 6V9H5.00008V6H8.00008ZM3.00008 4V11H10.0001V4H3.00008ZM13.0001 4H21.0001V6H13.0001V4ZM13.0001 11H21.0001V13H13.0001V11ZM13.0001 18H21.0001V20H13.0001V18ZM10.7072 16.2071L9.29297 14.7929L6.00008 18.0858L4.20718 16.2929L2.79297 17.7071L6.00008 20.9142L10.7072 16.2071Z"/></svg>
          <span>{t('toolbar.task_list')}</span>
        </MenuItem>
      </Dropdown>
      <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title={t('toolbar.blockquote')} aria-label={t('toolbar.blockquote')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M1 2V5H3V4H5V9H3.5V11H8.5V9H7V4H9V5H11V2H1ZM21 3H14V5H20V19H4V14H2V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V4C22 3.44772 21.5523 3 21 3Z"></path>
        </svg>
      </Btn>
      <div className="toolbar-sep" />

      {/* Zoom controls */}
      <Btn onClick={() => onZoomChange(Math.max(1, zoomLevel - 1))} title={t('toolbar.zoom_out')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5 11V13H19V11H5Z"></path>
        </svg>
      </Btn>
      <span className="zoom-level" aria-live="polite">{zoomLevel}</span>
      <Btn onClick={() => onZoomChange(Math.min(6, zoomLevel + 1))} title={t('toolbar.zoom_in')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"></path>
        </svg>
      </Btn>
      <div className="toolbar-sep" />

      {/* Group 3 */}
      <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title={t('toolbar.bold')} aria-label={t('toolbar.bold')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 11H12.5C13.8807 11 15 9.88071 15 8.5C15 7.11929 13.8807 6 12.5 6H8V11ZM18 15.5C18 17.9853 15.9853 20 13.5 20H6V4H12.5C14.9853 4 17 6.01472 17 8.5C17 9.70431 16.5269 10.7981 15.7564 11.6058C17.0979 12.3847 18 13.837 18 15.5ZM8 13V18H13.5C14.8807 18 16 16.8807 16 15.5C16 14.1193 14.8807 13 13.5 13H8Z"></path>
        </svg>
      </Btn>
      <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title={t('toolbar.italic')} aria-label={t('toolbar.italic')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M15 20H7V18H9.92661L12.0425 6H9V4H17V6H14.0734L11.9575 18H15V20Z"></path>
        </svg>
      </Btn>
      <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title={t('toolbar.strike')} aria-label={t('toolbar.strike')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.1538 14C17.3846 14.5161 17.5 15.0893 17.5 15.7196C17.5 17.0625 16.9762 18.1116 15.9286 18.867C14.8809 19.6223 13.4335 20 11.5862 20C9.94674 20 8.32335 19.6185 6.71592 18.8555V16.6009C8.23538 17.4783 9.7908 17.917 11.3822 17.917C13.9333 17.917 15.2128 17.1846 15.2208 15.7196C15.2208 15.0939 15.0049 14.5598 14.5731 14.1173C14.5339 14.0772 14.4939 14.0381 14.4531 14H3V12H21V14H17.1538ZM13.076 11H7.62908C7.4566 10.8433 7.29616 10.6692 7.14776 10.4778C6.71592 9.92084 6.5 9.24559 6.5 8.45207C6.5 7.21602 6.96583 6.165 7.89749 5.299C8.82916 4.43299 10.2706 4 12.2219 4C13.6934 4 15.1009 4.32808 16.4444 4.98426V7.13591C15.2448 6.44921 13.9293 6.10587 12.4978 6.10587C10.0187 6.10587 8.77917 6.88793 8.77917 8.45207C8.77917 8.87172 8.99709 9.23796 9.43293 9.55079C9.86878 9.86362 10.4066 10.1135 11.0463 10.3004C11.6665 10.4816 12.3431 10.7148 13.076 11H13.076Z"></path>
        </svg>
      </Btn>
      <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title={t('toolbar.underline')} aria-label={t('toolbar.underline')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 3V12C8 14.2091 9.79086 16 12 16C14.2091 16 16 14.2091 16 12V3H18V12C18 15.3137 15.3137 18 12 18C8.68629 18 6 15.3137 6 12V3H8ZM4 20H20V22H4V20Z"></path>
        </svg>
      </Btn>
      {/* Highlight as horizontal picker */}
      <HighlightPicker editor={editor} />
      <Btn onClick={() => editor.chain().focus()
  .unsetMark('bold')
  .unsetMark('italic')
  .unsetMark('underline')
  .unsetMark('strike')
  .unsetMark('highlight')
  .unsetMark('superscript')
  .unsetMark('subscript')
    .unsetMark('textStyle')
  .run()} title={t('toolbar.clear')} aria-label={t('toolbar.clear')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12.6512 14.0654L11.6047 20H9.57389L10.9247 12.339L3.51465 4.92892L4.92886 3.51471L20.4852 19.0711L19.071 20.4853L12.6512 14.0654ZM11.7727 7.53009L12.0425 5.99999H10.2426L8.24257 3.99999H19.9999V5.99999H14.0733L13.4991 9.25652L11.7727 7.53009Z"></path>
        </svg>
      </Btn>
      <div className="toolbar-sep" />




      {/* Group 4 */}
      <Btn active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title={t('toolbar.superscript')} aria-label={t('toolbar.superscript')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5.59567 5L10.5 10.9283L15.4043 5H18L11.7978 12.4971L18 19.9943V20H15.4091L10.5 14.0659L5.59092 20H3V19.9943L9.20216 12.4971L3 5H5.59567ZM21.5507 6.5803C21.7042 6.43453 21.8 6.22845 21.8 6C21.8 5.55817 21.4418 5.2 21 5.2C20.5582 5.2 20.2 5.55817 20.2 6C20.2 6.07624 20.2107 6.14999 20.2306 6.21983L19.0765 6.54958C19.0267 6.37497 19 6.1906 19 6C19 4.89543 19.8954 4 21 4C22.1046 4 23 4.89543 23 6C23 6.57273 22.7593 7.08923 22.3735 7.45384L20.7441 9H23V10H19V9L21.5507 6.5803V6.5803Z"></path>
        </svg>
      </Btn>
      <Btn active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title={t('toolbar.subscript')} aria-label={t('toolbar.subscript')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5.59567 4L10.5 9.92831L15.4043 4H18L11.7978 11.4971L18 18.9943V19H15.4091L10.5 13.0659L5.59092 19H3V18.9943L9.20216 11.4971L3 4H5.59567ZM21.8 16C21.8 15.5582 21.4418 15.2 21 15.2C20.5582 15.2 20.2 15.5582 20.2 16C20.2 16.0762 20.2107 16.15 20.2306 16.2198L19.0765 16.5496C19.0267 16.375 19 16.1906 19 16C19 14.8954 19.8954 14 21 14C22.1046 14 23 14.8954 23 16C23 16.5727 22.7593 17.0892 22.3735 17.4538L20.7441 19H23V20H19V19L21.5507 16.5803C21.7042 16.4345 21.8 16.2284 21.8 16Z"></path>
        </svg>
      </Btn>
      <div className="toolbar-sep" />

      {/* Group 5 */}
      <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title={t('toolbar.align_left')} aria-label={t('toolbar.align_left')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 4H21V6H3V4ZM3 19H17V21H3V19ZM3 14H21V16H3V14ZM3 9H17V11H3V9Z"/></svg>
      </Btn>
      <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title={t('toolbar.align_center')} aria-label={t('toolbar.align_center')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 4H21V6H3V4ZM5 19H19V21H5V19ZM3 14H21V16H3V14ZM5 9H19V11H5V9Z"/></svg>
      </Btn>
      <Btn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title={t('toolbar.align_right')} aria-label={t('toolbar.align_right')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 4H21V6H3V4ZM7 19H21V21H7V19ZM3 14H21V16H3V14ZM7 9H21V11H7V9Z"/></svg>
      </Btn>
      <Btn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title={t('toolbar.align_justify')} aria-label={t('toolbar.align_justify')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 4H21V6H3V4ZM3 19H21V21H3V19ZM3 14H21V16H3V14ZM3 9H21V11H3V9Z"/></svg>
      </Btn>
      <div className="toolbar-sep" />

      {/* Link right after separator, before Add image */}
      <LinkPicker editor={editor} />

      {/* Group 6 */}
      <input id="_img_input" type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (!f) return;
        const url = URL.createObjectURL(f);
        editor.chain().focus().setImage({ src: url }).run();
        (e.target as HTMLInputElement).value = '';
      }} />
      <Btn onClick={() => (document.getElementById('_img_input') as HTMLInputElement)?.click()} title={t('toolbar.image_add')} aria-label={t('toolbar.image_add')}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M21 15V18H24V20H21V23H19V20H16V18H19V15H21ZM21.0082 3C21.556 3 22 3.44495 22 3.9934V13H20V5H4V18.999L14 9L17 12V14.829L14 11.8284L6.827 19H14V21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082ZM8 7C9.10457 7 10 7.89543 10 9C10 10.1046 9.10457 11 8 11C6.89543 11 6 10.1046 6 9C6 7.89543 6.89543 7 8 7Z"></path>
        </svg>
        <span>{t('toolbar.image_add_label')}</span>
      </Btn>
    </div>

  );
}

