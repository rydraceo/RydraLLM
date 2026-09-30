import type { ReactNode } from "react";
import Copilot from "@/app/components/copilot";

// Wraps every /merchant/* tab so the Copilot is available on Dashboard, Outreach,
// Campaign, Clients and Barbers. If you already have a layout here, just add <Copilot />.
export default function MerchantLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Copilot />
    </>
  );
}
