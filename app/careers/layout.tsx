import Footer from "@/components/marketing/Footer";
import Navbar from "@/components/marketing/Navbar";

/** Colocate with Neon ap-southeast-1 — US→SG round-trips made demos feel broken. */
export const preferredRegion = "sin1";

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
