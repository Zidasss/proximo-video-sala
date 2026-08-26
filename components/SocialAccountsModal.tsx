"use client";

import React, { useState, useEffect } from "react";
import { X, CheckCircle2, AlertCircle, Link2, Unlink, RefreshCw } from "lucide-react";
import { SocialAccount } from "../lib/types/publishing";

const YouTubeIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

interface SocialAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SocialAccountsModal({ isOpen, onClose }: SocialAccountsModalProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/social/accounts");
      const data = await res.json();
      if (data.accounts) {
        setAccounts(data.accounts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = (platform: string) => {
    setActionLoading(platform);
    const returnTo = typeof window !== "undefined" ? window.location.pathname : "/";
    window.location.href = `/api/auth/connect/${platform}?next=${encodeURIComponent(returnTo)}`;
  };

  const handleDisconnect = async (platform: string) => {
    try {
      setActionLoading(platform);
      await fetch(`/api/social/accounts?platform=${platform}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.platform !== platform));
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const platformsConfig = [
    {
      id: "youtube",
      name: "YouTube Shorts",
      desc: "Upload automático com #Shorts",
      icon: (
        <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md">
          <YouTubeIcon className="w-5 h-5" />
        </div>
      ),
    },
    {
      id: "tiktok",
      name: "TikTok",
      desc: "Post direto no Feed do TikTok",
      icon: (
        <div className="w-10 h-10 rounded-xl bg-black border border-zinc-700 flex items-center justify-center text-white shadow-md">
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.81 4.48 6.27 6.27 0 0 0 1.99-4.48V8.69a8.18 8.18 0 0 0 4.79 1.52V6.76c-.34-.02-.68-.05-1-.07z" />
          </svg>
        </div>
      ),
    },
    {
      id: "instagram",
      name: "Instagram Reels",
      desc: "Publicação no Feed e Reels",
      icon: (
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-md">
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
        </div>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(10, 11, 11, 0.85)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="relative w-full max-w-lg p-6 rounded-3xl text-[#fff8f5] shadow-2xl"
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

        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: "linear-gradient(135deg, #ff7564, #d84f41)",
              boxShadow: "0 6px 18px rgba(255, 107, 92, 0.35)",
            }}
          >
            <Link2 className="w-5 h-5 text-[#24100e]" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-[#fff8f5]">
              Contas Conectadas
            </h2>
            <p className="text-xs text-[#bcb4ae] mt-0.5">
              Vincule suas contas oficiais para publicar vídeos em 1 clique
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-[#aaa19b]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#ff7160]" />
            <span className="text-xs">Carregando contas...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {platformsConfig.map((p) => {
              const connectedAccount = accounts.find((a) => a.platform === p.id);
              const isConnected = Boolean(connectedAccount);
              const isLoading = actionLoading === p.id;

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-4 rounded-2xl transition"
                  style={{
                    background: isConnected ? "#191515" : "#131414",
                    border: isConnected
                      ? "1px solid rgba(255, 113, 96, 0.3)"
                      : "1px solid rgba(255, 255, 255, 0.12)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    {p.icon}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#fff8f5]">{p.name}</span>
                        {isConnected ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: "rgba(16, 185, 129, 0.15)",
                              border: "1px solid rgba(16, 185, 129, 0.35)",
                              color: "#6ee7b7",
                            }}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Conectado
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{
                              background: "rgba(255, 255, 255, 0.06)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              color: "#99908a",
                            }}
                          >
                            <AlertCircle className="w-3 h-3" /> Não vinculado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#aaa19b] mt-0.5">
                        {isConnected
                          ? connectedAccount?.accountHandle || connectedAccount?.accountName
                          : p.desc}
                      </p>
                    </div>
                  </div>

                  <div>
                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnect(p.id)}
                        disabled={isLoading}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        style={{
                          background: "#281716",
                          border: "1px solid rgba(255, 113, 96, 0.35)",
                          color: "#ffaaa0",
                        }}
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        {isLoading ? "..." : "Desconectar"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(p.id)}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, #ff7564, #d84f41)",
                          border: "1px solid #ff7160",
                          color: "#25100e",
                          boxShadow: "0 4px 14px rgba(255, 107, 92, 0.3)",
                        }}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        {isLoading ? "Conectando..." : "Conectar"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[#ffffff14] flex justify-between items-center text-xs text-[#958e88]">
          <span>Credenciais salvas de forma segura no Supabase.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer text-[#fff8f5]"
            style={{
              background: "#1c1b1b",
              border: "1px solid rgba(255, 255, 255, 0.18)",
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
