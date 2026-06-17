import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Editor } from "@tiptap/core";
import { Bold, Grid, Image as ImageIcon, Italic, Link2, List, ListOrdered, Palette, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import React from "react";

export const OptionsMenu = ({ editor }: { editor: Editor | null }) => {
  const [editorState, setEditorState] = React.useState({
    isParagraph: false,
    isBold: false,
    canBold: false,
    isItalic: false,
    canItalic: false,
    isUnderline: false,
    isStrike: false,
    canStrike: false,
    isBulletList: false,
    isOrderedList: false,
    isTable: false,
    isLink: false,
    canUndo: false,
    canRedo: false,
    currentColor: "#000000",
  });

  React.useEffect(() => {
    if (!editor) return;

    const updateState = () => {
      setEditorState({
        isParagraph: editor.isActive("paragraph"),
        isBold: editor.isActive("bold"),
        isItalic: editor.isActive("italic"),
        isUnderline: editor.isActive("underline"),
        isStrike: editor.isActive("strike"),
        isBulletList: editor.isActive("bulletList"),
        isOrderedList: editor.isActive("orderedList"),
        isTable: editor.isActive("table"),
        isLink: editor.isActive("link"),

        canBold: editor.can().chain().focus().toggleBold().run(),
        canItalic: editor.can().chain().focus().toggleItalic().run(),
        canStrike: editor.can().chain().focus().toggleStrike().run(),
        canUndo: editor.can().chain().focus().undo().run(),
        canRedo: editor.can().chain().focus().redo().run(),

        currentColor: editor.getAttributes("textStyle").color || "#000000",
      });
    };

    updateState();
    editor.on("transaction", updateState);

    return () => {
      editor.off("transaction", updateState);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").url;
    const url = window.prompt("URL do Link:", previousUrl);

    if (url === null) return; // cancelado
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt("URL da Imagem:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/10 px-3 py-1.5 w-full overflow-x-auto select-none">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!editorState.canBold}
        className={`h-7 w-7 ${editorState.isBold ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!editorState.canItalic}
        className={`h-7 w-7 ${editorState.isItalic ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${editorState.isUnderline ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="h-3.5 w-3.5" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!editorState.canStrike}
        className={`h-7 w-7 ${editorState.isStrike ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </Button>

      <div className="w-[1px] h-4 bg-border mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <Palette className="h-3.5 w-3.5" style={{ color: editorState.currentColor !== "#000000" ? editorState.currentColor : undefined }} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="grid grid-cols-5 gap-1 p-2 min-w-[120px]">
          {["#000000", "#ef4444", "#f97316", "#10b981", "#3b82f6"].map((color) => (
            <button key={color} className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: color }} onClick={() => editor.chain().focus().setColor(color).run()} />
          ))}
          <DropdownMenuItem className="col-span-5 text-[10px] justify-center text-muted-foreground cursor-pointer" onClick={() => editor.chain().focus().unsetColor().run()}>
            Remover cor
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-[1px] h-4 bg-border mx-1" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${editorState.isBulletList ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${editorState.isOrderedList ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Button>

      <div className="w-[1px] h-4 bg-border mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-7 w-7 ${editorState.isTable ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <Grid className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="text-xs">
          <DropdownMenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Inserir Tabela (3x3)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editorState.isTable}>
            Adicionar Coluna
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editorState.isTable}>
            Adicionar Linha
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editorState.isTable} className="text-destructive focus:text-destructive">
            Eliminar Tabela
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-[1px] h-4 bg-border mx-1" />

      <Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${editorState.isLink ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </Button>

      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={addImage}>
        <ImageIcon className="h-3.5 w-3.5" />
      </Button>

      <div className="w-[1px] h-4 bg-border mx-1 ml-auto" />

      <Button type="button" variant="ghost" size="icon" disabled={!editorState.canUndo} className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-3.5 w-3.5" />
      </Button>

      <Button type="button" variant="ghost" size="icon" disabled={!editorState.canRedo} className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

