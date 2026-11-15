"use client";

// Submit button of the sign-out form in the recruiter layout; it shows a spinner while the action runs.

import { useFormStatus } from "react-dom";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Must be rendered inside the sign-out `<form>`: it reads the form's pending state. */
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
