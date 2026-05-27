"use client";

import { useColorTheme } from "@/hooks/use-color-theme";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState } from "react";

interface LogoProps {
  isCollapsed: boolean;
  className?: string | undefined;
}

export function Logo({ isCollapsed, className }: LogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const { colorTheme } = useColorTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={cn("h-10", isCollapsed ? "w-10" : "w-32")} />;
  }

  let src = "/logos/logo-full-dark.png";

  const usarLogoClara = resolvedTheme === "dark" || colorTheme === "default";

  if (isCollapsed) {
    src = usarLogoClara ? "/logos/logo-icon-dark.png" : "/logos/logo-icon-light.png";
  } else {
    src = usarLogoClara ? "/logos/logo-full-dark.png" : "/logos/logo-full-light.png";
  }

  return (
    <div className={cn("flex w-full items-center px-3", className)}>
      <div className="relative transition-all duration-300 ease-in-out">
        <div className="flex h-15 w-22 items-center">
          <Image src={src} alt="Logo Tournieux" height={40} width={150} priority />
        </div>
      </div>
    </div>
  );
}
