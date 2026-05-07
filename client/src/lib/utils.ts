import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function randomRoomId(): string {
  // Short, friendly, unambiguous alphabet (no 0/O/1/I/l).
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function randomClientId(): string {
  return Math.random().toString(36).slice(2, 10);
}
