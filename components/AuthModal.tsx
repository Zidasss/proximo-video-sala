"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";
import { X, Mail, Lock, User, LogIn, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { KlipAppLogo } from "./brand/KlipAppLogo";
import styles from "./AuthModal.module.css";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; email: string; name?: string; avatarUrl?: string }) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const confirmationCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      setIsRecovering(false);
      setRecoveryLoading(false);
      setErrorMsg("");
      setSuccessMsg("");
      emailInputRef.current?.focus();
    }, 0);

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      if (confirmationCloseTimerRef.current !== null) {
        window.clearTimeout(confirmationCloseTimerRef.current);
        confirmationCloseTimerRef.current = null;
      }
      document.removeEventListener("keydown", handleDialogKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!isSupabaseConfigured) {
      setErrorMsg(
        "Supabase não configurado. Adicione NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local"
      );
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
          },
        });

        if (error) throw error;

        if (data.user) {
          const userName =
            name.trim() ||
            data.user.user_metadata?.full_name ||
            email.split("@")[0];
          const avatarUrl =
            data.user.user_metadata?.avatar_url ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userName)}`;

          try {
            await supabase.from("profiles").upsert(
              {
                id: data.user.id,
                email: data.user.email || email.trim(),
                name: userName,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
          } catch (profileErr) {
            console.warn("Aviso ao salvar profile:", profileErr);
          }

          const userObj = {
            id: data.user.id,
            email: data.user.email || email.trim(),
            name: userName,
            avatarUrl,
          };
          if (!data.session) {
            setSuccessMsg(
              "Conta criada! Verifique seu e-mail para confirmar o cadastro."
            );
            confirmationCloseTimerRef.current = window.setTimeout(
              () => onCloseRef.current(),
              3000
            );
          } else {
            localStorage.setItem("klip_user", JSON.stringify(userObj));
            onSuccess(userObj);
            onClose();
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data.user) {
          let displayName =
            data.user.user_metadata?.full_name ||
            data.user.email?.split("@")[0] ||
            "Criador";
          let avatarUrl =
            data.user.user_metadata?.avatar_url ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}`;

          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("name, avatar_url")
              .eq("id", data.user.id)
              .maybeSingle();

            if (profile?.name) displayName = profile.name;
            if (profile?.avatar_url) avatarUrl = profile.avatar_url;
          } catch (profileError) {
            console.warn("Não foi possível carregar os dados extras do perfil:", profileError);
          }

          const userObj = {
            id: data.user.id,
            email: data.user.email || email.trim(),
            name: displayName,
            avatarUrl,
          };
          localStorage.setItem("klip_user", JSON.stringify(userObj));
          onSuccess(userObj);
          onClose();
        }
      }
    } catch (err: unknown) {
      console.error("Erro auth:", err);
      let message = err instanceof Error ? err.message : "Erro na autenticação.";
      if (message.includes("Invalid login credentials")) {
        message = "E-mail ou senha incorretos.";
      } else if (message.includes("User already registered")) {
        message = "E-mail já cadastrado. Clique em 'Entrar' para fazer login.";
      } else if (message.includes("Password should be at least")) {
        message = "A senha deve ter no mínimo 6 caracteres.";
      } else if (message.includes("Email not confirmed")) {
        message = "E-mail não confirmado. Verifique sua caixa de entrada.";
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!isSupabaseConfigured) {
      setErrorMsg("A recuperação de acesso está indisponível agora. Tente novamente mais tarde.");
      setRecoveryLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const redirectTo = new URL("/auth/callback?next=/perfil", window.location.origin).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

      if (error) throw error;

      setSuccessMsg("Enviamos um link para o seu e-mail. Verifique também a caixa de spam.");
    } catch (error: unknown) {
      console.error("Erro ao solicitar recuperação de acesso:", error);
      setErrorMsg("Não foi possível enviar o link agora. Aguarde um momento e tente novamente.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const openRecovery = () => {
    setIsRecovering(true);
    setErrorMsg("");
    setSuccessMsg("");
    window.setTimeout(() => emailInputRef.current?.focus(), 0);
  };

  const returnToLogin = () => {
    setIsRecovering(false);
    setIsSignUp(false);
    setRecoveryLoading(false);
    setErrorMsg("");
    setSuccessMsg("");
    window.setTimeout(() => emailInputRef.current?.focus(), 0);
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg("");
    setGoogleLoading(true);

    if (!isSupabaseConfigured) {
      setErrorMsg(
        "Supabase não configurado. Não é possível usar login Google sem o Supabase. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local"
      );
      setGoogleLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/auth/callback`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;

      // signInWithOAuth retorna uma URL para redirecionar.
      // Se a url existe, o browser vai redirecionar automaticamente.
      // Se não retornou url, algo deu errado.
      if (!data?.url) {
        throw new Error(
          "O Supabase não retornou a URL de redirecionamento do Google. Verifique se o provedor Google está habilitado no painel do Supabase (Authentication > Providers > Google)."
        );
      }

      // Redirecionar para o Google OAuth
      window.location.href = data.url;
    } catch (err: unknown) {
      console.error("Erro Google OAuth:", err);
      let message = err instanceof Error ? err.message : "Erro ao iniciar login com Google.";
      if (
        message.includes("provider") ||
        message.includes("Provider")
      ) {
        message =
          "Provedor Google não habilitado. Acesse o Supabase Dashboard → Authentication → Providers → Google e habilite com seu Client ID e Secret do Google Cloud Console.";
      }
      setErrorMsg(message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdropDismiss}
        onClick={onClose}
        tabIndex={-1}
        aria-label="Fechar autenticação"
      />
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="klipapp-auth-title"
        aria-describedby="klipapp-auth-description"
        tabIndex={-1}
      >
        <div className={styles.ambientGlow} aria-hidden="true" />

        <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Fechar autenticação">
          <X aria-hidden="true" />
        </button>

        <header className={styles.header}>
          <div className={styles.brandMark}>
            <KlipAppLogo variant="symbol" width={40} height={40} label="KLIPAPP" />
          </div>
          <p className={styles.eyebrow}>KLIPAPP ID</p>
          <h2 id="klipapp-auth-title">
            {isRecovering ? "Recupere seu acesso" : isSignUp ? "Crie sua conta" : "Que bom ter você de volta"}
          </h2>
          <p id="klipapp-auth-description">
            {isRecovering
              ? "Digite seu e-mail e enviaremos um link seguro para você voltar."
              : isSignUp
              ? "Um acesso para criar, editar e publicar seus melhores momentos."
              : "Entre para continuar criando com a KLIPAPP."}
          </p>
        </header>

        {!isRecovering && (
          <>
            <button
              onClick={handleGoogleSignIn}
              type="button"
              disabled={googleLoading || loading}
              className={styles.googleButton}
              aria-busy={googleLoading}
            >
              {googleLoading ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>Conectando ao Google…</span>
                </>
              ) : (
                <>
                  <svg className={styles.googleIcon} viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.4l3.7 2.9C6.5 7.4 9 5 12 5z" />
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                    <path fill="#FBBC05" d="M5.6 14.7c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.2C.7 9.6 0 12.2 0 15s.7 5.4 1.9 7.8l3.7-2.9z" />
                    <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.2 7.5 23 12 23z" />
                  </svg>
                  <span>Continuar com Google</span>
                </>
              )}
            </button>

            <div className={styles.divider}><span>ou use seu e-mail</span></div>

            <div className={styles.modeSwitch} role="group" aria-label="Escolha o tipo de acesso">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                className={!isSignUp ? styles.modeActive : undefined}
                aria-pressed={!isSignUp}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                className={isSignUp ? styles.modeActive : undefined}
                aria-pressed={isSignUp}
              >
                Criar conta
              </button>
            </div>
          </>
        )}

        <div className={styles.messageRegion} aria-live="polite" aria-atomic="true">
          {errorMsg && (
            <div id="klipapp-auth-error" className={`${styles.message} ${styles.errorMessage}`} role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div id="klipapp-auth-success" className={`${styles.message} ${styles.successMessage}`} role="status">
              <CheckCircle2 aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        <form
          onSubmit={isRecovering ? handlePasswordReset : handleSubmit}
          className={styles.form}
          aria-describedby={errorMsg ? "klipapp-auth-error" : successMsg ? "klipapp-auth-success" : undefined}
        >
          {isSignUp && !isRecovering && (
            <div className={styles.field}>
              <label htmlFor="klipapp-auth-name">Nome</label>
              <div className={styles.inputShell}>
                <User aria-hidden="true" />
                <input
                  id="klipapp-auth-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como podemos chamar você?"
                />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="klipapp-auth-email">E-mail</label>
            <div className={styles.inputShell}>
              <Mail aria-hidden="true" />
              <input
                ref={emailInputRef}
                id="klipapp-auth-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
              />
            </div>
          </div>

          {!isRecovering && (
            <div className={styles.field}>
              <div className={styles.passwordLabelRow}>
                <label htmlFor="klipapp-auth-password">Senha</label>
                {!isSignUp && (
                  <button type="button" className={styles.forgotButton} onClick={openRecovery}>
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <div className={styles.inputShell}>
                <Lock aria-hidden="true" />
                <input
                  id="klipapp-auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignUp ? "Crie uma senha com 6+ caracteres" : "Digite sua senha"}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isRecovering ? recoveryLoading : loading || googleLoading}
            className={styles.primaryButton}
            aria-busy={isRecovering ? recoveryLoading : loading}
          >
            {(isRecovering ? recoveryLoading : loading) ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span>{isRecovering ? "Enviando…" : "Processando…"}</span>
              </>
            ) : (
              <>
                {isRecovering ? <Mail aria-hidden="true" /> : <LogIn aria-hidden="true" />}
                <span>{isRecovering ? "Enviar link de acesso" : isSignUp ? "Criar conta KLIPAPP" : "Entrar na KLIPAPP"}</span>
              </>
            )}
          </button>
        </form>

        {isRecovering && (
          <button
            type="button"
            className={styles.recoveryBackButton}
            onClick={returnToLogin}
            disabled={recoveryLoading}
          >
            <ArrowLeft aria-hidden="true" />
            Voltar ao login
          </button>
        )}

        {!isSupabaseConfigured && (
          <div className={styles.setupWarning} role="status">
            <strong>Supabase não detectado.</strong>
            <span>
              Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no arquivo <code>.env.local</code>.
            </span>
          </div>
        )}

        <p className={styles.legalNote}>
          Ao continuar, você concorda com os termos e a política de privacidade da KLIPAPP.
        </p>
      </div>
    </div>
  );
}
