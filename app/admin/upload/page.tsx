import { Suspense } from "react";
import UploadClient from "./UploadClient";

export default function AdminUploadPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <UploadClient />
    </Suspense>
  );
}