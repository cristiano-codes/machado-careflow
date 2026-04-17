import { useRef, type ChangeEvent, type ClipboardEvent, type ComponentProps, type FocusEvent } from "react";
import { Input } from "@/components/ui/input";
import {
  applyDateMask,
  normalizePastedDateValue,
  sanitizeDateInput,
} from "@/features/agendaLab/utils/dateInput";

type MaskedDateInputProps = Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

function resolveCursorPosition(maskedValue: string, digitsBeforeCursor: number) {
  if (digitsBeforeCursor <= 0) return 0;

  let digitCount = 0;
  for (let index = 0; index < maskedValue.length; index += 1) {
    if (/\d/.test(maskedValue[index])) {
      digitCount += 1;
      if (digitCount >= digitsBeforeCursor) {
        return index + 1;
      }
    }
  }

  return maskedValue.length;
}

export function MaskedDateInput({
  value,
  onValueChange,
  onBlur,
  onPaste,
  inputMode = "numeric",
  placeholder = "dd/mm/aaaa",
  maxLength = 10,
  ...props
}: MaskedDateInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const rawValue = normalizePastedDateValue(event.target.value || "");
    const selectionStart = event.target.selectionStart ?? rawValue.length;
    const digitsBeforeCursor = sanitizeDateInput(rawValue.slice(0, selectionStart)).length;
    const maskedValue = applyDateMask(rawValue);

    onValueChange(maskedValue);

    requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element) return;
      const cursorPosition = resolveCursorPosition(maskedValue, digitsBeforeCursor);
      element.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedText = event.clipboardData.getData("text");
    const normalizedPastedText = normalizePastedDateValue(pastedText);
    if (!normalizedPastedText || normalizedPastedText === pastedText) {
      onPaste?.(event);
      return;
    }

    event.preventDefault();

    const element = event.currentTarget;
    const selectionStart = element.selectionStart ?? value.length;
    const selectionEnd = element.selectionEnd ?? value.length;
    const nextRawValue = `${value.slice(0, selectionStart)}${normalizedPastedText}${value.slice(
      selectionEnd
    )}`;
    const maskedValue = applyDateMask(nextRawValue);
    const digitsBeforeCursor = sanitizeDateInput(
      `${value.slice(0, selectionStart)}${normalizedPastedText}`
    ).length;

    onValueChange(maskedValue);

    requestAnimationFrame(() => {
      const currentElement = inputRef.current;
      if (!currentElement) return;
      const cursorPosition = resolveCursorPosition(maskedValue, digitsBeforeCursor);
      currentElement.setSelectionRange(cursorPosition, cursorPosition);
    });

    onPaste?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const maskedValue = applyDateMask(event.target.value);
    if (maskedValue !== value) {
      onValueChange(maskedValue);
    }
    onBlur?.(event);
  }

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
      onPaste={handlePaste}
      onBlur={handleBlur}
      inputMode={inputMode}
      maxLength={maxLength}
      placeholder={placeholder}
    />
  );
}
