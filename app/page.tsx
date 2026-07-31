"use client";

import Hero from "@/components/marketing/Hero";
import Navbar from "@/components/marketing/Navbar";
import Features from "@/components/marketing/Features";
import HowItWorks from "@/components/marketing/HowItWorks";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
    </>
  );
}
