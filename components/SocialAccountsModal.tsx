"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  LockKeyhole,
  Music2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { Badge, Button, Modal, Skeleton } from "./ui";
import { SocialAccount, SocialPlatform } from "../lib/types/publishing";
import styles from "./SocialPublishing.module.css";

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const platformConfig: Array<{
  id: SocialPlatform;
  name: string;
  description: string;
  icon: React.ReactNode;
  markClass: string;
}> = [
  {
    id: "youtube",
    name: "YouTube Shorts",
    description: "Envie vídeos curtos para o seu canal.",
    icon: <YouTubeIcon />,
    markClass: styles.youtubeMark,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Publique diretamente no TikTok.",
    icon: <Music2 aria-hidden="true" />,
    markClass: styles.tiktokMark,
  },
  {
    id: "instagram",
    name: "Instagram Reels",
    description: "Distribua para Reels e Feed.",
    icon: <InstagramIcon />,
    markClass: styles.instagramMark,
  },
];

interface SocialAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SocialAccountsModal({ isOpen, onClose }: SocialAccountsModalProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/social/accounts");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar as contas.");
      setAccounts(data.accounts || []);
    } catch (requestError) {
      console.error(requestError);
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as contas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => void fetchAccounts(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchAccounts, isOpen]);

  const handleConnect = (platform: SocialPlatform) => {
    setError("");
    setActionLoading(platform);
    const returnTo = typeof window !== "undefined" ? window.location.pathname : "/";
    window.location.assign(`/api/auth/connect/${platform}?next=${encodeURIComponent(returnTo)}`);
  };

  const handleDisconnect = async (platform: SocialPlatform) => {
    setActionLoading(platform);
    setError("");
    try {
      const response = await fetch(`/api/social/accounts?platform=${platform}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível desconectar a conta.");
      setAccounts((current) => current.filter((account) => account.platform !== platform));
    } catch (requestError) {
      console.error(requestError);
      setError(requestError instanceof Error ? requestError.message : "Não foi possível desconectar a conta.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="md"
      className={`${styles.modalTheme} ${styles.accountsModal}`}
      title={<span className={styles.titleWithIcon}><Link2 aria-hidden="true" /> Contas sociais</span>}
      description="Conecte os canais em que você deseja publicar."
      closeLabel="Fechar contas sociais"
      footer={
        <div className={styles.footerActions}>
          <span className={styles.footerNote}><LockKeyhole aria-hidden="true" /> Credenciais protegidas no Supabase.</span>
          <Button variant="outline" size="lg" onClick={onClose}>Concluir</Button>
        </div>
      }
    >
      <div className={styles.accountList} aria-live="polite" aria-busy={loading || undefined}>
        {error && (
          <div className={`${styles.inlineMessage} ${styles.messageError}`} role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => void fetchAccounts()} leadingIcon={<RefreshCw aria-hidden="true" />}>
              Tentar novamente
            </Button>
          </div>
        )}

        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div className={styles.loadingCard} key={index}>
              <Skeleton width="2.65rem" height="2.65rem" circle />
              <span className={styles.loadingCopy}>
                <Skeleton width="45%" height="0.85rem" />
                <Skeleton width="70%" height="0.7rem" />
              </span>
              <Skeleton width="6.5rem" height="2.75rem" />
            </div>
          ))
        ) : (
          platformConfig.map((platform) => {
            const connectedAccount = accounts.find((account) => account.platform === platform.id);
            const isConnected = Boolean(connectedAccount);
            const isLoading = actionLoading === platform.id;
            return (
              <article key={platform.id} className={styles.accountCard}>
                <div className={styles.accountIdentity}>
                  <span className={`${styles.platformMark} ${platform.markClass}`}>{platform.icon}</span>
                  <span className={styles.accountCopy}>
                    <span className={styles.accountTitleRow}>
                      <span className={styles.accountName}>{platform.name}</span>
                      <Badge tone={isConnected ? "success" : "neutral"} size="sm" dot={isConnected}>
                        {isConnected ? "Conectada" : "Não conectada"}
                      </Badge>
                    </span>
                    <span className={styles.accountDescription} title={isConnected ? connectedAccount?.accountHandle || connectedAccount?.accountName : platform.description}>
                      {isConnected ? connectedAccount?.accountHandle || connectedAccount?.accountName : platform.description}
                    </span>
                  </span>
                </div>

                {isConnected ? (
                  <Button
                    variant="danger"
                    size="md"
                    loading={isLoading}
                    loadingLabel="Desconectando…"
                    leadingIcon={<Unlink aria-hidden="true" />}
                    onClick={() => void handleDisconnect(platform.id)}
                  >
                    Desconectar
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    loading={isLoading}
                    loadingLabel="Conectando…"
                    leadingIcon={<Link2 aria-hidden="true" />}
                    onClick={() => handleConnect(platform.id)}
                  >
                    Conectar
                  </Button>
                )}
              </article>
            );
          })
        )}

        {!loading && !error && accounts.length > 0 && (
          <div className={`${styles.inlineMessage} ${styles.messageSuccess}`} role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>{accounts.length} {accounts.length === 1 ? "conta conectada" : "contas conectadas"} ao KLIPAPP.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
