"use client";

import { useEffect } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user || user.email !== "nwezeifeanyi93@gmail.com") {
        router.push("/dashboard");
      }
    })();
  }, [router]);

  return <>{children}</>;
}
