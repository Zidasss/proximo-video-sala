"use client";

import React, { useState } from "react";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";
import { X, Mail, Lock, User, LogIn, Sparkles, CheckCircle2, UserCheck, Zap } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; email: string; name?: string }) => void;
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
        // Local simulation / direct mode
        setTimeout(() => {
          setLoading(false);
          const demoUser = {
            id: "user-" + Math.random().toString(36).substring(2, 9),
            email: email.trim() || "criador@klip.app",
            name: name.trim() || email.split("@")[0] || "Criador Klip",
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
          email,
          password,
          options: {
            data: { full_name: name },
          },
        });
        if (error) throw error;
        if (data.user) {
          setSuccessMsg("Conta criada com sucesso!");
          const userObj = {
            id: data.user.id,
            email: data.user.email || email,
            name: name || data.user.user_metadata?.full_name || "Criador",
          };
          localStorage.setItem("klip_user", JSON.stringify(userObj));
          onSuccess(userObj);
          setTimeout(onClose, 800);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          const userObj = {
            id: data.user.id,
            email: data.user.email || email,
            name: data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "Criador",
          };
          localStorage.setItem("klip_user", JSON.stringify(userObj));
          onSuccess(userObj);
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro na autenticação. Verifique e-mail e senha.");
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
      };
      localStorage.setItem("klip_user", JSON.stringify(demoUser));
      onSuccess(demoUser);
      onClose();
      return;
    }

    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl text-zinc-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 mb-2.5 shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg font-bold">
            {isSignUp ? "Criar Conta no Klip" : "Acessar Conta Klip"}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Faça login para conectar YouTube, TikTok, Instagram e publicar com 1 clique
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-zinc-800/80 p-1 rounded-xl mb-4 border border-zinc-700/50">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMsg("");
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              !isSignUp
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Entrar (Login)
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setErrorMsg("");
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              isSignUp
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Criar Conta
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3.5 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-3.5 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Nome ou Canal
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  required={isSignUp}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Rafael Santos"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-800/90 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="w-full pl-9 pr-3 py-2 bg-zinc-800/90 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full pl-9 pr-3 py-2 bg-zinc-800/90 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-95 text-white font-semibold rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            <LogIn className="w-4 h-4" />
            {loading ? "Entrando..." : isSignUp ? "Cadastrar e Entrar" : "Entrar com Login e Senha"}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800"></div>
          </div>
          <div className="relative flex justify-center text-[11px]">
            <span className="bg-zinc-900 px-2 text-zinc-500">ou acesse rápido</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDemoLogin}
            type="button"
            className="py-2 px-3 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-xs font-medium text-zinc-200 hover:text-white transition flex items-center justify-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            1-Clique (Demo)
          </button>

          <button
            onClick={handleGoogleSignIn}
            type="button"
            className="py-2 px-3 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-xs font-medium text-zinc-200 hover:text-white transition flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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
            Google
          </button>
        </div>
      </div>
    </div>
  );
}
