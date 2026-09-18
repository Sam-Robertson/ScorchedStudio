"use client";

// The block list: add, select, reorder, duplicate, delete.
//
// This is the outline of the email rather than a rendering of it. The real
// rendering lives in the preview pane, produced by the send path, so there is
// no second visual implementation here to drift out of step with it.
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { vulfMono } from "@/app/fonts";
import {
  Columns2,
  Copy,
  GripVertical,
  Heading,
  Image as ImageIcon,
  Images,
  Minus,
  MousePointerClick,
  Plus,
  Quote,
  Share2,
  StretchVertical,
  Ticket,
  Trash2,
  Type,
} from "lucide-react";
import {
  BLOCK_LABELS,
  BLOCK_ORDER,
  createBlock,
  htmlToPlainText,
  newBlockId,
  type EmailBlock,
  type EmailBlockType,
} from "@/lib/marketing/email-blocks";
import { useState } from "react";

// One icon per block type, so the menu and the outline can be scanned rather
// than read. Kept next to the labels it pairs with.
const BLOCK_ICONS: Record<EmailBlockType, React.ComponentType<{ className?: string }>> = {
  text: Type,
  heading: Heading,
  image: ImageIcon,
  button: MousePointerClick,
  card: Ticket,
  columns: Columns2,
  imageRow: Images,
  quote: Quote,
  divider: Minus,
  spacer: StretchVertical,
  social: Share2,
};

// A line under each name, because several of these are not obvious from the
// label alone. "Image and text" in particular reads as two separate things.
const BLOCK_HINTS: Record<EmailBlockType, string> = {
  text: "A paragraph",
  heading: "A headline",
  image: "One picture",
  button: "A link people tap",
  card: "Picture, details, book button",
  columns: "Text beside a picture",
  imageRow: "Two or three across",
  quote: "A testimonial",
  divider: "A horizontal line",
  spacer: "Blank space",
  social: "Instagram, Facebook, site",
};

type Props = {
  blocks: EmailBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (blocks: EmailBlock[]) => void;
};

// A one-line summary of a block, so the list reads as the email's outline
// rather than as ten rows all saying "Text".
function summarize(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
      return htmlToPlainText(block.text) || "Empty heading";
    case "text": {
      const text = htmlToPlainText(block.html);
      return text ? text.slice(0, 70) : "Empty text";
    }
    case "image":
      return block.alt || (block.src ? "Image" : "No image chosen");
    case "button":
      return block.label || "Button";
    case "divider":
      return "A horizontal rule";
    case "spacer":
      return `${block.size === "sm" ? "Small" : block.size === "lg" ? "Large" : "Medium"} gap`;
    case "quote":
      return block.text || "Empty quote";
    case "columns":
      return htmlToPlainText(block.title) || "Image and text";
    case "card":
      return htmlToPlainText(block.title) || "Class card";
    case "imageRow": {
      const filled = block.images.filter((i) => i.src.trim()).length;
      return `${block.images.length} across, ${filled} chosen`;
    }
    case "social":
      return "Social links";
    default:
      return "";
  }
}

export default function BlockCanvas({ blocks, selectedId, onSelect, onChange }: Props) {
  const [adding, setAdding] = useState(false);

  const sensors = useSensors(
    // A small distance threshold, so clicking a block to select it is not read
    // as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from === -1 || to === -1) return;
    onChange(arrayMove(blocks, from, to));
  }

  function add(type: EmailBlockType) {
    const block = createBlock(type);
    onChange([...blocks, block]);
    onSelect(block.id);
    setAdding(false);
  }

  function duplicate(block: EmailBlock) {
    const copy = { ...block, id: newBlockId() } as EmailBlock;
    const at = blocks.findIndex((b) => b.id === block.id);
    const next = [...blocks];
    next.splice(at + 1, 0, copy);
    onChange(next);
    onSelect(copy.id);
  }

  function remove(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block) => (
            <SortableBlock
              key={block.id}
              block={block}
              selected={block.id === selectedId}
              onSelect={() => onSelect(block.id)}
              onDuplicate={() => duplicate(block)}
              onRemove={() => remove(block.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && (
        <p className="text-sm text-neutral-400 py-6 text-center">
          This email is empty. Add a block to get started.
        </p>
      )}

      {adding ? (
        <div className="rounded-xl border border-black/10 bg-white p-2">
          <div className="grid grid-cols-1 gap-0.5">
            {BLOCK_ORDER.map((type) => {
              const Icon = BLOCK_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => add(type)}
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-neutral-100"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-500">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm leading-tight text-neutral-800">
                      {BLOCK_LABELS[type]}
                    </span>
                    <span className="block text-xs leading-tight text-neutral-400">
                      {BLOCK_HINTS[type]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className={`${vulfMono.className} mt-1 w-full rounded-lg px-3 py-2 text-xs tracking-[0.1em] text-neutral-400 hover:bg-neutral-100`}
          >
            CANCEL
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`${vulfMono.className} w-full rounded-xl border border-dashed border-black/20 px-4 py-3 text-xs tracking-[0.1em] text-neutral-500 hover:border-[#884A20] hover:text-[#884A20] flex items-center justify-center gap-1.5`}
        >
          <Plus className="w-3.5 h-3.5" /> ADD A BLOCK
        </button>
      )}
    </div>
  );
}

function SortableBlock({
  block,
  selected,
  onSelect,
  onDuplicate,
  onRemove,
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-white ${
        selected ? "border-[#884A20] ring-1 ring-[#884A20]/20" : "border-black/10"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing p-1 text-neutral-300 hover:text-neutral-500"
          aria-label={`Reorder ${BLOCK_LABELS[block.type]}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <button type="button" onClick={onSelect} className="flex flex-1 min-w-0 items-center gap-2 text-left px-1">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-400">
            {(() => {
              const Icon = BLOCK_ICONS[block.type];
              return <Icon className="h-3.5 w-3.5" />;
            })()}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`${vulfMono.className} block text-[10px] uppercase tracking-[0.1em] text-neutral-400`}>
              {BLOCK_LABELS[block.type]}
            </span>
            <span className="block text-sm text-neutral-700 truncate">{summarize(block)}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicate"
          className="p-1.5 text-neutral-300 hover:text-neutral-600"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Delete"
          className="p-1.5 text-neutral-300 hover:text-red-500"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
