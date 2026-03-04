"use client";

import { useSearchParams } from "next/navigation";

export default function LoginClient() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";

  // your existing login UI here…
  return (
    <div>
      {/* example */}
      <h1>Admin Login</h1>
      <p>After login, redirect to: {next}</p>
    </div>
  );
}
