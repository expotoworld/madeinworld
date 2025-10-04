import React from 'react';
import type { Editor } from '@tiptap/react';

function Btn({ active, onClick, title, children }: React.PropsWithChildren<{ active?: boolean; onClick: ()=>void; title?: string }>) {
  return (
    <button className={`toolbar-btn${active ? ' is-active' : ''}`} onClick={onClick} title={title} type="button">
      {children}
    </button>
  );
}

export default function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting toolbar">
      <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo">⟲</Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo">⟳</Btn>
      <div className="toolbar-sep" />

      <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">B</Btn>
      <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><em>I</em></Btn>
      <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><s>S</s></Btn>
      <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">{`</>`}</Btn>
      <div className="toolbar-sep" />

      <Btn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">H1</Btn>
      <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</Btn>
      <Btn active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} title="Paragraph">¶</Btn>
      <div className="toolbar-sep" />

      <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">• ●</Btn>
      <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">1.</Btn>
      <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">❝ ❞</Btn>
      <Btn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">[code]</Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"></Btn>
      <div className="toolbar-sep" />

      <Btn
        active={editor.isActive('link')}
        onClick={() => {
          const prev = editor.getAttributes('link').href as string | undefined;
          const url = window.prompt('Link URL', prev || 'https://');
          if (url === null) return;
          if (url === '') { editor.chain().focus().unsetLink().run(); return; }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
        title="Insert link"
      >🔗</Btn>
      <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting">⨉</Btn>
    </div>
  );
}

