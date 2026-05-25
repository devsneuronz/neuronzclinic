import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contatos",
};

export default function ContatosLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
