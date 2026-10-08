import type { ProjectStatus, TaskPriority, TaskStatus } from '@lumen/shared';
import { useColorScheme } from 'react-native';

/**
 * Same palette as the web app: status colours are named after laser lines
 * (405 violet, 488 blue, 532 green, 589 amber, 635 red).
 */
const light = {
  canvas: '#f5f7fa',
  surface: '#ffffff',
  sunken: '#eef2f7',
  ink: '#12203a',
  inkMuted: '#56667f',
  inkFaint: '#8693a8',
  line: '#dce3ec',
  lineStrong: '#c3cddb',
  onAccent: '#ffffff',
  violet: '#5b3df5',
  violetSoft: '#ece8ff',
  blue: '#0b7fc2',
  blueSoft: '#e2f1fb',
  green: '#12855a',
  greenSoft: '#e0f4ea',
  amber: '#b07405',
  amberSoft: '#fdf1d8',
  red: '#c8372a',
  redSoft: '#fbe6e3',
  slate: '#6d7a90',
  slateSoft: '#edf0f5',
};

export type Palette = typeof light;

const dark: Palette = {
  canvas: '#0d1424',
  surface: '#131c30',
  sunken: '#0f1729',
  ink: '#e6ecf5',
  inkMuted: '#9aa8bf',
  inkFaint: '#6b7a93',
  line: '#233049',
  lineStrong: '#31405e',
  onAccent: '#0d1424',
  violet: '#9d8bff',
  violetSoft: '#241f4d',
  blue: '#49b2f0',
  blueSoft: '#12304a',
  green: '#3fcf8e',
  greenSoft: '#123a2b',
  amber: '#f2b64a',
  amberSoft: '#3d2f12',
  red: '#ff7a6b',
  redSoft: '#44201d',
  slate: '#9aa8bf',
  slateSoft: '#1c2740',
};

export const spectrum = ['#5b3df5', '#0b7fc2', '#12855a', '#b07405', '#c8372a'] as const;

export const fonts = {
  regular: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  bold: 'InstrumentSans_700Bold',
};

export const radius = { control: 8, panel: 14, pill: 999 };

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

type Tone = { fg: keyof Palette; bg: keyof Palette };

export const statusTone: Record<TaskStatus | ProjectStatus, Tone> = {
  PENDING: { fg: 'slate', bg: 'slateSoft' },
  NOT_STARTED: { fg: 'slate', bg: 'slateSoft' },
  IN_PROGRESS: { fg: 'blue', bg: 'blueSoft' },
  COMPLETED: { fg: 'green', bg: 'greenSoft' },
};

export const priorityTone: Record<TaskPriority, keyof Palette> = {
  LOW: 'slate',
  MEDIUM: 'amber',
  HIGH: 'red',
};
