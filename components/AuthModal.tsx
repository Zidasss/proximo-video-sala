"use client";

import React, { useState } from "react";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";
import { X, Mail, Lock, User, LogIn, Sparkles, CheckCircle2, Zap, AlertCircle } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; email: string; name?: string; avatarUrl?: string }) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleDemoLogin = () => {
    const demoUser = {
      id: "creator-" + Date.now().toString(36),
      email: "criador@klip.app",
      name: name.trim() || "Criador de Conteúdo",
      avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=KlipCreator",
    };
    localStorage.setItem("klip_user", JSON.stringify(demoUser));
    onSuccess(demoUser);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (!isSupabaseConfigured) {
        // Modo local de demonstração
        setTimeout(() => {
          setLoading(false);
          const demoUser = {
            id: "user-" + Math.random().toString(36).substring(2, 9),
            email: email.trim() || "criador@klip.app",
            name: name.trim() || email.split("@")[0] || "Criador Klip",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email || "Klip")}`,
          };
          localStorage.setItem("klip_user", JSON.stringify(demoUser));
          onSuccess(demoUser);
          onClose();
        }, 500);
        return;
      }

      const supabase = createClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          const userName = name.trim() || data.user.user_metadata?.full_name || email.split("@")[0];

          try {
            await supabase.from("profiles").upsert(
              {
                id: data.user.id,
                email: data.user.email || email.trim(),
                name: userName,
                avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userName)}`,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
          } catch (profileErr) {
            console.warn("Aviso ao salvar profile:", profileErr);
          }

          if (!data.session) {
            setSuccessMsg("Conta criada com sucesso! Verifique seu e-mail para confirmar seu cadastro.");
            const userObj = {
              id: data.user.id,
              email: data.user.email || email.trim(),
              name: userName,
              avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userName)}`,
            };
            localStorage.setItem("klip_user", JSON.stringify(userObj));
            onSuccess(userObj);
            setTimeout(onClose, 2000);
          } else {
            setSuccessMsg("Conta criada e autenticada com sucesso!");
            const userObj = {
              id: data.user.id,
              email: data.user.email || email.trim(),
              name: userName,
              avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userName)}`,
            };
            localStorage.setItem("klip_user", JSON.stringify(userObj));
            onSuccess(userObj);
            setTimeout(onClose, 900);
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data.user) {
          let displayName = data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "Criador";
          let avatarUrl = data.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}`;

          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("name, avatar_url")
              .eq("id", data.user.id)
              .maybeSingle();

            if (profile?.name) displayName = profile.name;
            if (profile?.avatar_url) avatarUrl = profile.avatar_url;
          } catch (pErr) {
            console.warn("Aviso ao buscar profile:", pErr);
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
    } catch (err: any) {
      console.error("Erro auth:", err);
      let message = err.message || "Erro na autenticação. Verifique os dados.";
      if (message.includes("Invalid login credentials")) {
        message = "E-mail ou senha incorretos. Por favor, tente novamente.";
      } else if (message.includes("User already registered")) {
        message = "Este e-mail já está cadastrado. Clique em 'Entrar' para fazer login.";
      } else if (message.includes("Password should be at least")) {
        message = "A senha deve conter no mínimo 6 caracteres.";
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      const demoUser = {
        id: "google-demo-user",
        email: "google.user@klip.app",
        name: "Google Criador",
        avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=GoogleCriador",
      };
      localStorage.setItem("klip_user", JSON.stringify(demoUser));
      onSuccess(demoUser);
      onClose();
      return;
    }

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/auth/callback`;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
        },
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao iniciar login com Google.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(10, 11, 11, 0.85)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="relative w-full max-w-md p-6 rounded-3xl text-[#fff8f5] shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #241b1be8, #151717f5)",
          border: "1px solid rgba(255, 113, 96, 0.28)",
          boxShadow: "0 28px 70px rgba(0, 0, 0, 0.7)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-[#9e9791] hover:text-white transition"
          style={{ background: "rgba(255,255,255,0.06)" }}
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-2.5 shadow-lg"
            style={{
              background: "linear-gradient(135deg, #ff7564, #d84f41)",
              boxShadow: "0 8px 24px rgba(255, 107, 92, 0.35)",
            }}
          >
            <Sparkles className="w-6 h-6 text-[#24100e]" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-[#fff8f5]">
            {isSignUp ? "Criar Conta no Klip" : "Acessar Conta Klip"}
          </h2>
          <p className="text-xs text-[#bcb4ae] mt-1">
            Autenticação Supabase conectada ao YouTube, TikTok e Instagram
          </p>
        </div>

        {/* Tab Switcher */}
        <div
          className="flex p-1 rounded-xl mb-4"
          style={{
            background: "#101111",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className="flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer"
            style={{
              background: !isSignUp ? "#ff6b5c" : "transparent",
              color: !isSignUp ? "#25100e" : "#a8a09a",
            }}
          >
            Entrar (Login)
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className="flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer"
            style={{
              background: isSignUp ? "#ff6b5c" : "transparent",
              color: isSignUp ? "#25100e" : "#a8a09a",
            }}
          >
            Criar Conta
          </button>
        </div>

        {errorMsg && (
          <div
            className="mb-3.5 p-3 rounded-xl text-xs flex items-center gap-2"
            style={{
              background: "rgba(220, 38, 38, 0.12)",
              border: "1px solid rgba(220, 38, 38, 0.35)",
              color: "#ff9990",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-[#ff7160]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            className="mb-3.5 p-3 rounded-xl text-xs flex items-center gap-2"
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "#6ee7b7",
            }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#10b981]" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp && (
            <div>
              <label className="block text-[11px] font-bold text-[#cfc7c1] mb-1 uppercase tracking-wider">
                Nome completo ou Canal
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-[#8a827c]" />
                <input
                  type="text"
                  required={isSignUp}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Rafael Santos"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs text-[#fff8f5] placeholder-[#6e6863] focus:outline-none transition"
                  style={{
                    background: "#0f1010",
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-[#cfc7c1] mb-1 uppercase tracking-wider">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-[#8a827c]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs text-[#fff8f5] placeholder-[#6e6863] focus:outline-none transition"
                style={{
                  background: "#0f1010",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#cfc7c1] mb-1 uppercase tracking-wider">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-[#8a827c]" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs text-[#fff8f5] placeholder-[#6e6863] focus:outline-none transition"
                style={{
                  background: "#0f1010",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-xs font-black shadow-lg transition flex items-center justify-center gap-2 mt-3 cursor-pointer disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #ff7564, #d84f41)",
              border: "1px solid #ff7160",
              color: "#25100e",
              boxShadow: "0 6px 18px rgba(255, 107, 92, 0.35)",
            }}
          >
            <LogIn className="w-4 h-4" />
            {loading ? "Processando..." : isSignUp ? "Cadastrar e Entrar" : "Entrar com E-mail"}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#ffffff18]"></div>
          </div>
          <div className="relative flex justify-center text-[11px]">
            <span className="px-2 text-[#857e79]" style={{ background: "#1c1718" }}>
              ou acesse com
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleGoogleSignIn}
            type="button"
            className="py-2.5 px-3 rounded-xl text-xs font-bold text-[#f3ece7] hover:text-white transition flex items-center justify-center gap-2 cursor-pointer"
            style={{
              background: "#1c1b1b",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.4l3.7 2.9C6.5 7.4 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.7c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.2C.7 9.6 0 12.2 0 15s.7 5.4 1.9 7.8l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.2 7.5 23 12 23z"
              />
            </svg>
            Google (OAuth)
          </button>

          <button
            onClick={handleDemoLogin}
            type="button"
            className="py-2.5 px-3 rounded-xl text-xs font-bold text-[#f3ece7] hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
            style={{
              background: "#1c1b1b",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <Zap className="w-4 h-4 text-[#ffc168]" />
            1-Clique (Demo)
          </button>
        </div>
      </div>
    </div>
  );
}
