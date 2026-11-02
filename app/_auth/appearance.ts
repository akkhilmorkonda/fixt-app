// Makes Clerk's prebuilt components (session tasks, user menu) match the FIXT auth pages.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#000000",
    colorText: "#1a1a1a",
    colorTextSecondary: "#71717a",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-geist-sans), Arial, sans-serif",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0",
    card: "shadow-none border-0 bg-transparent p-0",
    headerTitle: "font-heading tracking-tight",
    formButtonPrimary: "h-11 bg-black hover:bg-[#383838] normal-case text-sm font-medium",
    footer: "hidden",
  },
};
