"use client";

import { useState } from "react";

export default function StateDemo() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-4 p-8">
      <p>Current state: {isVisible ? "Visible" : "Hidden"}</p>

      <button
        onClick={() => {
          setIsVisible(!isVisible);
        }}
        className="rounded-md bg-slate-900 px-4 py-2 text-white"
      >
        {isVisible ? "Hide Details" : "Show Details"}
      </button>

      {isVisible && (

        <p className="rounded-md bg-slate-100 p-4">

          Welcome to HireIQ 🚀

        </p>

      )}
    </div>
  );
}
