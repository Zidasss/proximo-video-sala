"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Scrollable data regions must be keyboard reachable. */

import {
  useMemo,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from "lucide-react";
import styles from "./ui.module.css";
import { Button, Card, Skeleton } from "./primitives";
import { cx, type UIIntent } from "./utils";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: UIIntent;
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
}

export function EmptyState({
  icon = <Inbox />,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div {...props} className={cx(styles.emptyState, compact && styles.emptyStateCompact, className)}>
      <span className={styles.emptyIcon} aria-hidden="true">{icon}</span>
      <strong className={styles.emptyTitle}>{title}</strong>
      {description && <span className={styles.emptyDescription}>{description}</span>}
      {(primaryAction || secondaryAction) && (
        <span className={styles.emptyActions}>
          {primaryAction && (
            <Button variant={primaryAction.variant ?? "primary"} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant={secondaryAction.variant ?? "outline"} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </span>
      )}
    </div>
  );
}

export type SortDirection = "asc" | "desc";

export interface DataTableSort {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  accessor?: (row: T) => ReactNode;
  cell?: (row: T, rowIndex: number) => ReactNode;
  sortable?: boolean;
  align?: "start" | "center" | "end";
  width?: string | number;
  hideBelow?: "sm" | "md" | "lg";
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T, index: number) => string;
  caption?: ReactNode;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  loading?: boolean;
  loadingRows?: number;
  emptyState?: ReactNode;
  stickyHeader?: boolean;
  striped?: boolean;
  compact?: boolean;
  className?: string;
  tableClassName?: string;
  rowClassName?: (row: T, index: number) => string | undefined;
}

function nextSort(current: DataTableSort | undefined, key: string): DataTableSort {
  if (current?.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

function SortIcon({ columnKey, sort }: { columnKey: string; sort?: DataTableSort }) {
  if (sort?.key !== columnKey) return <ArrowUpDown aria-hidden="true" />;
  return sort.direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />;
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  caption,
  sort,
  onSortChange,
  loading = false,
  loadingRows = 5,
  emptyState,
  stickyHeader = false,
  striped = false,
  compact = false,
  className,
  tableClassName,
  rowClassName,
}: DataTableProps<T>) {
  const columnStyles = useMemo(
    () => columns.map((column) => ({ width: column.width } as CSSProperties)),
    [columns],
  );
  return (
    <Card padding="none" variant="outlined" className={cx(styles.tableCard, className)}>
      {/* A scrollable region must be keyboard-focusable so horizontal tables remain operable. */}
      <div
        className={styles.tableScroller}
        tabIndex={0}
        role="region"
        aria-busy={loading || undefined}
        aria-label={typeof caption === "string" ? caption : "Tabela de dados"}
      >
        {loading && <span className={styles.srOnly} role="status">Carregando dados da tabela</span>}
        <table className={cx(styles.dataTable, compact && styles.dataTableCompact, tableClassName)}>
          {caption && <caption className={styles.tableCaption}>{caption}</caption>}
          <thead className={stickyHeader ? styles.tableStickyHeader : undefined}>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  style={columnStyles[index]}
                  data-align={column.align ?? "start"}
                  data-hide-below={column.hideBelow}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === "asc" ? "ascending" : "descending"
                      : undefined
                  }
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => onSortChange(nextSort(sort, column.key))}
                    >
                      <span>{column.header}</span>
                      <SortIcon columnKey={column.key} sort={sort} />
                    </button>
                  ) : column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: loadingRows }, (_, rowIndex) => (
              <tr key={`loading-${rowIndex}`} aria-hidden="true">
                {columns.map((column, columnIndex) => (
                  <td
                    key={column.key}
                    data-align={column.align ?? "start"}
                    data-hide-below={column.hideBelow}
                  >
                    <Skeleton width={`${Math.max(36, 92 - columnIndex * 11)}%`} height="1rem" />
                  </td>
                ))}
              </tr>
            )) : data.map((row, rowIndex) => (
              <tr
                key={getRowId(row, rowIndex)}
                className={cx(striped && rowIndex % 2 === 1 && styles.tableStripedRow, rowClassName?.(row, rowIndex))}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-align={column.align ?? "start"}
                    data-hide-below={column.hideBelow}
                  >
                    {column.cell?.(row, rowIndex) ?? column.accessor?.(row) ?? null}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={styles.tableEmptyCell}>
                  {emptyState ?? <EmptyState compact title="Nenhum resultado" description="Tente ajustar sua busca ou os filtros." />}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
