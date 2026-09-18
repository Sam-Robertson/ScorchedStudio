"use client";

// Formatting for single-line fields: headings, and the titles on card and
// image-and-text blocks.
//
// Deliberately not the full RichTextEditor. A heading is one line, so lists,
// blockquotes, and extra paragraphs have no meaning there, and a paragraph
// inside an <h2> is invalid markup that email clients recover from
// unpredictably. Every block node is switched off, Enter is swallowed, and the
// paragraph Tiptap requires as its root is stripped on the way out.
import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, Underline, Unlink } from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

// Tiptap always wraps its content in a block node. The stored value is inline
// markup, so that wrapper is removed here rather than being sanitized away
// later, which would take the formatting with it.
function stripWrapper(html: string): string {
  const once = html.trim().replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "");
  // A value that still holds a paragraph tag had more than one block in it,
  // which the editor should have prevented; joining them keeps the words.
  return once.replace(/<\/p>\s*<p[^>]*>/gi, " ").replace(/<\/?p[^>]*>/gi, "");
}

export default function InlineTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        // StarterKit already bundles link; configuring it here avoids
        // registering the extension twice.
        link: { openOnClick: false, autolink: true },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "min-h-[38px] px-3 py-2 text-sm outline-none",
      },
      handleKeyDown: (_view, event) => {
        // One line means one line. Without this, Enter splits the heading into
        // two paragraphs and the second one gets flattened on save.
        if (event.key === "Enter") return true;
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(stripWrapper(e.getHTML())),
  });

  useEffect(() => {
    if (editor && value !== stripWrapper(editor.getHTML())) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="rounded-lg border border-black/20 px-3 py-2 text-sm text-neutral-400">Loading…</div>;
  }

  const active = (name: string) =>
    editor.isActive(name) ? "bg-neutral-200" : "hover:bg-neutral-100";

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
        <Tool title="Bold" cls={active("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-3.5 h-3.5" />
        </Tool>
        <Tool title="Italic" cls={active("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-3.5 h-3.5" />
        </Tool>
        <Tool
          title="Underline"
          cls={active("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="w-3.5 h-3.5" />
        </Tool>
        <Tool title="Add a link" cls={active("link")} onClick={setLink}>
          <Link2 className="w-3.5 h-3.5" />
        </Tool>
        <Tool
          title="Remove the link"
          cls="hover:bg-neutral-100"
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink className="w-3.5 h-3.5" />
        </Tool>
      </div>
      {/* The placeholder sits behind the editor rather than above it, so it
          cannot push the caret around or swallow a click. */}
      <div className="relative">
        {placeholder && !editor.getText().trim() && (
          <span className="absolute left-3 top-2 text-sm text-neutral-300 pointer-events-none select-none">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Tool({
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
