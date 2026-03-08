"use client";

import { useState } from "react";

export default function GeneratePage() {
  const [loading,setLoading] = useState(false);

  async function generate() {
    setLoading(true);

    await fetch("/api/admin/generate-questions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        subject_id:1,
        subject:"English",
        topic:"Lexis and Structure",
        year:2017,
        difficulty:"medium",
        count:20
      })
    });

    setLoading(false);
    alert("Questions generated");
  }

  return (
    <div className="p-8">
      <button
        onClick={generate}
        className="bg-black text-white px-6 py-3 rounded-xl"
      >
        {loading ? "Generating..." : "Generate Questions"}
      </button>
    </div>
  );
}
