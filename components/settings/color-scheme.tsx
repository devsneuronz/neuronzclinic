"use client";

import { Label } from "@/components/ui/label";
import { useColorTheme } from "@/hooks/use-color-theme";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ColorTheme } from "../theme-provider";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { ThemeCircle } from "./colors";

type ThemeMode = "light" | "dark" | "system";

const colorThemes: Array<{ id: ColorTheme; name: string; primary: string; secondary: string; muted: string; surface: string }> = [
  { id: "default", name: "Padrão", primary: "#e5ddd5", secondary: "#5e5c47", muted: "#6c6a55", surface: "#e5ddd5" },
  { id: "theme-grey", name: "Neutro", primary: "#242424", secondary: "#e5e7eb", muted: "#9ca3af", surface: "#f8fafc" },
  { id: "theme-sand", name: "Areia", primary: "#6f4f37", secondary: "#f3d7ad", muted: "#c6a995", surface: "#f4ead6" },
  { id: "theme-blue", name: "Azul", primary: "#2563eb", secondary: "#bfdbfe", muted: "#93a4bd", surface: "#edf5ff" },
  { id: "theme-teal", name: "Oceano", primary: "#0f766e", secondary: "#99f6e4", muted: "#5eead4", surface: "#eefbf8" },
  { id: "theme-indigo", name: "Índigo", primary: "#4f46e5", secondary: "#c7d2fe", muted: "#818cf8", surface: "#f1f3ff" },
  { id: "theme-green", name: "Verde", primary: "#2f855a", secondary: "#bbf7d0", muted: "#86efac", surface: "#f0fbf4" },
  { id: "theme-rose", name: "Rosa", primary: "#be185d", secondary: "#fbcfe8", muted: "#f472b6", surface: "#fff1f7" },
  { id: "theme-purple", name: "Roxo", primary: "#7c3aed", secondary: "#ddd6fe", muted: "#a78bfa", surface: "#f7f2ff" },
  { id: "theme-slate", name: "Cinza", primary: "#475569", secondary: "#cbd5e1", muted: "#94a3b8", surface: "#f1f5f9" },
];

export default function ColorScheme() {
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  const selectedTheme: ThemeMode = theme === "light" || theme === "dark" || theme === "system" ? theme : "system";

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="space-y-5">
        <div className="space-y-2.5">
          <div>
            <Label className="text-sm font-semibold text-foreground">Modo de exibição</Label>
            <p className="mt-1 text-xs text-muted-foreground">Escolha entre claro, escuro ou a preferência do dispositivo.</p>
          </div>

          <Tabs value={selectedTheme} onValueChange={(value) => setTheme(value as ThemeMode)} className="w-full">
            <TabsList className="grid h-11! w-full grid-cols-3 gap-1 rounded-full bg-secondary/50 p-1">
              <TabsTrigger value="light" className="rounded-full gap-1.5 text-xs font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs sm:text-sm">
                <Sun className="h-3.5 w-3.5 text-yellow-500" />
                <span className="truncate">Claro</span>
              </TabsTrigger>

              <TabsTrigger value="dark" className="rounded-full gap-1.5 text-xs font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs sm:text-sm">
                <Moon className="h-3.5 w-3.5 text-blue-400" />
                <span className="truncate">Escuro</span>
              </TabsTrigger>

              <TabsTrigger value="system" className="rounded-full gap-1.5 text-xs font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs sm:text-sm">
                <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">Dispositivo</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold text-foreground">Paleta do sistema</Label>
            <p className="mt-1 text-xs text-muted-foreground">A cor afeta botões, abas, realces e áreas de navegação.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {colorThemes.map((color) => (
              <ThemeCircle key={color.id} {...color} isActive={colorTheme === color.id} onClick={() => setColorTheme(color.id)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
