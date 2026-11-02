import "server-only";
import { auth } from "@clerk/nextjs/server";

// The single server-side gate. Every protected page, layout, Server Action and
// Route Handler must call this before reading or changing data. The proxy is
// only the first line of defense: layouts don't re-run on client navigation,
// and Server Actions / Route Handlers aren't covered by layouts at all.
//
// Signed-out page requests are redirected to /sign-in; anything else gets a 404.
export async function requireUser() {
  const { userId } = await auth.protect();
  return userId;
}
