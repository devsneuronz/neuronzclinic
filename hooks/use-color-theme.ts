import { ColorThemeContext } from "@/components/theme-provider";
import { useContext } from "react";

export function useColorTheme() {
  const context = useContext(ColorThemeContext);

  if (context === undefined) {
    throw new Error("useColorTheme deve ser usado dentro de um ThemeProvider");
  }

  return context;
}

