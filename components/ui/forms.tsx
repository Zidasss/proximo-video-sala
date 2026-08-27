"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Check, ChevronDown, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import styles from "./ui.module.css";
import { cx, type UISize } from "./utils";

interface FieldMetaProps {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
}

function FieldMeta({
  id,
  label,
  description,
  error,
  optional,
}: FieldMetaProps & { id: string }) {
  if (!label && !description && !error) return null;
  return (
    <>
      {label && (
        <label className={styles.fieldLabel} htmlFor={id}>
          {label}
          {optional && <span className={styles.fieldOptional}>Opcional</span>}
        </label>
      )}
      {description && !error && (
        <span className={styles.fieldDescription} id={`${id}-description`}>
          {description}
        </span>
      )}
      {error && (
        <span className={styles.fieldError} id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </>
  );
}

function describedBy(id: string, description: ReactNode, error: ReactNode, explicit?: string) {
  return [explicit, error ? `${id}-error` : description ? `${id}-description` : undefined]
    .filter(Boolean)
    .join(" ") || undefined;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix">,
    FieldMetaProps {
  inputSize?: UISize;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    inputSize = "md",
    label,
    description,
    error,
    optional,
    prefix,
    suffix,
    id: providedId,
    className,
    containerClassName,
    disabled,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <span className={cx(styles.field, containerClassName)}>
      <FieldMeta id={id} label={label} description={description} error={error} optional={optional} />
      <span
        className={cx(
          styles.inputFrame,
          styles[`control_${inputSize}`],
          Boolean(error) && styles.controlError,
          disabled && styles.controlDisabled,
        )}
      >
        {prefix && <span className={styles.inputAdornment}>{prefix}</span>}
        <input
          {...props}
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-errormessage={error ? `${id}-error` : undefined}
          aria-describedby={describedBy(id, description, error, ariaDescribedBy)}
          className={cx(styles.input, className)}
        />
        {suffix && <span className={styles.inputAdornment}>{suffix}</span>}
      </span>
    </span>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldMetaProps {
  inputSize?: UISize;
  resize?: "none" | "vertical" | "both";
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    inputSize = "md",
    resize = "vertical",
    label,
    description,
    error,
    optional,
    id: providedId,
    className,
    containerClassName,
    disabled,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <span className={cx(styles.field, containerClassName)}>
      <FieldMeta id={id} label={label} description={description} error={error} optional={optional} />
      <textarea
        {...props}
        ref={ref}
        id={id}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-errormessage={error ? `${id}-error` : undefined}
        aria-describedby={describedBy(id, description, error, ariaDescribedBy)}
        className={cx(
          styles.textarea,
          styles[`control_${inputSize}`],
          styles[`resize_${resize}`],
          Boolean(error) && styles.controlError,
          className,
        )}
      />
    </span>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">,
    FieldMetaProps {
  inputSize?: UISize;
  options?: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    inputSize = "md",
    label,
    description,
    error,
    optional,
    options,
    placeholder,
    id: providedId,
    className,
    containerClassName,
    disabled,
    children,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <span className={cx(styles.field, containerClassName)}>
      <FieldMeta id={id} label={label} description={description} error={error} optional={optional} />
      <span className={cx(styles.selectFrame, disabled && styles.controlDisabled)}>
        <select
          {...props}
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-errormessage={error ? `${id}-error` : undefined}
          aria-describedby={describedBy(id, description, error, ariaDescribedBy)}
          className={cx(
            styles.select,
            styles[`control_${inputSize}`],
            Boolean(error) && styles.controlError,
            className,
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown aria-hidden="true" className={styles.selectChevron} />
      </span>
    </span>
  );
});

interface ChoiceMetaProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">,
    ChoiceMetaProps {
  indeterminate?: boolean;
  inputSize?: Exclude<UISize, "lg">;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    error,
    indeterminate = false,
    inputSize = "md",
    id: providedId,
    className,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const assignRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={cx(styles.choice, props.disabled && styles.choiceDisabled, className)} htmlFor={id}>
      <span className={cx(styles.choiceControl, styles[`choice_${inputSize}`])}>
        <input
          {...props}
          ref={assignRef}
          id={id}
          type="checkbox"
          aria-checked={indeterminate ? "mixed" : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-errormessage={error ? `${id}-error` : undefined}
          aria-describedby={describedBy(id, description, error, ariaDescribedBy)}
          className={styles.choiceInput}
        />
        <span className={styles.checkboxVisual} aria-hidden="true">
          {indeterminate ? <span className={styles.indeterminate} /> : <Check />}
        </span>
      </span>
      <span className={styles.choiceText}>
        <span className={styles.choiceLabel}>{label}</span>
        {description && <span id={`${id}-description`} className={styles.choiceDescription}>{description}</span>}
        {error && <span id={`${id}-error`} className={styles.fieldError} role="alert">{error}</span>}
      </span>
    </label>
  );
});

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">,
    ChoiceMetaProps {
  inputSize?: Exclude<UISize, "lg">;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  {
    label,
    description,
    error,
    inputSize = "md",
    id: providedId,
    className,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <label className={cx(styles.choice, props.disabled && styles.choiceDisabled, className)} htmlFor={id}>
      <span className={cx(styles.choiceControl, styles[`choice_${inputSize}`])}>
        <input
          {...props}
          ref={ref}
          id={id}
          type="radio"
          aria-describedby={describedBy(id, description, error, ariaDescribedBy)}
          className={styles.choiceInput}
        />
        <span className={styles.radioVisual} aria-hidden="true" />
      </span>
      <span className={styles.choiceText}>
        <span className={styles.choiceLabel}>{label}</span>
        {description && <span id={`${id}-description`} className={styles.choiceDescription}>{description}</span>}
        {error && <span id={`${id}-error`} className={styles.fieldError} role="alert">{error}</span>}
      </span>
    </label>
  );
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: ReactNode;
  description?: ReactNode;
  inputSize?: Exclude<UISize, "lg">;
  labelPosition?: "start" | "end";
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    label,
    description,
    inputSize = "md",
    labelPosition = "start",
    id: providedId,
    className,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const text = (
    <span className={styles.choiceText}>
      <span className={styles.choiceLabel}>{label}</span>
      {description && <span id={`${id}-description`} className={styles.choiceDescription}>{description}</span>}
    </span>
  );
  return (
    <label
      className={cx(styles.switchRow, props.disabled && styles.choiceDisabled, className)}
      htmlFor={id}
    >
      {labelPosition === "start" && text}
      <span className={cx(styles.switchControl, styles[`switch_${inputSize}`])}>
        <input
          {...props}
          ref={ref}
          id={id}
          type="checkbox"
          role="switch"
          aria-describedby={describedBy(id, description, undefined, ariaDescribedBy)}
          className={styles.switchInput}
        />
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
      </span>
      {labelPosition === "end" && text}
    </label>
  );
});

export interface SearchProps extends Omit<InputProps, "type" | "prefix" | "suffix" | "value"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
}

export const Search = forwardRef<HTMLInputElement, SearchProps>(function Search(
  {
    value,
    defaultValue = "",
    onValueChange,
    onClear,
    clearLabel = "Limpar busca",
    onChange,
    ...props
  },
  ref,
) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) setInternalValue(event.target.value);
    onValueChange?.(event.target.value);
    onChange?.(event);
  };
  const clear = () => {
    if (value === undefined) setInternalValue("");
    onValueChange?.("");
    onClear?.();
  };
  return (
    <Input
      {...props}
      ref={ref}
      type="search"
      value={currentValue}
      onChange={handleChange}
      prefix={<SearchIcon aria-hidden="true" />}
      suffix={
        currentValue ? (
          <button type="button" className={styles.clearButton} onClick={clear} aria-label={clearLabel}>
            <X aria-hidden="true" />
          </button>
        ) : undefined
      }
    />
  );
});

export interface FilterOption extends SelectOption {
  count?: number;
}

export interface FilterProps extends Omit<SelectProps, "options" | "prefix"> {
  options: FilterOption[];
  allLabel?: string;
}

export const Filter = forwardRef<HTMLSelectElement, FilterProps>(function Filter(
  { options, allLabel, className, ...props },
  ref,
) {
  return (
    <span className={styles.filterWrap}>
      <SlidersHorizontal aria-hidden="true" className={styles.filterIcon} />
      <Select ref={ref} {...props} className={cx(styles.filterSelect, className)}>
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}{option.count === undefined ? "" : ` (${option.count})`}
          </option>
        ))}
      </Select>
    </span>
  );
});
