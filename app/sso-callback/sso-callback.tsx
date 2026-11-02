"use client";

import { useRouter } from "next/navigation";
import { HandleSSOCallback } from "@clerk/nextjs";
import { useFinishNavigate } from "../_auth/ui";

// Finishes a Google sign-in/sign-up after Clerk redirects back here.
export default function SSOCallback() {
  const router = useRouter();
  const navigate = useFinishNavigate();
  return (
    <HandleSSOCallback
      navigateToApp={navigate}
      navigateToSignIn={() => router.push("/sign-in")}
      navigateToSignUp={() => router.push("/sign-up")}
    />
  );
}
