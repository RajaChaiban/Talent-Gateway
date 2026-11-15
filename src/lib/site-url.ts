/** Origin used when the build does not run on Vercel (local and CI builds). */
export const LOCAL_SITE_URL = "http://localhost:3000";

type Env = Record<string, string | undefined>;

/**
 * The public origin for canonical URLs, Open Graph, robots.txt and the sitemap.
 *
 * On Vercel, `VERCEL_PROJECT_PRODUCTION_URL` is a system environment variable
 * holding the project's production domain without the scheme (for example
 * `my-app.vercel.app`, or the custom domain once one is assigned). It is set
 * in every Vercel environment, including previews and builds, so previews
 * still point their canonical URL at production. Elsewhere the local origin
 * is used. Reading it happens at build time for static routes, so it does not
 * make a page dynamic.
 */
export function siteUrl(env: Env = process.env): string {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : LOCAL_SITE_URL;
}
