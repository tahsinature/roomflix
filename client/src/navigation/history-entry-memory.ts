import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "react-router-dom";

const MAX_MEMORY_SLOTS = 500;
const historyEntryMemory = new Map<string, unknown>();

/**
 * Keeps meaningful page UI state attached to one browser-history entry.
 * Returning with Back/Forward restores it; opening the same URL as a new
 * entry receives fresh state. Transient state such as dialogs and playback
 * should continue to use ordinary useState.
 */
export function useHistoryEntryState<T>(slot: string, initialValue: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const { key: locationKey } = useLocation();
  const identity = `${locationKey}:${slot}`;
  const fallback = useMemo(() => resolveInitialValue(initialValue), [identity]);
  const [snapshot, setSnapshot] = useState(() => ({ identity, value: readHistoryEntryValue(identity, fallback) }));
  const value = snapshot.identity === identity ? snapshot.value : readHistoryEntryValue(identity, fallback);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => {
      setSnapshot((current) => {
        const currentValue = current.identity === identity ? current.value : readHistoryEntryValue(identity, fallback);
        const nextValue = typeof update === "function" ? (update as (previous: T) => T)(currentValue) : update;
        writeHistoryEntryValue(identity, nextValue);
        return { identity, value: nextValue };
      });
    },
    [fallback, identity],
  );

  return [value, setValue];
}

function resolveInitialValue<T>(initialValue: T | (() => T)): T {
  return typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
}

function readHistoryEntryValue<T>(identity: string, fallback: T): T {
  return historyEntryMemory.has(identity) ? (historyEntryMemory.get(identity) as T) : fallback;
}

function writeHistoryEntryValue(identity: string, value: unknown) {
  if (historyEntryMemory.has(identity)) historyEntryMemory.delete(identity);
  historyEntryMemory.set(identity, value);
  while (historyEntryMemory.size > MAX_MEMORY_SLOTS) {
    const oldestIdentity = historyEntryMemory.keys().next().value;
    if (typeof oldestIdentity !== "string") break;
    historyEntryMemory.delete(oldestIdentity);
  }
}
