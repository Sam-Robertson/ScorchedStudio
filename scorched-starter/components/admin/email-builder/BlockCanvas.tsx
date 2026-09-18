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
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
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
        <div className="rounded-xl border border-black/10 p-2 grid grid-cols-2 gap-1">
          {BLOCK_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add(type)}
              className="rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100"
            >
              {BLOCK_LABELS[type]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="col-span-2 rounded-lg px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-100"
          >
            Cancel
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

        <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left px-1">
          <div className={`${vulfMono.className} text-[10px] uppercase tracking-[0.1em] text-neutral-400`}>
            {BLOCK_LABELS[block.type]}
          </div>
          <div className="text-sm text-neutral-700 truncate">{summarize(block)}</div>
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
