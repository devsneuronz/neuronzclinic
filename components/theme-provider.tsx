"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import React, { createContext, useEffect, useState } from "react";

type ColorTheme = "default" | "theme-sand" | "theme-blue" | "theme-gray" | "theme-teal";

type ThemeProviderState = {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
};

export const ColorThemeContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemeProvider>) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("tournieux-color-theme") as ColorTheme) || "default";
    }
    return "default";
  });

  useEffect(() => {
    const root = document.documentElement;

    const allThemes: ColorTheme[] = ["default", "theme-sand", "theme-blue", "theme-gray", "theme-teal"];
    allThemes.forEach((t) => root.classList.remove(t));

    root.classList.add(colorTheme);
    localStorage.setItem("tournieux-color-theme", colorTheme);
  }, [colorTheme]);

  const setColorTheme = (theme: ColorTheme) => {
    setColorThemeState(theme);
  };

  return (
    <NextThemeProvider {...props}>
      <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>{children}</ColorThemeContext.Provider>
    </NextThemeProvider>
  );
}
