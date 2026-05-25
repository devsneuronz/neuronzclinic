import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp",
};

export default function ChatsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
