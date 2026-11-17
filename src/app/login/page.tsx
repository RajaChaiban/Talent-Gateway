import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Brand } from "@/components/brand";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { APP_NAME } from "@/lib/config";
import { LoginForm } from "./login-form";

/** Tab title for the login page. */
export const metadata: Metadata = {
  title: `Sign in · ${APP_NAME}`,
};

/** The sign-in page. A signed-in visitor is redirected away by the proxy before this renders. */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center surface-subtle px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Brand className="self-center" />
        <Card className="gap-6 rounded-xl py-6 [--card-spacing:--spacing(6)] sm:py-8 sm:[--card-spacing:--spacing(8)]">
          <CardHeader className="gap-1.5">
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-[-0.04em]">Welcome back</h1>
            </CardTitle>
            <CardDescription>Sign in to continue to your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<LoginFormSkeleton />}>
              <LoginFormWithNext searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

async function LoginFormWithNext({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  const value = Array.isArray(next) ? next[0] : next;
  return <LoginForm next={safeRedirectPath(value)} />;
}

/**
 * Same size as the form, but inert: the real form, with its `next`, is the
 * only one a visitor can type into.
 */
function LoginFormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading sign-in form">
      {["email", "password"].map((field) => (
        <div key={field} className="flex flex-col gap-2" aria-hidden>
          <div className="h-4 w-16 rounded-sm bg-muted" />
          <div className="h-10 rounded-lg bg-muted" />
        </div>
      ))}
      <div className="h-10 rounded-lg bg-muted" aria-hidden />
    </div>
  );
}
