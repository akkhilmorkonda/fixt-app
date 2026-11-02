import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Deny by default: only these exact paths are reachable without a session.
const AUTH_PAGES = new Set(["/sign-in", "/sign-up"]);
// Webhooks and the workers have no session; each authenticates the request
// itself (a connector key for ingest, CRON_SECRET for the scheduler).
const WEBHOOKS = ["/api/ingest", "/api/cron/weekly-summary"];
const PUBLIC_PATHS = new Set([...AUTH_PAGES, "/sso-callback", ...WEBHOOKS]);
// Read-only investigation links for contract manufacturers and suppliers. The
// unguessable token in the path is the credential; the page checks it.
const SHARE = /^\/share\/[A-Za-z0-9_-]{32,64}$/;
const isPublic = (pathname: string) => PUBLIC_PATHS.has(pathname) || SHARE.test(pathname);
// Steps Clerk requires after sign-in (e.g. choosing an organization). The session
// is still pending there, so auth.protect() would bounce it back here forever.
const TASKS = /^\/sign-in\/tasks(\/[a-z-]+)?$/;
// Production only (set in Vercel's Production env): accept session tokens issued
// for this app's origin and nothing else on the parent domain that shares the cookie.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl;

    // A session still waiting on a task counts as signed out everywhere else, so
    // it would bounce between the sign-in form and Clerk's "already signed in".
    // Send it to the task. Webhooks and the SSO callback are left alone.
    if (!TASKS.test(pathname) && (AUTH_PAGES.has(pathname) || !isPublic(pathname))) {
      const { sessionStatus } = await auth({ treatPendingAsSignedOut: false });
      if (sessionStatus === "pending") return NextResponse.redirect(new URL("/sign-in/tasks", req.url));
    }

    if (!isPublic(pathname) && !TASKS.test(pathname)) {
      await auth.protect();
      return;
    }

    // Signed-in users have no reason to see the sign-in / sign-up forms.
    if (AUTH_PAGES.has(pathname) && (await auth()).userId) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  },
  {
    ...(APP_URL ? { authorizedParties: [new URL(APP_URL).origin] } : {}),
    contentSecurityPolicy: {
      directives: {
        "frame-ancestors": ["none"],
        "style-src": ["https://fonts.googleapis.com"],
        "font-src": ["self", "https://fonts.gstatic.com"],
      },
    },
  },
);

export const config = {
  // Run on every request except Next's static build assets and the two public metadata files.
  matcher: ["/((?!_next/static/|icon\\.svg$|robots\\.txt$).*)"],
};
