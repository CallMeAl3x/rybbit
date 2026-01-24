import { PricingSection } from "@/components/PricingSection";
import { ComparisonSection } from "./components/ComparisonSection";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Rybbit pricing plans and features",
};

export default function PricingPage() {
  return (
    <div className="flex flex-col items-center justify-center overflow-x-hidden">
      <PricingSection />
      <ComparisonSection />
    </div>
  );
}
