"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import styles from "./ui.module.css";
import { IconButton } from "./primitives";
import { clamp, cx, type UISize } from "./utils";

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
  orientation: "horizontal" | "vertical";
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Os componentes de Tabs devem estar dentro de <Tabs>.");
  return context;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  orientation = "horizontal",
  children,
  className,
  ...props
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const baseId = useId();
  const value = controlledValue ?? internalValue;
  const context = useMemo<TabsContextValue>(() => ({
    value,
    baseId,
    orientation,
    setValue: (nextValue) => {
      if (controlledValue === undefined) setInternalValue(nextValue);
      onValueChange?.(nextValue);
    },
  }), [baseId, controlledValue, onValueChange, orientation, value]);
  return (
    <TabsContext.Provider value={context}>
      <div {...props} className={cx(styles.tabs, styles[`tabs_${orientation}`], className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export const TabsList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function TabsList(
  { className, ...props },
  ref,
) {
  const { orientation } = useTabsContext();
  return (
    <div
      {...props}
      ref={ref}
      role="tablist"
      aria-orientation={orientation}
      className={cx(styles.tabsList, className)}
    />
  );
});

export interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { value, icon, badge, className, children, disabled, onKeyDown, onClick, ...props },
  ref,
) {
  const context = useTabsContext();
  const selected = context.value === value;
  const idValue = encodeURIComponent(value);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const horizontalKeys = context.orientation === "horizontal" ? ["ArrowLeft", "ArrowRight"] : [];
    const verticalKeys = context.orientation === "vertical" ? ["ArrowUp", "ArrowDown"] : [];
    if (![...horizontalKeys, ...verticalKeys, "Home", "End"].includes(event.key)) return;
    const list = event.currentTarget.closest<HTMLElement>("[role='tablist']");
    const tabs = Array.from(list?.querySelectorAll<HTMLButtonElement>("[role='tab']:not(:disabled)") ?? []);
    const index = tabs.indexOf(event.currentTarget);
    let nextIndex = index;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
    else nextIndex = (index - 1 + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      id={`${context.baseId}-tab-${idValue}`}
      role="tab"
      aria-selected={selected}
      aria-controls={`${context.baseId}-panel-${idValue}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      className={cx(styles.tabsTrigger, selected && styles.tabsTriggerActive, className)}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setValue(value);
      }}
    >
      {icon && <span className={styles.tabsIcon} aria-hidden="true">{icon}</span>}
      <span>{children}</span>
      {badge && <span className={styles.tabsBadge}>{badge}</span>}
    </button>
  );
});

export interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  keepMounted?: boolean;
}

export const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(function TabsPanel(
  { value, keepMounted = false, className, children, ...props },
  ref,
) {
  const context = useTabsContext();
  const selected = context.value === value;
  if (!keepMounted && !selected) return null;
  const idValue = encodeURIComponent(value);
  return (
    <div
      {...props}
      ref={ref}
      id={`${context.baseId}-panel-${idValue}`}
      role="tabpanel"
      aria-labelledby={`${context.baseId}-tab-${idValue}`}
      hidden={!selected}
      tabIndex={0}
      className={cx(styles.tabsPanel, className)}
    >
      {children}
    </div>
  );
});

type PaginationToken = number | "ellipsis-start" | "ellipsis-end";

function paginationTokens(page: number, total: number, siblings: number): PaginationToken[] {
  if (total <= 7 + siblings * 2) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, page - siblings);
  const end = Math.min(total - 1, page + siblings);
  const values: PaginationToken[] = [1];
  if (start > 2) values.push("ellipsis-start");
  for (let current = start; current <= end; current += 1) values.push(current);
  if (end < total - 1) values.push("ellipsis-end");
  values.push(total);
  return values;
}

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblings?: number;
  size?: Exclude<UISize, "lg">;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  siblings = 1,
  size = "md",
  label = "Paginação",
  previousLabel = "Página anterior",
  nextLabel = "Próxima página",
  className,
  ...props
}: PaginationProps) {
  const safePage = clamp(page, 1, Math.max(1, totalPages));
  const tokens = paginationTokens(safePage, Math.max(1, totalPages), Math.max(0, siblings));
  return (
    <nav {...props} aria-label={label} className={cx(styles.pagination, styles[`pagination_${size}`], className)}>
      <IconButton
        variant="outline"
        size={size}
        label={previousLabel}
        icon={<ChevronLeft />}
        disabled={safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
      />
      <ol className={styles.paginationList}>
        {tokens.map((token) => typeof token === "number" ? (
          <li key={token}>
            <button
              type="button"
              className={cx(styles.pageButton, token === safePage && styles.pageButtonActive)}
              aria-label={`Página ${token}`}
              aria-current={token === safePage ? "page" : undefined}
              onClick={() => onPageChange(token)}
            >
              {token}
            </button>
          </li>
        ) : (
          <li key={token} className={styles.pageEllipsis} aria-hidden="true">
            <MoreHorizontal />
          </li>
        ))}
      </ol>
      <IconButton
        variant="outline"
        size={size}
        label={nextLabel}
        icon={<ChevronRight />}
        disabled={safePage >= totalPages}
        onClick={() => onPageChange(safePage + 1)}
      />
    </nav>
  );
}
