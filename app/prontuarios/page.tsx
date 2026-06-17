import MedicalRecords from "@/components/medical-records/medical-records";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prontuários",
};

export default function Settings() {
  return <MedicalRecords />;
}

