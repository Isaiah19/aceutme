import { Suspense } from "react";
import GenerateClient from "./GenerateClient";

export default function AdminGeneratePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <GenerateClient />
    </Suspense>
  );
}