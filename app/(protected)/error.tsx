"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const missingConfig = /Missing environment variable/.test(error.message);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {missingConfig ? "Database not connected" : "Something went wrong"}
      </h1>
      <p className="text-sm leading-6 text-zinc-500">
        {missingConfig
          ? "This environment is missing its Supabase settings. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY, then reload."
          : "We couldn't load this page. Try again in a moment."}
      </p>
      <button type="button" onClick={reset} className="mt-2 h-9 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-[#383838]">
        Try again
      </button>
    </div>
  );
}
