"use client";

import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import styles from "./ui.module.css";
import { Button, IconButton } from "./primitives";
import { cx, type UISize, type UIStatus } from "./utils";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const subscribeMounted = () => () => undefined;
let bodyScrollLocks = 0;
let bodyOverflowBeforeLock = "";

function lockBodyScroll() {
  if (bodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyScrollLocks += 1;
}

function unlockBodyScroll() {
  bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
  if (bodyScrollLocks === 0) document.body.style.overflow = bodyOverflowBeforeLock;
}

function useMounted(): boolean {
  return useSyncExternalStore(subscribeMounted, () => true, () => false);
}

function useDialogFocus(
  open: boolean,
  onClose: () => void,
  surfaceRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    const surface = surfaceRef.current;
    const initial = initialFocusRef?.current ?? surface?.querySelector<HTMLElement>(focusableSelector) ?? surface;
    const animationFrame = requestAnimationFrame(() => initial?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !surface) return;
      const nodes = Array.from(surface.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((node) => node.getClientRects().length > 0);
      if (!nodes.length) {
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!surface.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
      previousFocus?.focus();
    };
  }, [initialFocusRef, open, surfaceRef]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: UISize | "xl";
  role?: "dialog" | "alertdialog";
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  role = "dialog",
  closeLabel = "Fechar janela",
  closeOnBackdrop = true,
  initialFocusRef,
  className,
}: ModalProps) {
  const mounted = useMounted();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogFocus(open, onClose, surfaceRef, initialFocusRef);
  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onPointerDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={surfaceRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(styles.modal, styles[`modal_${size}`], className)}
      >
        <header className={styles.overlayHeader}>
          <div className={styles.overlayHeading}>
            <h2 className={styles.overlayTitle} id={titleId}>{title}</h2>
            {description && <p className={styles.overlayDescription} id={descriptionId}>{description}</p>}
          </div>
          <IconButton variant="ghost" size="sm" label={closeLabel} icon={<X />} onClick={onClose} />
        </header>
        <div className={styles.overlayBody}>{children}</div>
        {footer && <footer className={styles.overlayFooter}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export interface DrawerProps extends Omit<ModalProps, "size"> {
  side?: "left" | "right" | "bottom";
  width?: "sm" | "md" | "lg";
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  width = "md",
  role = "dialog",
  closeLabel = "Fechar painel",
  closeOnBackdrop = true,
  initialFocusRef,
  className,
}: DrawerProps) {
  const mounted = useMounted();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogFocus(open, onClose, surfaceRef, initialFocusRef);
  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onPointerDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={surfaceRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(styles.drawer, styles[`drawer_${side}`], styles[`drawerWidth_${width}`], className)}
      >
        <header className={styles.overlayHeader}>
          <div className={styles.overlayHeading}>
            <h2 className={styles.overlayTitle} id={titleId}>{title}</h2>
            {description && <p className={styles.overlayDescription} id={descriptionId}>{description}</p>}
          </div>
          <IconButton variant="ghost" size="sm" label={closeLabel} icon={<X />} onClick={onClose} />
        </header>
        <div className={styles.overlayBody}>{children}</div>
        {footer && <footer className={styles.overlayFooter}>{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

export interface DropdownMenuItem {
  id: string;
  label?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  triggerLabel: string;
  items: DropdownMenuItem[];
  align?: "start" | "end";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function DropdownMenu({
  trigger,
  triggerLabel,
  items,
  align = "start",
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
}: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = useId();
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange]);

  const focusItem = useCallback((direction: "first" | "last") => {
    requestAnimationFrame(() => {
      const nodes = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)");
      if (!nodes?.length) return;
      nodes[direction === "first" ? 0 : nodes.length - 1]?.focus();
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open, setOpen]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? [],
    );
    const current = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      nodes[(current + offset + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      nodes[event.key === "Home" ? 0 : nodes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cx(styles.dropdown, className)}>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        className={styles.dropdownTrigger}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            focusItem(event.key === "ArrowDown" ? "first" : "last");
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          tabIndex={-1}
          className={cx(styles.dropdownMenu, styles[`dropdown_${align}`])}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => item.separator ? (
            <div key={item.id} role="separator" className={styles.menuSeparator} />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx(styles.menuItem, item.danger && styles.menuItemDanger)}
              onClick={() => {
                item.onSelect?.();
                setOpen(false);
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
            >
              {item.icon && <span className={styles.menuIcon} aria-hidden="true">{item.icon}</span>}
              <span className={styles.menuLabel}>{item.label}</span>
              {item.shortcut && <kbd className={styles.menuShortcut}>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<{
    "aria-describedby"?: string;
    onMouseEnter?: MouseEventHandler<HTMLElement>;
    onMouseLeave?: MouseEventHandler<HTMLElement>;
    onFocus?: FocusEventHandler<HTMLElement>;
    onBlur?: FocusEventHandler<HTMLElement>;
    onKeyDown?: KeyboardEventHandler<HTMLElement>;
  }>;
  placement?: "top" | "right" | "bottom" | "left";
  delay?: number;
  disabled?: boolean;
  className?: string;
}

export function Tooltip({
  content,
  children,
  placement = "top",
  delay = 300,
  disabled = false,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const show = () => {
    if (disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // React's ref lint cannot infer that these callbacks only run after render.
  // eslint-disable-next-line react-hooks/refs
  const trigger = cloneElement(children, {
    "aria-describedby": [children.props["aria-describedby"], visible ? id : undefined]
      .filter(Boolean)
      .join(" ") || undefined,
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event);
      if (!event.defaultPrevented) show();
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      if (!event.defaultPrevented) show();
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      hide();
    },
    onKeyDown: (event) => {
      children.props.onKeyDown?.(event);
      if (event.key === "Escape") hide();
    },
  });

  return (
    <span className={cx(styles.tooltipRoot, className)}>
      {trigger}
      {visible && (
        <span id={id} role="tooltip" className={cx(styles.tooltip, styles[`tooltip_${placement}`])}>
          {content}
        </span>
      )}
    </span>
  );
}

export interface ToastData {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: UIStatus;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export type ToastInput = Omit<ToastData, "id"> & { id?: string };

interface ToastContextValue {
  toasts: ToastData[];
  pushToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children, maxToasts = 4 }: { children: ReactNode; maxToasts?: number }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const clearToasts = useCallback(() => setToasts([]), []);
  const pushToast = useCallback((input: ToastInput) => {
    const id = input.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.filter((toast) => toast.id !== id), { ...input, id }].slice(-maxToasts));
    return id;
  }, [maxToasts]);
  const value = useMemo(() => ({ toasts, pushToast, dismissToast, clearToasts }), [clearToasts, dismissToast, pushToast, toasts]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast deve ser usado dentro de ToastProvider.");
  return context;
}

const toastIcons: Record<UIStatus, ReactNode> = {
  neutral: <Info />,
  info: <Info />,
  success: <CheckCircle2 />,
  warning: <AlertCircle />,
  danger: <XCircle />,
};

export interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}

export function Toast({ id, title, description, tone = "neutral", duration = 5000, action, onDismiss }: ToastProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (duration <= 0 || paused) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [duration, id, onDismiss, paused]);
  const urgent = tone === "danger" || tone === "warning";
  return (
    <article
      className={cx(styles.toast, styles[`toast_${tone}`])}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <span className={styles.toastIcon} aria-hidden="true">{toastIcons[tone]}</span>
      <span className={styles.toastContent}>
        <strong className={styles.toastTitle}>{title}</strong>
        {description && <span className={styles.toastDescription}>{description}</span>}
        {action && <Button variant="ghost" size="sm" onClick={action.onClick}>{action.label}</Button>}
      </span>
      <IconButton variant="ghost" size="sm" label="Fechar notificação" icon={<X />} onClick={() => onDismiss(id)} />
    </article>
  );
}

export function ToastViewport({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: string) => void }) {
  const mounted = useMounted();
  if (!mounted || !toasts.length) return null;
  return createPortal(
    <div className={styles.toastViewport} role="region" aria-label="Notificações">
      {toasts.map((toast) => <Toast key={toast.id} {...toast} onDismiss={onDismiss} />)}
    </div>,
    document.body,
  );
}
