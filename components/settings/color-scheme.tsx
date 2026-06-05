"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useColorTheme } from "@/hooks/use-color-theme";
import { Tabs } from "@radix-ui/react-tabs";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { TabsList, TabsTrigger } from "../ui/tabs";
import { ThemeCircle } from "./colors";

const colorThemes = [
  { id: "default", name: "Padrão", primary: "#e5ddd5", secondary: "#5e5c47", muted: "#6c6a55" },
  { id: "theme-sand", name: "Areia Premium", primary: "#795548", secondary: "#ffe0b2", muted: "#bcaaa4" },
  { id: "theme-blue", name: "Azul Clássico", primary: "#0b57d0", secondary: "#a8c7fa", muted: "#747775" },
  { id: "theme-gray", name: "Cinza Neutro", primary: "#1f1f1f", secondary: "#e3e3e3", muted: "#757575" },
  // { id: "theme-indigo", name: "Índigo", primary: "#3f51b5", secondary: "#c5cae9", muted: "#7986cb" },
  // { id: "theme-slate", name: "Ardósia", primary: "#455a64", secondary: "#cfd8dc", muted: "#90a4ae" },
  { id: "theme-teal", name: "Teal", primary: "#00695c", secondary: "#b2dfdb", muted: "#4db6ac" },
  //{ id: "theme-green", name: "Verde Botânico", primary: "#2e7d32", secondary: "#c8e6c9", muted: "#81c784" },
  //{ id: "theme-olive", name: "Oliva", primary: "#558b2f", secondary: "#dcedc8", muted: "#aeed91" },
  //{ id: "theme-sage", name: "Sálvia", primary: "#607d8b", secondary: "#b0bec5", muted: "#78909c" },
  //{ id: "theme-mustard", name: "Mostarda", primary: "#fbc02d", secondary: "#fff9c4", muted: "#fff59d" },
  //{ id: "theme-bronze", name: "Bronze", primary: "#4e342e", secondary: "#d7ccc8", muted: "#a1887f" },
  //{ id: "theme-rose", name: "Rosa Chá", primary: "#880e4f", secondary: "#f8bbd0", muted: "#f06292" },
  //{ id: "theme-mauve", name: "Malva", primary: "#4a148c", secondary: "#e1bee7", muted: "#ba68c8" },
  //{ id: "theme-purple", name: "Roxo", primary: "#673ab7", secondary: "#d1c4e9", muted: "#9575cd" },
];

export default function ColorScheme() {
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <Card className="border border-border bg-card shadow-sm w-full mb-0">
      <CardContent className="space-y-6">
        {/* SELETOR DE MODO (Claro / Escuro / Dispositivo) */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Tema</Label>
          <Tabs value={theme} onValueChange={(value) => setTheme(value)} className="w-full">
            <TabsList className="w-full grid-cols-3 gap-1 rounded-full h-11!">
              <TabsTrigger value="light" className="rounded-full gap-2 text-sm font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-foreground  data-[state=active]:border data-[state=active]:border-border">
                <Sun className="h-4 w-4 text-yellow-500 data-[state=active]:animate-pulse" />
                Claro
              </TabsTrigger>

              <TabsTrigger value="dark" className="rounded-full gap-2 text-sm font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:border-border">
                <Moon className="h-4 w-4 text-blue-400" />
                Escuro
              </TabsTrigger>

              <TabsTrigger value="system" className="rounded-full gap-2 text-sm font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border data-[state=active]:border-border">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                Dispositivo
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* SELETOR DE PALETAS DE CORES */}
        <div className="space-y-3 pt-2">
          <Label className="text-sm font-medium text-foreground">Esquema de cores</Label>

          <div className="grid grid-cols-7 gap-4 bg-muted/20 p-4 rounded-xl border border-border/60 justify-items-center overflow-y-auto custom-scrollbar">
            {colorThemes.map((color) => (
              <ThemeCircle key={color.id} {...color} isActive={colorTheme === color.id} onClick={() => setColorTheme(color.id as any)} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
