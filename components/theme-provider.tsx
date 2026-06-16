"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import React, { createContext, useEffect, useState } from "react";

export type ColorTheme = "default" | "theme-sand" | "theme-blue" | "theme-gray" | "theme-teal";

type ThemeProviderState = {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
};

export const ColorThemeContext = createContext<ThemeProviderState | undefined>(undefined);

const COLOR_THEME_STORAGE_KEY = "tournieux-color-theme";
const COLOR_THEMES: ColorTheme[] = ["default", "theme-sand", "theme-blue", "theme-gray", "theme-teal"];

function isColorTheme(value: string | null): value is ColorTheme {
  return COLOR_THEMES.includes(value as ColorTheme);
}

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemeProvider>) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    if (typeof window === "undefined") return "default";

    const savedTheme = localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return isColorTheme(savedTheme) ? savedTheme : "default";
  });

  useEffect(() => {
    const root = document.documentElement;

    COLOR_THEMES.forEach((theme) => root.classList.remove(theme));

    root.classList.add(colorTheme);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
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
