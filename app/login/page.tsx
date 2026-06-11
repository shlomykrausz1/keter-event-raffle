import { Suspense } from "react";
import Background from "@/components/Background";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <>
      <Background />
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
