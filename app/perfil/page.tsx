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
  Key,
  Copy,
  ExternalLink,
  Info,
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
  const [validatingPlatform, setValidatingPlatform] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<Record<string, { valid: boolean; message: string }>>({});
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [showAvatarEdit, setShowAvatarEdit] = useState(false);
  const [manualConnectPlatform, setManualConnectPlatform] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualHandle, setManualHandle] = useState("");
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [origin, setOrigin] = useState("http://localhost:3000");

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
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    fetchProfile();

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
        text: `Conta ${platformNames[connectedPlatform] || connectedPlatform} vinculada com sucesso no Supabase!`,
      });
      window.history.replaceState({}, "", "/perfil");
    } else if (authError) {
      setToastMessage({
        type: "error",
        text: `${authError}`,
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
        setToastMessage({ type: "success", text: "Perfil atualizado com sucesso no Supabase!" });
      }
    } catch (e) {
      console.error(e);
      setToastMessage({ type: "error", text: "Erro ao salvar perfil." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOAuthConnect = (platform: string) => {
    setActionLoading(platform);
    window.location.href = `/api/auth/connect/${platform}?next=/perfil`;
  };

  const handleManualConnectSubmit = async (platform: string) => {
    if (!manualName.trim() && !manualToken.trim()) {
      setToastMessage({ type: "error", text: "Preencha o nome do canal ou o token da API." });
      return;
    }

    setActionLoading(platform);
    try {
      const res = await fetch("/api/social/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          accountName: manualName.trim(),
          accountHandle: manualHandle.trim(),
          accessToken: manualToken.trim() || undefined,
        }),
      });

      if (res.ok) {
        setManualConnectPlatform(null);
        setManualName("");
        setManualHandle("");
        setManualToken("");
        await fetchProfile();
        setToastMessage({ type: "success", text: `Conta ${platform} vinculada e salva no Supabase!` });
      } else {
        const err = await res.json();
        setToastMessage({ type: "error", text: err.error || "Erro ao salvar conta." });
      }
    } catch (e: any) {
      setToastMessage({ type: "error", text: e.message || "Falha na conexão." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleValidateToken = async (platform: string) => {
    setValidatingPlatform(platform);
    try {
      const res = await fetch("/api/social/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });

      const data = await res.json();
      if (data.valid) {
        setValidationResult((prev) => ({
          ...prev,
          [platform]: {
            valid: true,
            message: data.message || "Conexão ativa e verificada.",
          },
        }));
        setToastMessage({
          type: "success",
          text: `API ${platform.toUpperCase()}: ${data.message}`,
        });
      } else {
        setValidationResult((prev) => ({
          ...prev,
          [platform]: {
            valid: false,
            message: data.error || "Token inválido ou expirado.",
          },
        }));
        setToastMessage({
          type: "error",
          text: `API ${platform.toUpperCase()}: ${data.error || "Token expirado."}`,
        });
      }
    } catch (e: any) {
      setToastMessage({ type: "error", text: `Erro ao testar API: ${e.message}` });
    } finally {
      setValidatingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: string) => {
    try {
      setActionLoading(platform);
      const res = await fetch(`/api/social/accounts?platform=${platform}`, { method: "DELETE" });
      if (res.ok) {
        setSocialAccounts((prev) => prev.filter((a) => a.platform !== platform));
        setToastMessage({ type: "success", text: `Conta ${platform} desconectada do Supabase.` });
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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const platformsConfig = [
    {
      id: "youtube" as const,
      name: "YouTube Shorts",
      apiName: "Google & YouTube Data API v3",
      desc: "Publicação com escopos de upload de Shorts, título, descrição e tags na sua conta do Google.",
      callbackUrl: `${origin}/api/auth/callback/youtube`,
      icon: (
        <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white shadow-lg">
          <YouTubeIcon className="w-6 h-6" />
        </div>
      ),
    },
    {
      id: "tiktok" as const,
      name: "TikTok",
      apiName: "TikTok Content Posting API",
      desc: "Conexão oficial com a API do TikTok para publicação no Feed com legendas personalizadas.",
      callbackUrl: `${origin}/api/auth/callback/tiktok`,
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
      desc: "Publicação instantânea no Feed e no Reels do Instagram com formato 9:16 vertical.",
      callbackUrl: `${origin}/api/auth/callback/instagram`,
      icon: (
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
        </div>
      ),
    },
  ];

  return (
    <div
      className="min-h-screen text-[#fff8f5] flex flex-col font-sans"
      style={{
        background: "radial-gradient(circle at 65% 20%, #312225 0%, #151314 45%, #0d0e0e 85%)",
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in duration-300">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
            style={{
              background:
                toastMessage.type === "success"
                  ? "linear-gradient(145deg, #1c271ee8, #101912ef)"
                  : "linear-gradient(145deg, #321c1be8, #1e1111ef)",
              border:
                toastMessage.type === "success"
                  ? "1px solid rgba(16, 185, 129, 0.4)"
                  : "1px solid rgba(255, 113, 96, 0.5)",
              color: toastMessage.type === "success" ? "#a7f3d0" : "#ffb5aa",
            }}
          >
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[#ff7160] shrink-0" />
            )}
            <span className="text-xs font-bold">{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-[#999] hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Navbar */}
      <header
        className="sticky top-0 z-40"
        style={{
          height: "72px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
          background: "rgba(17, 18, 18, 0.92)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-[#beb6b1] hover:text-white transition"
              title="Voltar para a página principal"
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center transition"
                style={{
                  background: "#1e1b1b",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                }}
              >
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold hidden sm:inline">Voltar para a Sala</span>
            </Link>

            <div className="h-4 w-px bg-[#ffffff18] hidden sm:block" />

            <Link href="/" className="flex items-center gap-2">
              <span className="brand-mark" aria-hidden="true">
                <i />
                <i />
              </span>
              <span className="font-bold tracking-tight text-[#fff8f5] text-xl">Klip</span>
              <span
                className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md"
                style={{
                  background: "#ff716024",
                  color: "#ff9789",
                  border: "1px solid #ff716045",
                }}
              >
                Perfil
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/?editor=1"
              className="open-editor"
              style={{
                minHeight: "38px",
                padding: "8px 12px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                textDecoration: "none",
              }}
            >
              ✦ Editor de clipes
            </Link>

            <button
              onClick={() => setPublishModalOpen(true)}
              className="nav-action-btn primary"
              style={{ minHeight: "38px" }}
            >
              <Share2 style={{ width: "14px", height: "14px" }} />
              <span>Publicar</span>
            </button>

            {user && (
              <button
                onClick={handleLogout}
                className="nav-action-btn"
                style={{ minHeight: "38px", padding: "8px 10px" }}
                title="Sair da conta"
              >
                <LogOut className="w-4 h-4 text-[#ff998c]" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-[#beb6b1]">
            <RefreshCw className="w-8 h-8 animate-spin text-[#ff7160]" />
            <p className="text-sm font-bold">Carregando dados do perfil e integrações no Supabase...</p>
          </div>
        ) : !user ? (
          /* Not Logged In Prompt */
          <div
            className="max-w-md mx-auto my-12 p-8 rounded-3xl text-center shadow-2xl"
            style={{
              background: "linear-gradient(145deg, #241b1be8, #171a19ef)",
              border: "1px solid rgba(255, 113, 96, 0.3)",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.8)",
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: "linear-gradient(135deg, #ff7564, #d84f41)",
                color: "#25100e",
              }}
            >
              <User className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-[#fff8f5] mb-2 tracking-tight">
              Acesse seu Perfil Klip
            </h2>
            <p className="text-xs text-[#bcb4ae] mb-6 leading-relaxed">
              Faça login com Supabase para gerenciar seus dados, vincular seus canais do YouTube, TikTok e Instagram e publicar seus vídeos com 1 clique.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setAuthModalOpen(true)}
                className="nav-action-btn primary w-full justify-center py-3 text-sm cursor-pointer"
              >
                Entrar ou Criar Conta
              </button>
              <Link
                href="/"
                className="block w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#beb6b1] hover:text-white transition"
                style={{
                  background: "#1c1b1b",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                }}
              >
                Voltar para a Sala de Gravação
              </Link>
            </div>
          </div>
        ) : (
          /* Logged In Screen */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top User Profile Card */}
            <div
              className="rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden"
              style={{
                background: "linear-gradient(145deg, #261c1ce8, #141716f5)",
                border: "1px solid rgba(255, 113, 96, 0.28)",
                boxShadow: "0 28px 70px rgba(0, 0, 0, 0.7)",
              }}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-5">
                  {/* Avatar */}
                  <div className="relative group">
                    <div
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-lg flex items-center justify-center"
                      style={{
                        background: "#121414",
                        border: "2px solid #ff7160",
                      }}
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-10 h-10 text-[#9e9791]" />
                      )}
                    </div>
                    <button
                      onClick={() => setShowAvatarEdit(!showAvatarEdit)}
                      className="absolute -bottom-2 -right-2 p-1.5 rounded-lg text-[#25100e] shadow transition cursor-pointer"
                      style={{
                        background: "linear-gradient(135deg, #ff7564, #d84f41)",
                      }}
                      title="Alterar Foto de Perfil"
                    >
                      <Edit2 className="w-3.5 h-3.5 font-bold" />
                    </button>
                  </div>

                  {/* Name & Details */}
                  <div>
                    <div className="flex items-center gap-2">
                      {editingName ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            className="px-3 py-1 rounded-lg text-sm text-white font-bold focus:outline-none"
                            style={{
                              background: "#0f1010",
                              border: "1px solid #ff7160",
                            }}
                            placeholder="Seu nome"
                          />
                          <button
                            onClick={handleSaveProfile}
                            disabled={savingProfile}
                            className="p-1.5 rounded-lg text-xs cursor-pointer"
                            style={{
                              background: "#ff6b5c",
                              color: "#25100e",
                            }}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h1 className="text-xl sm:text-2xl font-black text-[#fff8f5] tracking-tight">
                            {user.name}
                          </h1>
                          <button
                            onClick={() => setEditingName(true)}
                            className="text-[#999] hover:text-[#ff7160] transition cursor-pointer"
                            title="Editar Nome"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(16, 185, 129, 0.15)",
                          border: "1px solid rgba(16, 185, 129, 0.35)",
                          color: "#6ee7b7",
                        }}
                      >
                        <ShieldCheck className="w-3 h-3" /> Supabase profiles
                      </span>
                    </div>

                    <p className="text-xs text-[#bcb4ae] flex items-center gap-1.5 mt-1">
                      <Mail className="w-3.5 h-3.5 text-[#888]" />
                      {user.email}
                    </p>

                    <div className="flex items-center gap-4 mt-3 text-[11px] text-[#8e8781]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Membro desde {user.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "2026"}
                      </span>
                      <span>•</span>
                      <span className="font-mono">ID: {user.id.substring(0, 12)}...</span>
                    </div>
                  </div>
                </div>

                {/* Quick stats summary */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div
                    className="flex-1 md:flex-none p-3.5 rounded-2xl text-center min-w-[130px]"
                    style={{
                      background: "#171818",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                    }}
                  >
                    <span className="text-xs text-[#aaa19b] block mb-0.5 font-medium">Redes no Supabase</span>
                    <span className="text-xl font-black text-[#ff8879]">
                      {socialAccounts.length} de 3
                    </span>
                  </div>
                  <div
                    className="flex-1 md:flex-none p-3.5 rounded-2xl text-center min-w-[130px]"
                    style={{
                      background: "#171818",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                    }}
                  >
                    <span className="text-xs text-[#aaa19b] block mb-0.5 font-medium">Banco de Dados</span>
                    <span className="text-xl font-black text-[#6ee7b7]">Conectado</span>
                  </div>
                </div>
              </div>

              {/* Avatar URL Edit Drawer */}
              {showAvatarEdit && (
                <div
                  className="mt-6 pt-6 flex flex-col sm:flex-row items-center gap-3"
                  style={{ borderTop: "1px solid rgba(255, 255, 255, 0.12)" }}
                >
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-[#cfc7c1] mb-1">
                      URL da Foto de Perfil (Avatar)
                    </label>
                    <input
                      type="url"
                      value={avatarInput}
                      onChange={(e) => setAvatarInput(e.target.value)}
                      placeholder="https://exemplo.com/sua-foto.jpg"
                      className="w-full px-3 py-2 rounded-xl text-xs text-white placeholder-[#6e6863] focus:outline-none"
                      style={{
                        background: "#0f1010",
                        border: "1px solid #ff7160",
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto mt-2 sm:mt-5">
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                      style={{
                        background: "linear-gradient(135deg, #ff7564, #d84f41)",
                        color: "#25100e",
                      }}
                    >
                      {savingProfile ? "Salvando..." : "Salvar Foto"}
                    </button>
                    <button
                      onClick={() => setShowAvatarEdit(false)}
                      className="px-3 py-2 rounded-xl text-xs text-[#aaa19b] transition cursor-pointer"
                      style={{
                        background: "#1c1b1b",
                        border: "1px solid rgba(255, 255, 255, 0.14)",
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Social Accounts Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-[#fff8f5] flex items-center gap-2 tracking-tight">
                    <Link2 className="w-5 h-5 text-[#ff7160]" />
                    Contas e Redes Sociais Vinculadas
                  </h2>
                  <p className="text-xs text-[#bcb4ae] mt-0.5">
                    Armazenamento das contas oficiais no Supabase para publicação multi-plataforma
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {platformsConfig.map((p) => {
                  const connected = socialAccounts.find((a) => a.platform === p.id);
                  const isConnected = Boolean(connected);
                  const isLoading = actionLoading === p.id;
                  const isValidating = validatingPlatform === p.id;
                  const valRes = validationResult[p.id];
                  const isManualOpen = manualConnectPlatform === p.id;

                  return (
                    <div
                      key={p.id}
                      className="p-6 rounded-3xl flex flex-col justify-between transition shadow-xl"
                      style={{
                        background: isConnected
                          ? "linear-gradient(155deg, #241b1d, #141716 75%)"
                          : "linear-gradient(155deg, #1e1718, #111313 75%)",
                        border: isConnected
                          ? "1px solid rgba(255, 113, 96, 0.35)"
                          : "1px solid rgba(255, 255, 255, 0.12)",
                      }}
                    >
                      <div>
                        {/* Header card */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          {p.icon}
                          {isConnected ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                              style={{
                                background: "rgba(16, 185, 129, 0.15)",
                                border: "1px solid rgba(16, 185, 129, 0.4)",
                                color: "#6ee7b7",
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Vinculado
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                              style={{
                                background: "rgba(255, 255, 255, 0.06)",
                                border: "1px solid rgba(255, 255, 255, 0.14)",
                                color: "#99908a",
                              }}
                            >
                              <AlertCircle className="w-3.5 h-3.5" /> Não vinculado
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-[#fff8f5]">{p.name}</h3>
                        <span className="text-[10px] text-[#ff9789] font-mono block mb-2 font-bold">{p.apiName}</span>
                        <p className="text-xs text-[#bcb4ae] leading-relaxed mb-4">{p.desc}</p>

                        {/* Connected Account Details */}
                        {isConnected && connected && (
                          <div
                            className="p-3 rounded-2xl mb-4 space-y-2"
                            style={{
                              background: "#121414",
                              border: "1px solid rgba(255, 255, 255, 0.14)",
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700 flex items-center justify-center">
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
                              <div className="overflow-hidden flex-1">
                                <div className="text-xs font-bold text-[#fff8f5] truncate">
                                  {connected.accountName}
                                </div>
                                <div className="text-[11px] text-[#ffb4aa] font-mono truncate">
                                  {connected.accountHandle || `@${connected.platform}`}
                                </div>
                              </div>
                            </div>

                            {valRes && (
                              <div
                                className="text-[10px] font-bold p-1.5 rounded-lg flex items-center gap-1.5"
                                style={{
                                  background: valRes.valid ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.12)",
                                  color: valRes.valid ? "#6ee7b7" : "#ff9990",
                                }}
                              >
                                {valRes.valid ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                <span className="truncate">{valRes.message}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Manual / Direct Connect Drawer */}
                        {isManualOpen && !isConnected && (
                          <div
                            className="p-3.5 rounded-2xl mb-4 space-y-2.5 animate-in fade-in duration-200"
                            style={{
                              background: "#121414",
                              border: "1px solid #ff716066",
                            }}
                          >
                            <div className="text-xs font-bold text-[#ffb4aa] flex items-center gap-1.5">
                              <Key className="w-3.5 h-3.5 text-[#ff7160]" />
                              Vincular com Token ou Dados da API
                            </div>
                            <input
                              type="text"
                              value={manualName}
                              onChange={(e) => setManualName(e.target.value)}
                              placeholder={`Nome do Canal / Perfil ${p.name}`}
                              className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-[#090a0a] border border-[#333] text-white focus:outline-none focus:border-[#ff7160]"
                            />
                            <input
                              type="text"
                              value={manualHandle}
                              onChange={(e) => setManualHandle(e.target.value)}
                              placeholder="@handle_oficial"
                              className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-[#090a0a] border border-[#333] text-white focus:outline-none focus:border-[#ff7160]"
                            />
                            <textarea
                              value={manualToken}
                              onChange={(e) => setManualToken(e.target.value)}
                              placeholder="Access Token da API (opcional para teste direto)"
                              className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-[#090a0a] border border-[#333] text-white focus:outline-none focus:border-[#ff7160] resize-none h-14"
                            />
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => handleManualConnectSubmit(p.id)}
                                disabled={isLoading}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                                style={{
                                  background: "#ff6b5c",
                                  color: "#25100e",
                                }}
                              >
                                {isLoading ? "Salvando..." : "Salvar no Supabase"}
                              </button>
                              <button
                                onClick={() => setManualConnectPlatform(null)}
                                className="px-2.5 py-1.5 rounded-lg text-xs text-[#888] hover:text-white"
                              >
                                Fechar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2">
                        {isConnected ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleValidateToken(p.id)}
                                disabled={isValidating}
                                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                style={{
                                  background: "#1c1b1b",
                                  border: "1px solid rgba(255, 255, 255, 0.2)",
                                  color: "#fff8f5",
                                }}
                                title="Testar chamada com a API oficial"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? "animate-spin text-[#ff7160]" : ""}`} />
                                {isValidating ? "Testando API..." : "Testar Conexão"}
                              </button>

                              <button
                                onClick={() => handleDisconnect(p.id)}
                                disabled={isLoading}
                                className="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                style={{
                                  background: "#281716",
                                  border: "1px solid rgba(255, 113, 96, 0.4)",
                                  color: "#ffaaa0",
                                }}
                                title="Remover do Supabase"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                                {isLoading ? "..." : "Desvincular"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <button
                              onClick={() => handleOAuthConnect(p.id)}
                              disabled={isLoading}
                              className="w-full py-2.5 px-4 rounded-xl text-xs font-black shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                              style={{
                                background: "linear-gradient(135deg, #ff7564, #d84f41)",
                                border: "1px solid #ff7160",
                                color: "#25100e",
                                boxShadow: "0 4px 14px rgba(255, 107, 92, 0.35)",
                              }}
                            >
                              <Link2 className="w-4 h-4" />
                              {isLoading ? "Conectando API..." : `Vincular via OAuth (${p.name})`}
                            </button>

                            <button
                              onClick={() => setManualConnectPlatform(isManualOpen ? null : p.id)}
                              className="w-full py-1.5 rounded-lg text-[11px] font-bold text-[#bcb4ae] hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.1)",
                              }}
                            >
                              <Key className="w-3 h-3 text-[#ff8879]" />
                              {isManualOpen ? "Cancelar Inserção" : "Inserir Token / Dados Diretos"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Developer Guide & Callback URIs Helper */}
            <div
              className="rounded-3xl p-6 shadow-xl space-y-4"
              style={{
                background: "linear-gradient(145deg, #241b1be8, #141716f5)",
                border: "1px solid rgba(255, 113, 96, 0.22)",
              }}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-[#fff8f5]">
                <Info className="w-4 h-4 text-[#ff7160]" />
                <span>URIs de Redirecionamento OAuth (Cadastrar nos Consoles de Desenvolvedor)</span>
              </div>
              <p className="text-xs text-[#aaa19b]">
                Para conectar ao vivo com as contas oficiais, cadastre as seguintes URIs de redirecionamento autorizadas no Google Cloud Console, TikTok for Developers e Meta App Dashboard:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {platformsConfig.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl flex items-center justify-between gap-2"
                    style={{
                      background: "#101111",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                    }}
                  >
                    <div className="overflow-hidden">
                      <span className="text-[10px] text-[#ff8879] font-bold block">{p.name}</span>
                      <span className="text-[11px] font-mono text-[#dedbd7] truncate block" title={p.callbackUrl}>
                        {p.callbackUrl}
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(p.callbackUrl, p.id)}
                      className="p-1.5 rounded-lg text-[#aaa19b] hover:text-white shrink-0 cursor-pointer"
                      style={{ background: "#1c1b1b" }}
                      title="Copiar URL"
                    >
                      {copiedUrl === p.id ? (
                        <Check className="w-3.5 h-3.5 text-[#10b981]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick studio shortcuts */}
            <div
              className="rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl"
              style={{
                background: "linear-gradient(145deg, #241b1be8, #141716f5)",
                border: "1px solid rgba(255, 113, 96, 0.25)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    background: "#ff716024",
                    border: "1px solid #ff716045",
                    color: "#ff8879",
                  }}
                >
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#fff8f5]">Pronto para gravar e publicar?</h4>
                  <p className="text-xs text-[#bcb4ae]">
                    Crie uma sala de chamada privada com gravação local em 1080p ou edite seus clipes já gravados.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Link
                  href="/"
                  className="nav-action-btn primary flex-1 sm:flex-none text-center justify-center"
                  style={{ textDecoration: "none" }}
                >
                  Abrir Sala de Gravação
                </Link>
                <Link
                  href="/?editor=1"
                  className="open-editor flex-1 sm:flex-none text-center justify-center"
                  style={{
                    minHeight: "38px",
                    padding: "8px 14px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Editor de Clipes
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className="py-6 text-center text-xs text-[#807a75]"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}
      >
        <p>Klip Studio · Persistência Supabase & Publicação Multiplataforma (YouTube, TikTok, Instagram)</p>
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
