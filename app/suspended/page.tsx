import { SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const instant = false;

// Where members of a suspended or archived organization land.
export default async function SuspendedPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <main className="grid min-h-dvh place-items-center bg-[#fafafa] p-4 font-sans text-[#1a1a1a]">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center">
        <h1 className="font-heading text-xl font-semibold">This account is paused</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">Your organization&apos;s FIXT account isn&apos;t active right now. Contact FIXT support to turn it back on.</p>
        <div className="mt-5 flex justify-center">
          <SignOutButton>
            <button type="button" className="h-9 rounded-lg border border-zinc-200 px-3.5 text-sm font-medium hover:bg-zinc-50">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
    </main>
  );
}
