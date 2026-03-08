import { Suspense } from "react";
import AdminLoginClient from "./AdminLoginClient";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <AdminLoginClient />
    </Suspense>
  );
}