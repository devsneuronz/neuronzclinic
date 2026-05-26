"use client";

import { ArrowRight, BrainCircuit, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSession } from "@/lib/auth-session";

type AuthState = "idle" | "loading" | "resetting";

type SupabaseAuthResponse = {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  msg?: string;
  message?: string;
  error_description?: string;
};

function getSupabaseAuthUrl(path: string) {
  const restUrl = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const baseUrl = supabaseUrl ?? restUrl?.replace(/\/rest\/v1\/?$/, "");

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/$/, "")}/auth/v1/${path.replace(/^\//, "")}`;
}

function getAuthErrorMessage(message?: string) {
  if (!message) {
    return "Não foi possível completar o login. Tente novamente.";
  }

  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Email ou senha inválidos.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "Confirme seu email antes de entrar.";
  }

  return message;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [state, setState] = useState<AuthState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isLoading = state === "loading";
  const isResetting = state === "resetting";

  const authHeaders = useMemo(() => {
    if (!publishableKey) {
      return null;
    }

    return {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
    };
  }, [publishableKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const authUrl = getSupabaseAuthUrl("token?grant_type=password");

    if (!authUrl || !authHeaders) {
      setError("Configure as variáveis públicas do Supabase para habilitar o login.");
      return;
    }

    setState("loading");

    try {
      const response = await fetch(authUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as SupabaseAuthResponse;

      if (!response.ok) {
        throw new Error(getAuthErrorMessage(data?.msg ?? data?.message ?? data?.error_description));
      }

      saveSession(data, rememberDevice);
      router.push("/");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Não foi possível entrar agora.");
    } finally {
      setState("idle");
    }
  }

  async function handlePasswordReset() {
    setError("");
    setNotice("");

    if (!email) {
      setError("Informe seu email para recuperar a senha.");
      return;
    }

    const recoverUrl = getSupabaseAuthUrl("recover");

    if (!recoverUrl || !authHeaders) {
      setError("Configure as variáveis públicas do Supabase para habilitar a recuperação.");
      return;
    }

    setState("resetting");

    try {
      const response = await fetch(recoverUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as SupabaseAuthResponse | null;

      if (!response.ok) {
        throw new Error(getAuthErrorMessage(data?.msg ?? data?.message ?? data?.error_description));
      }

      setNotice("Enviamos as instruções de recuperação para o email informado.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Não foi possível enviar a recuperação.");
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="w-full py-8 flex items-center justify-center bg-theme-primary/20">
      <div className="flex flex-row justify-center lg:h-full lg:bg-card text-foreground p-4 lg:pr-0 rounded-[48px] lg:border border-border/70">
        <section className="overflow-hidden relative hidden lg:block rounded-4xl aspect-3/4 bg-popover">
          <div
            className="absolute inset-0 top-1/2 left-1/2 -translate-1/2 w-[calc(100vh-92px)] bg-cover aspect-4/3 rotate-90 bg-center opacity-90"
            style={{
              backgroundImage: "var(--login-background)",
            }}
          >
            <div className="absolute inset-0 mix-blend-color opacity-90 bg-theme-primary" />
            <div
              className="absolute h-full backdrop-blur-xl right-0 w-4/5 "
              style={{
                WebkitMaskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
                maskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
              }}
            />
          </div>
          <div className="relative flex h-full flex-col justify-between px-12 py-10">
            <Image src="/logos/logo-full-dark.png" alt="Neuronz Clinic" width={196} height={76} priority className="h-auto w-44" />
            <div className="flex flex-col gap-20">
              <div className="max-w-md space-y-6">
                <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-xs">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Atendimento inteligente
                </div>
                <div className="space-y-4">
                  <h1 className="text-3xl font-semibold leading-tight text-white">Sua clínica pronta para atender com clareza.</h1>
                  <p className="text-sm leading-6 text-white/70">Acesse conversas, agenda e tarefas em uma rotina visualmente limpa, com a calma que o cuidado pede.</p>
                </div>
              </div>
              <div className="grid gap-2.5 text-xs text-white/80">
                {["Fluxos de atendimento centralizados", "Agenda e tarefas no mesmo painel", "Base preparada para Supabase Auth"].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        {/* Formulário de Login */}
        <section className="flex items-center justify-center px-5 py-8 sm:px-8">
          <div className="lg:min-w-125">
            <div className="mb-8 flex justify-center lg:hidden">
              <Image src="/logos/logo-full-light.png" alt="Neuronz Clinic" width={190} height={74} priority className="h-auto w-40 dark:invert" />
            </div>
            <div className="rounded-xl border border-border/70 bg-card lg:border-0 p-6 sm:p-8 lg:mx-10 shadow-xl lg:shadow-none">
              <div className="space-y-1.5 text-center lg:text-left">
                <h1 className="text-4xl font-semibold tracking-tight text-theme-fg">Entrar</h1>
                <p className="text-sm text-muted-foreground">Faça login para acessar o painel da clínica.</p>
              </div>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4.5">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-medium text-foreground/80">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input id="email" type="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 bg-secondary/40 pl-9 text-sm rounded-md" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-xs font-medium text-foreground/80">
                    Senha
                  </label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Sua senha"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-10 bg-secondary/40 pl-9 pr-9 text-sm rounded-md"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={isLoading || isResetting}
                    className="ml-auto block text-xs font-medium text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-60 cursor-pointer"
                  >
                    {isResetting ? "Enviando..." : "Esqueceu sua senha?"}
                  </button>
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border/50 bg-secondary/20 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/40 select-none">
                  <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} className="h-3.5 w-3.5 accent-primary cursor-pointer rounded-sm" />
                  <span>Lembrar este navegador/dispositivo</span>
                </label>
                {error ? <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}
                {notice ? <p className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">{notice}</p> : null}
                <Button type="submit" className="h-10 w-full gap-2 font-medium cursor-pointer bg-theme-primary text-white hover:bg-theme-primary/90" disabled={isLoading || isResetting}>
                  Entrar
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
