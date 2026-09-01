import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/layout/logo";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo height={44} priority />
          <p className="mt-3 text-sm text-muted-foreground">
            Sistema de gestión comercial
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {/* useSearchParams exige un límite de Suspense en el App Router. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿Problemas para ingresar? Contacta al administrador del sistema.
        </p>
      </div>
    </main>
  );
}
