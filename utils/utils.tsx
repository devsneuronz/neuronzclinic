import React from "react";

export function formatBoldText(text: string): React.ReactNode {
  if (!text) return "";

  const parts = text.split(/(\*[^*]+\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      const cleanText = part.slice(1, -1);
      return (
        <b key={`bold-${index}`} className="font-bold">
          {cleanText}
        </b>
      );
    }

    return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
  });
}

