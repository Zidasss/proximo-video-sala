"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient, isSupabaseConfigured } from "../../lib/supabase/client";
import { AuthModal } from "../../components/AuthModal";
import { PublishModal } from "../../components/PublishModal";
import { KlipAppLogo } from "../../components/brand/KlipAppLogo";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import profileStyles from "./profile.module.css";
import {
  User,
  Mail,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Link2,
  Unlink,
  Share2,
  ArrowLeft,
  LogOut,
  Edit2,
  Check,
  RefreshCw,
  Video,
  ShieldCheck,
  Key,
  Copy,
  Info,
  Clapperboard,
  X,
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
  <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor">
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
  const [origin] = useState(() =>
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL || "https://www.klipapp.com.br"
      : window.location.origin,
  );

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
            email: parsed.email || "criador@klipapp.com.br",
            name: parsed.name || "Criador KLIPAPP",
            avatarUrl: parsed.avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=KLIPAPP",
            createdAt: new Date().toISOString(),
          });
          setNameInput(parsed.name || "Criador KLIPAPP");
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
    const initializeTimer = window.setTimeout(() => {
      void fetchProfile();

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
          text: `Conta ${platformNames[connectedPlatform] || connectedPlatform} vinculada com sucesso.`,
        });
        window.history.replaceState({}, "", "/perfil");
      } else if (authError) {
        setToastMessage({
          type: "error",
          text: `${authError}`,
        });
        window.history.replaceState({}, "", "/perfil");
      }
    }, 0);

    let unsubscribe: (() => void) | undefined;

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
      unsubscribe = () => subscription.unsubscribe();
    }

    return () => {
      window.clearTimeout(initializeTimer);
      unsubscribe?.();
    };
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
        setToastMessage({ type: "success", text: "Perfil atualizado." });
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
    // OAuth exige navegação completa para seguir o redirecionamento externo.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
        setToastMessage({ type: "success", text: `Conta ${platform} vinculada.` });
      } else {
        const err = await res.json();
        setToastMessage({ type: "error", text: err.error || "Erro ao salvar conta." });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Falha na conexão.";
      setToastMessage({ type: "error", text: message });
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
          text: `${platform.toUpperCase()}: ${data.message}`,
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
          text: `${platform.toUpperCase()}: ${data.error || "A conexão expirou."}`,
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Falha inesperada";
      setToastMessage({ type: "error", text: `Não foi possível verificar a conexão: ${message}` });
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
      desc: "Publique Shorts com título, descrição e tags.",
      callbackUrl: `${origin}/api/auth/callback/youtube`,
      icon: (
        <div className={`${profileStyles.platformIcon} ${profileStyles.youtubeIcon}`}>
          <YouTubeIcon className="w-6 h-6" />
        </div>
      ),
    },
    {
      id: "tiktok" as const,
      name: "TikTok",
      apiName: "TikTok Content Posting API",
      desc: "Envie vídeos ao TikTok com a legenda pronta.",
      callbackUrl: `${origin}/api/auth/callback/tiktok`,
      icon: (
        <div className={`${profileStyles.platformIcon} ${profileStyles.tiktokIcon}`}>
          <svg aria-hidden="true" className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.81 4.48 6.27 6.27 0 0 0 1.99-4.48V8.69a8.18 8.18 0 0 0 4.79 1.52V6.76c-.34-.02-.68-.05-1-.07z" />
          </svg>
        </div>
      ),
    },
    {
      id: "instagram" as const,
      name: "Instagram Reels",
      apiName: "Meta & Instagram Graph API",
      desc: "Publique Reels verticais direto no Instagram.",
      callbackUrl: `${origin}/api/auth/callback/instagram`,
      icon: (
        <div className={`${profileStyles.platformIcon} ${profileStyles.instagramIcon}`}>
          <svg aria-hidden="true" className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
        </div>
      ),
    },
  ];

  return (
    <div className={`${profileStyles.root} min-h-screen flex flex-col font-sans`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`${profileStyles.toastRegion} fixed top-6 right-6 z-50 animate-in fade-in duration-300`}
          role={toastMessage.type === "error" ? "alert" : "status"}
          aria-live={toastMessage.type === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <div
            className={`${profileStyles.toast} ${toastMessage.type === "success" ? profileStyles.toastSuccess : profileStyles.toastError} flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl`}
          >
            {toastMessage.type === "success" ? (
              <CheckCircle2 aria-hidden="true" className={`${profileStyles.successIcon} w-5 h-5 shrink-0`} />
            ) : (
              <AlertCircle aria-hidden="true" className={`${profileStyles.errorIcon} w-5 h-5 shrink-0`} />
            )}
            <span className="text-xs font-bold">{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className={`${profileStyles.iconButton} ml-2 text-xs cursor-pointer`}
              type="button"
              aria-label="Fechar notificação"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className={`${profileStyles.header} sticky top-0 z-40`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className={`${profileStyles.backLink} flex items-center gap-2 transition`}
              aria-label="Voltar para a sala"
            >
              <div className={`${profileStyles.backIcon} w-8 h-8 rounded-xl flex items-center justify-center transition`}>
                <ArrowLeft aria-hidden="true" className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold hidden sm:inline">Voltar para a Sala</span>
            </Link>

            <div className={`${profileStyles.divider} h-4 w-px hidden sm:block`} />

            <Link href="/" className={`${profileStyles.brandLink} flex items-center gap-2`} aria-label="KLIPAPP — página inicial">
              <KlipAppLogo variant="full" />
              <span className={`${profileStyles.pageBadge} text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md`}>
                Perfil
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/?editor=1"
              className={`${profileStyles.navButton} ${profileStyles.editorLink}`}
            >
              <Clapperboard aria-hidden="true" className="w-4 h-4" /> Editor de clipes
            </Link>

            <ThemeToggle className={profileStyles.themeToggle} />

            <button
              onClick={() => setPublishModalOpen(true)}
              className={profileStyles.publishButton}
              type="button"
            >
              <Share2 aria-hidden="true" className="w-4 h-4" />
              <span>Publicar</span>
            </button>

            {user && (
              <button
                onClick={handleLogout}
                className={profileStyles.logoutButton}
                title="Sair da conta"
                type="button"
                aria-label="Sair da conta"
              >
                <LogOut aria-hidden="true" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`${profileStyles.main} max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8`}>
        {loading ? (
          <div className={`${profileStyles.loading} py-24 flex flex-col items-center justify-center gap-3`} role="status" aria-live="polite">
            <RefreshCw aria-hidden="true" className="w-8 h-8 animate-spin" />
            <p className="text-sm font-bold">Carregando seu perfil...</p>
          </div>
        ) : !user ? (
          /* Not Logged In Prompt */
          <div
            className={`${profileStyles.authPrompt} max-w-md mx-auto my-12 p-8 rounded-3xl text-center shadow-2xl`}
          >
            <div
              className={`${profileStyles.authIcon} w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4`}
            >
              <User aria-hidden="true" className="w-8 h-8" />
            </div>
            <h1 className={`${profileStyles.title} text-2xl font-extrabold mb-2 tracking-tight`}>
              Acesse seu perfil KLIPAPP
            </h1>
            <p className={`${profileStyles.muted} text-sm mb-6 leading-relaxed`}>
              Entre para personalizar seu perfil, conectar seus canais e publicar seus vídeos.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setAuthModalOpen(true)}
                className={`${profileStyles.primaryButton} w-full justify-center`}
                type="button"
              >
                Entrar ou Criar Conta
              </button>
              <Link
                href="/"
                className={`${profileStyles.secondaryLink} block w-full py-2.5 px-4 rounded-xl text-xs font-bold transition`}
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
              className={`${profileStyles.profileCard} rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden`}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-5">
                  {/* Avatar */}
                  <div className="relative group">
                    <div
                      className={`${profileStyles.avatar} w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-lg flex items-center justify-center`}
                    >
                      {user.avatarUrl ? (
                        <Image
                          src={user.avatarUrl}
                          alt={user.name}
                          width={96}
                          height={96}
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User aria-hidden="true" className={`${profileStyles.mutedIcon} w-10 h-10`} />
                      )}
                    </div>
                    <button
                      onClick={() => setShowAvatarEdit(!showAvatarEdit)}
                      className={`${profileStyles.avatarEditButton} absolute -bottom-2 -right-2`}
                      title="Alterar Foto de Perfil"
                      type="button"
                      aria-label="Alterar foto de perfil"
                      aria-expanded={showAvatarEdit}
                      aria-controls="profile-avatar-editor"
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
                            className={`${profileStyles.textInput} ${profileStyles.nameInput}`}
                            placeholder="Seu nome"
                            aria-label="Seu nome"
                          />
                          <button
                            onClick={handleSaveProfile}
                            disabled={savingProfile}
                            className={profileStyles.compactPrimaryButton}
                            type="button"
                            aria-label="Salvar nome"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h1 className={`${profileStyles.title} text-xl sm:text-2xl font-black tracking-tight`}>
                            {user.name}
                          </h1>
                          <button
                            onClick={() => setEditingName(true)}
                            className={profileStyles.inlineIconButton}
                            title="Editar Nome"
                            type="button"
                            aria-label="Editar nome"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <span className={profileStyles.verifiedBadge}>
                        <ShieldCheck aria-hidden="true" className="w-3 h-3" /> Conta ativa
                      </span>
                    </div>

                    <p className={`${profileStyles.muted} text-sm flex items-center gap-1.5 mt-1`}>
                      <Mail aria-hidden="true" className="w-3.5 h-3.5" />
                      {user.email}
                    </p>

                    <details className={profileStyles.accountDisclosure}>
                      <summary>Dados da conta</summary>
                      <div className={profileStyles.accountMeta}>
                        <span className="flex items-center gap-1">
                          <Calendar aria-hidden="true" className="w-3 h-3" />
                          Membro desde {user.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "2026"}
                        </span>
                        <span className="font-mono">ID: {user.id.substring(0, 12)}...</span>
                      </div>
                    </details>
                  </div>
                </div>

                {/* Quick stats summary */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div
                    className={`${profileStyles.statCard} flex-1 md:flex-none p-3.5 rounded-2xl text-center min-w-[130px]`}
                  >
                    <span className={`${profileStyles.muted} text-xs block mb-0.5 font-medium`}>Canais conectados</span>
                    <span className={`${profileStyles.brandText} text-xl font-black`}>
                      {socialAccounts.length} de 3
                    </span>
                  </div>
                  <div
                    className={`${profileStyles.statCard} flex-1 md:flex-none p-3.5 rounded-2xl text-center min-w-[130px]`}
                  >
                    <span className={`${profileStyles.muted} text-xs block mb-0.5 font-medium`}>Status</span>
                    <span className={`${profileStyles.successText} text-xl font-black`}>Ativo</span>
                  </div>
                </div>
              </div>

              {/* Avatar URL Edit Drawer */}
              {showAvatarEdit && (
                <div
                  id="profile-avatar-editor"
                  className={`${profileStyles.avatarDrawer} mt-6 pt-6 flex flex-col sm:flex-row items-center gap-3`}
                >
                  <div className="flex-1 w-full">
                    <label htmlFor="profile-avatar-url" className={profileStyles.fieldLabel}>
                      Link da foto de perfil
                    </label>
                    <input
                      id="profile-avatar-url"
                      type="url"
                      value={avatarInput}
                      onChange={(e) => setAvatarInput(e.target.value)}
                      placeholder="https://exemplo.com/sua-foto.jpg"
                      className={profileStyles.textInput}
                    />
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto mt-2 sm:mt-5">
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className={profileStyles.primaryButton}
                      type="button"
                    >
                      {savingProfile ? "Salvando..." : "Salvar Foto"}
                    </button>
                    <button
                      onClick={() => setShowAvatarEdit(false)}
                      className={profileStyles.secondaryButton}
                      type="button"
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
                  <h2 className={`${profileStyles.title} text-xl font-extrabold flex items-center gap-2 tracking-tight`}>
                    <Link2 aria-hidden="true" className={`${profileStyles.brandText} w-5 h-5`} />
                    Canais conectados
                  </h2>
                  <p className={`${profileStyles.muted} text-sm mt-1`}>
                    Conecte uma vez e publique direto do KLIPAPP.
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
                      className={`${profileStyles.socialCard} ${isConnected ? profileStyles.socialCardConnected : ""} p-6 rounded-3xl flex flex-col justify-between transition`}
                    >
                      <div>
                        {/* Header card */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          {p.icon}
                          {isConnected ? (
                            <span className={profileStyles.connectedBadge}>
                              <CheckCircle2 aria-hidden="true" className="w-3.5 h-3.5" /> Conectado
                            </span>
                          ) : (
                            <span className={profileStyles.disconnectedBadge}>
                              <AlertCircle aria-hidden="true" className="w-3.5 h-3.5" /> Desconectado
                            </span>
                          )}
                        </div>

                        <h3 className={`${profileStyles.title} text-base font-bold`}>{p.name}</h3>
                        <p className={`${profileStyles.muted} text-sm leading-relaxed mb-4 mt-1`}>{p.desc}</p>

                        {/* Connected Account Details */}
                        {isConnected && connected && (
                          <div className={`${profileStyles.accountDetails} p-3 rounded-2xl mb-4 space-y-2`}>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700 flex items-center justify-center">
                                {connected.avatarUrl ? (
                                  <Image
                                    src={connected.avatarUrl}
                                    alt={connected.accountName}
                                    width={36}
                                    height={36}
                                    unoptimized
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <User aria-hidden="true" className={`${profileStyles.mutedIcon} w-4 h-4`} />
                                )}
                              </div>
                              <div className="overflow-hidden flex-1">
                                <div className={`${profileStyles.title} text-sm font-bold truncate`}>
                                  {connected.accountName}
                                </div>
                                <div className={`${profileStyles.brandText} text-xs font-mono truncate`}>
                                  {connected.accountHandle || `@${connected.platform}`}
                                </div>
                              </div>
                            </div>

                            {valRes && (
                              <div
                                className={`${profileStyles.validationResult} ${valRes.valid ? profileStyles.validationSuccess : profileStyles.validationError}`}
                                role="status"
                                aria-live="polite"
                              >
                                {valRes.valid ? <Check aria-hidden="true" className="w-3 h-3" /> : <AlertCircle aria-hidden="true" className="w-3 h-3" />}
                                <span className="truncate">{valRes.message}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Manual / Direct Connect Drawer */}
                        {isManualOpen && !isConnected && (
                          <div
                            id={`${p.id}-manual-config`}
                            className={`${profileStyles.manualDrawer} p-4 rounded-2xl mb-4 space-y-3 animate-in fade-in duration-200`}
                          >
                            <div className={`${profileStyles.title} text-sm font-bold flex items-center gap-1.5`}>
                              <Key aria-hidden="true" className={`${profileStyles.brandText} w-4 h-4`} />
                              Configuração manual
                            </div>
                            <label className={profileStyles.fieldLabel} htmlFor={`${p.id}-account-name`}>
                              Nome do canal
                            </label>
                            <input
                              id={`${p.id}-account-name`}
                              type="text"
                              value={manualName}
                              onChange={(e) => setManualName(e.target.value)}
                              placeholder={`Ex.: Canal no ${p.name}`}
                              className={profileStyles.textInput}
                            />
                            <label className={profileStyles.fieldLabel} htmlFor={`${p.id}-account-handle`}>
                              Identificador <span>(opcional)</span>
                            </label>
                            <input
                              id={`${p.id}-account-handle`}
                              type="text"
                              value={manualHandle}
                              onChange={(e) => setManualHandle(e.target.value)}
                              placeholder="@seuperfil"
                              className={profileStyles.textInput}
                            />
                            <label className={profileStyles.fieldLabel} htmlFor={`${p.id}-access-token`}>
                              Token de acesso <span>(opcional)</span>
                            </label>
                            <textarea
                              id={`${p.id}-access-token`}
                              value={manualToken}
                              onChange={(e) => setManualToken(e.target.value)}
                              placeholder="Cole o token somente se sua integração exigir"
                              className={`${profileStyles.textInput} ${profileStyles.textarea}`}
                            />
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => handleManualConnectSubmit(p.id)}
                                disabled={isLoading}
                                className={`${profileStyles.primaryButton} flex-1`}
                                type="button"
                              >
                                {isLoading ? "Salvando..." : "Salvar conexão"}
                              </button>
                              <button
                                onClick={() => setManualConnectPlatform(null)}
                                className={profileStyles.secondaryButton}
                                type="button"
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
                                className={`${profileStyles.secondaryButton} flex-1`}
                                type="button"
                              >
                                <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${isValidating ? "animate-spin" : ""}`} />
                                {isValidating ? "Verificando..." : "Verificar conexão"}
                              </button>

                              <button
                                onClick={() => handleDisconnect(p.id)}
                                disabled={isLoading}
                                className={profileStyles.dangerButton}
                                type="button"
                              >
                                <Unlink aria-hidden="true" className="w-3.5 h-3.5" />
                                {isLoading ? "..." : "Desvincular"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <button
                              onClick={() => handleOAuthConnect(p.id)}
                              disabled={isLoading}
                              className={`${profileStyles.primaryButton} w-full`}
                              type="button"
                            >
                              <Link2 aria-hidden="true" className="w-4 h-4" />
                              {isLoading ? "Conectando..." : `Conectar ${p.name}`}
                            </button>

                            <button
                              onClick={() => setManualConnectPlatform(isManualOpen ? null : p.id)}
                              className={`${profileStyles.advancedButton} w-full`}
                              type="button"
                              aria-expanded={isManualOpen}
                              aria-controls={`${p.id}-manual-config`}
                            >
                              <Key aria-hidden="true" className="w-3.5 h-3.5" />
                              {isManualOpen ? "Fechar configuração" : "Configuração manual"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OAuth details are intentionally disclosed only when needed. */}
            <details className={profileStyles.advancedDisclosure}>
              <summary>
                <span className={profileStyles.disclosureTitle}>
                  <Info aria-hidden="true" className="w-4 h-4" />
                  Configuração avançada
                </span>
                <span className={profileStyles.disclosureHint}>URLs OAuth</span>
              </summary>
              <div className={profileStyles.disclosureContent}>
                <p>
                  Use estas URLs somente ao configurar uma integração própria nos painéis das plataformas.
                </p>
                <div className={profileStyles.callbackGrid}>
                  {platformsConfig.map((p) => (
                    <div key={p.id} className={profileStyles.callbackItem}>
                      <div className="overflow-hidden">
                        <span className={profileStyles.callbackPlatform}>{p.name}</span>
                        <span className={profileStyles.callbackApi}>{p.apiName}</span>
                        <span className={profileStyles.callbackUrl} title={p.callbackUrl}>
                          {p.callbackUrl}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(p.callbackUrl, p.id)}
                        className={profileStyles.copyButton}
                        type="button"
                        aria-label={`Copiar URL de redirecionamento do ${p.name}`}
                      >
                        {copiedUrl === p.id ? (
                          <Check aria-hidden="true" className="w-4 h-4" />
                        ) : (
                          <Copy aria-hidden="true" className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            {/* Quick studio shortcuts */}
            <div className={`${profileStyles.shortcutCard} rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4`}>
              <div className="flex items-center gap-4">
                <div className={profileStyles.shortcutIcon}>
                  <Video aria-hidden="true" className="w-6 h-6" />
                </div>
                <div>
                  <h2 className={`${profileStyles.title} text-base font-bold`}>Continue criando</h2>
                  <p className={`${profileStyles.muted} text-sm`}>
                    Grave uma conversa ou finalize um clipe.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Link
                  href="/"
                  className={`${profileStyles.primaryButton} flex-1 sm:flex-none text-center justify-center`}
                >
                  Abrir Sala de Gravação
                </Link>
                <Link
                  href="/?editor=1"
                  className={`${profileStyles.secondaryButton} flex-1 sm:flex-none text-center justify-center`}
                >
                  Editor de Clipes
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={`${profileStyles.footer} py-6 text-center text-xs`}>
        <p>KLIPAPP · Crie, grave e publique.</p>
        <nav aria-label="Links legais" className={profileStyles.footerLinks}>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
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
        defaultTitle="Novo vídeo do KLIPAPP"
      />
    </div>
  );
}
