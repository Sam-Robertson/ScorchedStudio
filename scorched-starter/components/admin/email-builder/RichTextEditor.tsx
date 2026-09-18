"use client";

// Rich text for the Text block.
//
// Tiptap's output is HTML, which is what the email renderer wants, so it is
// stored as HTML rather than as Tiptap's own JSON. That HTML is sanitized on
// the server every time a campaign is saved, never on the way out, because the
// editor is not the only thing that could put content in that column.
import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered, Unlink } from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
};

export default function RichTextEditor({ value, onChange }: Props) {
  const editor = useEditor({
    // Next renders this on the server first, and Tiptap warns unless it is
    // told to wait for hydration.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Neither renders usefully in email, and both would only be stripped
        // by the sanitizer later.
        codeBlock: false,
        horizontalRule: false,
        // Configured here rather than added separately: StarterKit already
        // bundles the link extension, and registering it twice makes Tiptap
        // warn about a duplicate and behave unpredictably.
        link: { openOnClick: false, autolink: true },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[120px] p-3 outline-none",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Keeps the editor in step when the document is replaced underneath it, such
  // as when a template is applied. Guarded on equality: writing the same
  // content back would move the caret to the start on every keystroke.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return <div className="rounded-lg border border-black/20 p-3 text-sm text-neutral-400">Loading…</div>;

  const active = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs) ? "bg-neutral-200" : "hover:bg-neutral-100";

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="rounded-lg border border-black/20 bg-white overflow-hidden">
      <div className="flex flex-wrap gap-0.5 border-b border-black/10 bg-neutral-50 p-1">
        <ToolButton title="Bold" cls={active("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton title="Italic" cls={active("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton
          title="Bulleted list"
          cls={active("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton
          title="Numbered list"
          cls={active("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton title="Add a link" cls={active("link")} onClick={setLink}>
          <Link2 className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton
          title="Remove the link"
          cls="hover:bg-neutral-100"
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink className="w-3.5 h-3.5" />
        </ToolButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolButton({
  title,
  cls,
  onClick,
  children,
}: {
  title: string;
  cls: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} onClick={onClick} className={`rounded p-1.5 ${cls}`}>
      {children}
    </button>
  );
}
