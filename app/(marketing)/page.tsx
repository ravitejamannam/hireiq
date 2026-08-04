"use client";

import Hero from "@/components/marketing/Hero";
import Navbar from "@/components/marketing/Navbar";
import Features from "@/components/marketing/Features";
import HowItWorks from "@/components/marketing/HowItWorks";
import Trust from "@/components/trust/Trust";
import Faq from "@/components/faq/Faq";
import CallToAction from "@/components/cta/CallToAction";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Trust />
      <Faq />
      <CallToAction />
    </>
  );
}
/*
import StateDemo from "@/components/playground/StateDemo";

export default function HomePage() {

  return <StateDemo />;

}
*/