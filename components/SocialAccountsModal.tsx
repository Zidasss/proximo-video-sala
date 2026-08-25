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
    window.location.href = `/api/auth/connect/${platform}`;
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
      color: "from-red-600 to-rose-700",
      icon: (
        <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md">
          <YouTubeIcon className="w-5 h-5" />
        </div>
      ),
    },
    {
      id: "tiktok",
      name: "TikTok",
      desc: "Post direto no Feed do TikTok",
      color: "from-zinc-900 to-black",
      icon: (
        <div className="w-9 h-9 rounded-xl bg-black border border-zinc-700 flex items-center justify-center text-white shadow-md">
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
      color: "from-purple-600 via-pink-600 to-amber-500",
      icon: (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-md">
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
        </div>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl text-zinc-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Contas Conectadas</h2>
            <p className="text-xs text-zinc-400">
              Vincule suas contas para publicar seus vídeos em todas as redes
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-xs">Carregando contas...</span>
          </div>
        ) : (
          <div className="space-y-3.5">
            {platformsConfig.map((p) => {
              const connectedAccount = accounts.find((a) => a.platform === p.id);
              const isConnected = Boolean(connectedAccount);
              const isLoading = actionLoading === p.id;

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-4 bg-zinc-800/60 border border-zinc-800 rounded-xl hover:border-zinc-700 transition"
                >
                  <div className="flex items-center gap-3">
                    {p.icon}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{p.name}</span>
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> Conectado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" /> Não vinculado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
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
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-800/50 border border-zinc-700 rounded-lg text-xs font-medium text-zinc-300 transition flex items-center gap-1.5"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        {isLoading ? "..." : "Desconectar"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(p.id)}
                        disabled={isLoading}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow flex items-center gap-1.5"
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

        <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-400">
          <span>Suas credenciais são salvas com criptografia.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
