import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about the custom radius tokens so later classes win cleanly.
const twMerge = extendTailwindMerge({ extend: { theme: { radius: ['control', 'panel'] } } });

/** Join class names; when two Tailwind utilities conflict, the last one wins. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
