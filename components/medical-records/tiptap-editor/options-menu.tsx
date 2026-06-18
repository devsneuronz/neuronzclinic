import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Editor } from "@tiptap/core";
import { Bold, Grid, Image as ImageIcon, Italic, Link2, List, ListOrdered, Palette, Redo2, Strikethrough, Underline, Undo2, Upload, X } from "lucide-react";
import React from "react";

type InsertDialog = "image" | "link" | null;

export const OptionsMenu = ({ editor }: { editor: Editor | null }) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [dialog, setDialog] = React.useState<InsertDialog>(null);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [selectedFileName, setSelectedFileName] = React.useState("");
  const [selectedFileDataUrl, setSelectedFileDataUrl] = React.useState("");
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

  const openLinkDialog = () => {
    setLinkUrl(editor.getAttributes("link").href || editor.getAttributes("link").url || "");
    setDialog("link");
  };

  const openImageDialog = () => {
    setImageUrl("");
    setSelectedFileName("");
    setSelectedFileDataUrl("");
    setDialog("image");
  };

  const closeDialog = () => setDialog(null);

  const applyLink = () => {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) return;

    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmedUrl }).run();
    closeDialog();
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    closeDialog();
  };

  const applyImage = () => {
    const source = selectedFileDataUrl || imageUrl.trim();
    if (!source) return;

    editor.chain().focus().setImage({ src: source }).run();
    closeDialog();
  };

  const selectImageFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    setSelectedFileName(file.name);
    setSelectedFileDataUrl(dataUrl);
    if (!imageUrl.trim()) {
      setImageUrl("");
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

      <Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${editorState.isLink ? "bg-theme-primary/10 text-theme-primary" : "text-muted-foreground hover:text-foreground"}`} onClick={openLinkDialog}>
        <Link2 className="h-3.5 w-3.5" />
      </Button>

      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={openImageDialog}>
        <ImageIcon className="h-3.5 w-3.5" />
      </Button>

      <div className="w-[1px] h-4 bg-border mx-1 ml-auto" />

      <Button type="button" variant="ghost" size="icon" disabled={!editorState.canUndo} className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-3.5 w-3.5" />
      </Button>

      <Button type="button" variant="ghost" size="icon" disabled={!editorState.canRedo} className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={dialog === "link"} onOpenChange={(open) => setDialog(open ? "link" : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar link</DialogTitle>
            <DialogDescription>Cole a URL que será vinculada ao texto selecionado.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="medical-record-link-url">URL</Label>
            <Input
              id="medical-record-link-url"
              autoFocus
              placeholder="https://..."
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyLink();
              }}
            />
          </div>

          <DialogFooter>
            {editorState.isLink && (
              <Button type="button" variant="outline" className="mr-auto gap-2" onClick={removeLink}>
                <X className="h-4 w-4" />
                Remover
              </Button>
            )}
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button type="button" disabled={!linkUrl.trim()} onClick={applyLink}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "image"} onOpenChange={(open) => setDialog(open ? "image" : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar imagem</DialogTitle>
            <DialogDescription>Escolha uma imagem do dispositivo ou cole uma URL pública.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="device" className="gap-4">
            <TabsList className="w-full">
              <TabsTrigger value="device">Dispositivo</TabsTrigger>
              <TabsTrigger value="url">Link</TabsTrigger>
            </TabsList>

            <TabsContent value="device" className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void selectImageFile(event.target.files?.[0])}
              />

              <button
                type="button"
                className="flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:bg-muted/35"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-theme-primary/10 text-theme-primary">
                  <Upload className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-foreground">{selectedFileName || "Selecionar imagem"}</span>
                <span className="text-xs text-muted-foreground">PNG, JPG, WEBP ou outro formato de imagem do seu dispositivo.</span>
              </button>
            </TabsContent>

            <TabsContent value="url" className="space-y-2">
              <Label htmlFor="medical-record-image-url">URL da imagem</Label>
              <Input
                id="medical-record-image-url"
                placeholder="https://..."
                value={imageUrl}
                onChange={(event) => {
                  setImageUrl(event.target.value);
                  if (event.target.value.trim()) {
                    setSelectedFileName("");
                    setSelectedFileDataUrl("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyImage();
                }}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button type="button" disabled={!selectedFileDataUrl && !imageUrl.trim()} onClick={applyImage}>
              Inserir imagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
