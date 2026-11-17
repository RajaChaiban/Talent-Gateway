import type { Metadata } from "next";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth/current-user";
import { APP_NAME } from "@/lib/config";
import { signOut } from "./actions";
import { SignOutButton } from "./sign-out-button";

/** Default tab title for pages under /app. */
export const metadata: Metadata = {
  title: `Jobs · ${APP_NAME}`,
};

/**
 * Chrome for the recruiter area. It reads the user only to show the email;
 * it is not the access check. A layout does not gate its child pages, so
 * every page under /app calls `requireSignedInUser()` itself.
 */
export default function RecruiterLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-4 px-5">
          <Brand href="/app" />
          <Suspense fallback={<AccountPlaceholder />}>
            <Account />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-8 sm:py-10">
        <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}

async function Account() {
  const check = await getCurrentUser();
  if (check.status !== "signed-in") return null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="hidden min-w-0 truncate text-label-14 sm:inline text-muted-foreground">
        {check.user.email}
      </span>
      <form action={signOut}>
        <SignOutButton />
      </form>
    </div>
  );
}

function AccountPlaceholder() {
  return <div className="h-8 w-24 rounded-md bg-muted" aria-hidden />;
}
