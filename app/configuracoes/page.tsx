import type { Metadata } from "next";
import SettingsPage from "@/components/settings/settings";

export const metadata: Metadata = {
  title: "Configurações",
};

export default function Settings() {
  return <SettingsPage />;
}
