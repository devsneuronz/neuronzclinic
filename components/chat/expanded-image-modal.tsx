"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExpandedImageModalProps = {
  image: { url: string; alt: string };
  onClose: () => void;
};

export function ExpandedImageModal({ image, onClose }: ExpandedImageModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-end px-4">
        <Button type="button" variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10 hover:text-white" aria-label="Fechar imagem">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <button type="button" className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={onClose} aria-label="Fechar imagem expandida">
        <span className="relative block h-full max-h-full w-full max-w-6xl">
          <Image src={image.url} alt={image.alt} fill sizes="100vw" className="object-contain" priority unoptimized />
        </span>
      </button>
    </div>
  );
}
