import { Suspense } from "react";
import AdminLoginClient from "./AdminLoginClient";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <AdminLoginClient />
    </Suspense>
  );
}