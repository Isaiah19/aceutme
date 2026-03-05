// app/practice/page.tsx
import { Suspense } from "react";
import PracticeClient from "./PracticeClient";

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading practice...</div>}>
      <PracticeClient />
    </Suspense>
  );
}