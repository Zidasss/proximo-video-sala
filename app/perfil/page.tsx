"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "../../lib/supabase/client";
import { AuthModal } from "../../components/AuthModal";
import { PublishModal } from "../../components/PublishModal";
import {
  User,
  Mail,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Link2,
  Unlink,
  Share2,
  Sparkles,
  ArrowLeft,
  LogOut,
  Edit2,
  Check,
  RefreshCw,
  Video,
  Film,
  Zap,
  ShieldCheck,
} from "lucide-react";

interface SocialAccountData {
  id: string;
  platform: "youtube" | "tiktok" | "instagram";
  platformUserId?: string;
  accountName: string;
  accountHandle?: string;
  avatarUrl?: string;
  status: "connected" | "disconnected" | "expired";
  createdAt?: string;
}

interface UserProfileData {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt?: string;
}

const YouTubeIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfileData | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [showAvatarEdit, setShowAvatarEdit] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/user/profile");

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setNameInput(data.user.name || "");
          setAvatarInput(data.user.avatarUrl || "");
        }
        if (data.socialAccounts) {
          setSocialAccounts(data.socialAccounts);
        }
      } else {
        // Fallback to localStorage if any
        const saved = localStorage.getItem("klip_user");
        if (saved) {
          const parsed = JSON.parse(saved);
          setUser({
            id: parsed.id || "local-user",
            email: parsed.email || "criador@klip.app",
            name: parsed.name || "Criador Klip",
            avatarUrl: parsed.avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=Klip",
            createdAt: new Date().toISOString(),
          });
          setNameInput(parsed.name || "Criador Klip");
          setAvatarInput(parsed.avatarUrl || "");
        }
      }
    } catch (e) {
      console.error("Erro ao carregar perfil:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();

    // Check query params for OAuth callbacks or errors
    const params = new URLSearchParams(window.location.search);
    const connectedPlatform = params.get("connected");
    const authError = params.get("auth_error");

    if (connectedPlatform) {
      const platformNames: Record<string, string> = {
        youtube: "YouTube Shorts",
        tiktok: "TikTok",
        instagram: "Instagram Reels",
      };
      setToastMessage({
        type: "success",
        text: `Conta ${platformNames[connectedPlatform] || connectedPlatform} vinculada com sucesso!`,
      });
      // Limpar parâmetros da URL sem recarregar
      window.history.replaceState({}, "", "/perfil");
    } else if (authError) {
      setToastMessage({
        type: "error",
        text: `Erro na vinculação: ${authError}`,
      });
      window.history.replaceState({}, "", "/perfil");
    }

    if (isSupabaseConfigured) {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          const uName = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Criador";
          const uObj = {
            id: session.user.id,
            email: session.user.email || "",
            name: uName,
            avatarUrl: session.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uName)}`,
          };
          setUser(uObj);
          setNameInput(uName);
          localStorage.setItem("klip_user", JSON.stringify(uObj));
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          localStorage.removeItem("klip_user");
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const handleSaveProfile = async () => {
    if (!nameInput.trim()) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.trim(),
          avatarUrl: avatarInput.trim() || user?.avatarUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser((prev) => (prev ? { ...prev, ...data.user } : data.user));
          localStorage.setItem("klip_user", JSON.stringify(data.user));
        }
        setEditingName(false);
        setShowAvatarEdit(false);
        setToastMessage({ type: "success", text: "Perfil atualizado com sucesso!" });
      }
    } catch (e) {
      console.error(e);
      setToastMessage({ type: "error", text: "Erro ao salvar perfil." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleConnect = (platform: string) => {
    setActionLoading(platform);
    window.location.href = `/api/auth/connect/${platform}?next=/perfil`;
  };

  const handleDisconnect = async (platform: string) => {
    try {
      setActionLoading(platform);
      const res = await fetch(`/api/social/accounts?platform=${platform}`, { method: "DELETE" });
      if (res.ok) {
        setSocialAccounts((prev) => prev.filter((a) => a.platform !== platform));
        setToastMessage({ type: "success", text: `Conta ${platform} desconectada.` });
      }
    } catch (e) {
      console.error(e);
      setToastMessage({ type: "error", text: `Falha ao desconectar conta ${platform}.` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    try {
      if (isSupabaseConfigured) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error(e);
    } finally {
      localStorage.removeItem("klip_user");
      setUser(null);
      setSocialAccounts([]);
      setToastMessage({ type: "success", text: "Você saiu da sua conta." });
    }
  };

  const platformsConfig = [
    {
      id: "youtube" as const,
      name: "YouTube Shorts",
      apiName: "Google & YouTube Data API v3",
      desc: "Publicação automática de vídeos curtos com #Shorts, título, descrição e tags na sua conta oficial.",
      badgeColor: "bg-red-500/10 text-red-400 border-red-500/20",
      accentBg: "bg-red-600 hover:bg-red-500",
      icon: (
        <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-600/20">
          <YouTubeIcon className="w-6 h-6" />
        </div>
      ),
    },
    {
      id: "tiktok" as const,
      name: "TikTok",
      apiName: "TikTok Content Posting API",
      desc: "Envio de clipes e cortes direto para o feed do TikTok com legendas personalizadas e privacidade.",
      badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      accentBg: "bg-zinc-800 hover:bg-zinc-700 border border-zinc-600",
      icon: (
        <div className="w-12 h-12 rounded-2xl bg-black border border-zinc-700 flex items-center justify-center text-white shadow-lg">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.81 4.48 6.27 6.27 0 0 0 1.99-4.48V8.69a8.18 8.18 0 0 0 4.79 1.52V6.76c-.34-.02-.68-.05-1-.07z" />
          </svg>
        </div>
      ),
    },
    {
      id: "instagram" as const,
      name: "Instagram Reels",
      apiName: "Meta & Instagram Graph API",
      desc: "Publicação instantânea no Feed e no Reels do Instagram com capa e proporção 9:16 vertical.",
      badgeColor: "bg-pink-500/10 text-pink-400 border-pink-500/20",
      accentBg: "bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:opacity-90",
      icon: (
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/20">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#0d0f12] text-zinc-100 antialiased flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
              toastMessage.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
                : "bg-rose-950/90 border-rose-500/40 text-rose-200"
            }`}
          >
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-xs font-medium">{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-zinc-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition group"
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-indigo-500 transition">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium hidden sm:inline">Voltar para a Sala</span>
            </Link>

            <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-pink-500 text-white font-black text-xs">
                K
              </span>
              <span className="font-bold tracking-tight text-white text-base">Klip</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Perfil
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/?editor=1"
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition flex items-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Editor de Clipes</span>
            </Link>

            <button
              onClick={() => setPublishModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Publicar</span>
            </button>

            {user && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-rose-950/40 hover:border-rose-900 text-zinc-400 hover:text-rose-300 transition cursor-pointer"
                title="Sair da conta"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm">Carregando dados do perfil e integrações...</p>
          </div>
        ) : !user ? (
          /* Not Logged In State */
          <div className="max-w-md mx-auto my-12 p-8 bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Acesse seu Perfil Klip</h2>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Faça login com Supabase para gerenciar seus dados, vincular seus canais do YouTube, TikTok e Instagram e publicar seus vídeos com 1 clique.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setAuthModalOpen(true)}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-95 text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-500/20 transition cursor-pointer"
              >
                Entrar ou Criar Conta
              </button>
              <Link
                href="/"
                className="block w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl text-xs transition"
              >
                Voltar para a Sala de Gravação
              </Link>
            </div>
          </div>
        ) : (
          /* Logged In Profile Screen */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top User Profile Card */}
            <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-900/50 border border-zinc-800/90 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-5">
                  {/* Avatar */}
                  <div className="relative group">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-zinc-800 border-2 border-indigo-500/30 shadow-lg flex items-center justify-center">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-10 h-10 text-zinc-400" />
                      )}
                    </div>
                    <button
                      onClick={() => setShowAvatarEdit(!showAvatarEdit)}
                      className="absolute -bottom-2 -right-2 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition cursor-pointer"
                      title="Alterar Avatar"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Name & Basic Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      {editingName ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            className="px-3 py-1 bg-zinc-800 border border-indigo-500 rounded-lg text-sm text-white font-bold focus:outline-none"
                            placeholder="Seu nome"
                          />
                          <button
                            onClick={handleSaveProfile}
                            disabled={savingProfile}
                            className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                            {user.name}
                          </h1>
                          <button
                            onClick={() => setEditingName(true)}
                            className="text-zinc-500 hover:text-indigo-400 transition"
                            title="Editar Nome"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <ShieldCheck className="w-3 h-3" /> Supabase
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-1">
                      <Mail className="w-3.5 h-3.5 text-zinc-500" />
                      {user.email}
                    </p>

                    <div className="flex items-center gap-4 mt-3 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Membro desde {user.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "2026"}
                      </span>
                      <span>•</span>
                      <span className="font-mono">ID: {user.id.substring(0, 12)}...</span>
                    </div>
                  </div>
                </div>

                {/* Quick stats / summary */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="flex-1 md:flex-none p-3.5 bg-zinc-800/60 border border-zinc-800 rounded-2xl text-center min-w-[120px]">
                    <span className="text-xs text-zinc-400 block mb-0.5">Redes Vinculadas</span>
                    <span className="text-lg font-black text-indigo-400">
                      {socialAccounts.length} de 3
                    </span>
                  </div>
                  <div className="flex-1 md:flex-none p-3.5 bg-zinc-800/60 border border-zinc-800 rounded-2xl text-center min-w-[120px]">
                    <span className="text-xs text-zinc-400 block mb-0.5">Publicações</span>
                    <span className="text-lg font-black text-emerald-400">Ativas</span>
                  </div>
                </div>
              </div>

              {/* Avatar URL Edit Drawer */}
              {showAvatarEdit && (
                <div className="mt-6 pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      URL da Foto de Perfil (Avatar)
                    </label>
                    <input
                      type="url"
                      value={avatarInput}
                      onChange={(e) => setAvatarInput(e.target.value)}
                      placeholder="https://exemplo.com/sua-foto.jpg"
                      className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto mt-2 sm:mt-5">
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      {savingProfile ? "Salvando..." : "Salvar Foto"}
                    </button>
                    <button
                      onClick={() => setShowAvatarEdit(false)}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-xs transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Social Integrations Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-indigo-400" />
                    Contas e Redes Sociais Vinculadas
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Gerencie a integração com as APIs do YouTube, TikTok e Instagram para publicação em massa
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {platformsConfig.map((p) => {
                  const connected = socialAccounts.find((a) => a.platform === p.id);
                  const isConnected = Boolean(connected);
                  const isLoading = actionLoading === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`p-6 rounded-3xl border transition flex flex-col justify-between ${
                        isConnected
                          ? "bg-zinc-900/90 border-zinc-700/80 shadow-lg shadow-black/40"
                          : "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700"
                      }`}
                    >
                      <div>
                        {/* Header card */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          {p.icon}
                          {isConnected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Vinculado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-700/50">
                              <AlertCircle className="w-3.5 h-3.5" /> Não vinculado
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-white">{p.name}</h3>
                        <span className="text-[10px] text-zinc-500 font-mono block mb-2">{p.apiName}</span>
                        <p className="text-xs text-zinc-400 leading-relaxed mb-4">{p.desc}</p>

                        {/* Connected Account Info Details */}
                        {isConnected && connected && (
                          <div className="p-3 bg-zinc-800/70 border border-zinc-700/60 rounded-2xl mb-4 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-700 shrink-0 border border-zinc-600 flex items-center justify-center">
                              {connected.avatarUrl ? (
                                <img
                                  src={connected.avatarUrl}
                                  alt={connected.accountName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-4 h-4 text-zinc-300" />
                              )}
                            </div>
                            <div className="overflow-hidden">
                              <div className="text-xs font-bold text-white truncate">
                                {connected.accountName}
                              </div>
                              <div className="text-[11px] text-indigo-300 font-mono truncate">
                                {connected.accountHandle || `@${connected.platform}`}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Button */}
                      <div className="pt-2">
                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDisconnect(p.id)}
                              disabled={isLoading}
                              className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-800/50 border border-zinc-700 rounded-xl text-xs font-semibold text-zinc-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                              {isLoading ? "Desconectando..." : "Desvincular Conta"}
                            </button>
                            <button
                              onClick={() => handleConnect(p.id)}
                              disabled={isLoading}
                              className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-400 hover:text-white transition cursor-pointer"
                              title="Reconectar / Atualizar Token"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleConnect(p.id)}
                            disabled={isLoading}
                            className={`w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold transition shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${p.accentBg}`}
                          >
                            <Link2 className="w-4 h-4" />
                            {isLoading ? "Conectando API..." : `Vincular ${p.name}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Platform Tools Shortcut Banner */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Pronto para gravar e publicar?</h4>
                  <p className="text-xs text-zinc-400">
                    Crie uma sala de chamada privada com gravação local em 1080p ou edite seus clipes já gravados.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Link
                  href="/"
                  className="flex-1 sm:flex-none text-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20"
                >
                  Abrir Sala de Gravação
                </Link>
                <Link
                  href="/?editor=1"
                  className="flex-1 sm:flex-none text-center px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition"
                >
                  Editor de Clipes
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-6 text-center text-xs text-zinc-500">
        <p>Klip Studio · Autenticação Supabase & Publicação Multiplataforma (YouTube, TikTok, Instagram)</p>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser({
            id: u.id,
            email: u.email,
            name: u.name || "Criador",
            avatarUrl: u.avatarUrl,
          });
          fetchProfile();
        }}
      />

      <PublishModal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        defaultTitle="Novo Vídeo do Klip"
      />
    </div>
  );
}
