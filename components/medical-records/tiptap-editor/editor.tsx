import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { OptionsMenu } from "./options-menu";
import "./style.css";

interface EditorProps {
  disabled: boolean;
}

export default function Editor({ disabled }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-theme-primary underline cursor-pointer" },
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-lg border max-w-full my-4" },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: "border-collapse table-auto w-full my-3" },
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    editorProps: {
      attributes: {
        class: "overflow-y-auto custom-scrollbar px-3 py-2 outline-none prose prose-sm focus:outline-none h-[261px] text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50",
      },
    },
  });

  return (
    <div className="h-full">
      <OptionsMenu editor={editor} />
      {!disabled && <EditorContent editor={editor} />}
    </div>
  );
}

