"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden />
      ) : (
        <LogOut data-icon="inline-start" aria-hidden />
      )}
      Sign out
    </Button>
  );
}
