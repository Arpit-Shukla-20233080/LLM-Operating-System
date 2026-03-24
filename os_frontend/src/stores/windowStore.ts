import { create } from 'zustand';

export type AppComponentKey = 'Terminal' | 'Settings' | 'FileViewer';

export interface WindowState {
  id: string;
  title: string;
  component: AppComponentKey;
  props: Record<string, unknown>;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  /** Position/size snapshot before maximizing */
  prevBounds?: { x: number; y: number; width: number; height: number };
}

export interface OpenWindowConfig {
  title: string;
  component: AppComponentKey;
  props?: Record<string, unknown>;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTHS: Record<AppComponentKey, number> = {
  Terminal: 720,
  Settings: 660,
  FileViewer: 640,
};
const DEFAULT_HEIGHTS: Record<AppComponentKey, number> = {
  Terminal: 520,
  Settings: 560,
  FileViewer: 480,
};

let _nextZ = 100;
let _cascade = 0; // offset counter for cascading new windows

function nextZ() {
  return ++_nextZ;
}

interface WindowStore {
  windows: Record<string, WindowState>;
  open: (id: string, config: OpenWindowConfig) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, width: number, height: number) => void;
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: {},

  open: (id, config) => {
    const existing = get().windows[id];
    if (existing) {
      // Bring to front and un-minimize
      set((s) => ({
        windows: {
          ...s.windows,
          [id]: { ...existing, minimized: false, zIndex: nextZ() },
        },
      }));
      return;
    }

    const w = config.width ?? DEFAULT_WIDTHS[config.component];
    const h = config.height ?? DEFAULT_HEIGHTS[config.component];
    const offset = (_cascade++ % 8) * 30;
    const x = Math.max(20, (window.innerWidth - w) / 2 + offset - 60);
    const y = Math.max(20, (window.innerHeight - h) / 3 + offset - 40);

    const win: WindowState = {
      id,
      title: config.title,
      component: config.component,
      props: config.props ?? {},
      x,
      y,
      width: w,
      height: h,
      zIndex: nextZ(),
      minimized: false,
      maximized: false,
    };

    set((s) => ({ windows: { ...s.windows, [id]: win } }));
  },

  close: (id) => {
    set((s) => {
      const next = { ...s.windows };
      delete next[id];
      return { windows: next };
    });
  },

  focus: (id) => {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: { ...s.windows, [id]: { ...win, zIndex: nextZ() } },
      };
    });
  },

  minimize: (id) => {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: { ...s.windows, [id]: { ...win, minimized: true } },
      };
    });
  },

  restore: (id) => {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: {
          ...s.windows,
          [id]: { ...win, minimized: false, zIndex: nextZ() },
        },
      };
    });
  },

  toggleMaximize: (id) => {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      const taskbarH = 48;
      if (win.maximized && win.prevBounds) {
        return {
          windows: {
            ...s.windows,
            [id]: {
              ...win,
              maximized: false,
              x: win.prevBounds.x,
              y: win.prevBounds.y,
              width: win.prevBounds.width,
              height: win.prevBounds.height,
              prevBounds: undefined,
              zIndex: nextZ(),
            },
          },
        };
      } else {
        return {
          windows: {
            ...s.windows,
            [id]: {
              ...win,
              maximized: true,
              prevBounds: { x: win.x, y: win.y, width: win.width, height: win.height },
              x: 0,
              y: 0,
              width: window.innerWidth,
              height: window.innerHeight - taskbarH,
              zIndex: nextZ(),
            },
          },
        };
      }
    });
  },

  move: (id, x, y) => {
    set((s) => {
      const win = s.windows[id];
      if (!win || win.maximized) return s;
      return { windows: { ...s.windows, [id]: { ...win, x, y } } };
    });
  },

  resize: (id, width, height) => {
    set((s) => {
      const win = s.windows[id];
      if (!win || win.maximized) return s;
      return {
        windows: {
          ...s.windows,
          [id]: {
            ...win,
            width: Math.max(320, width),
            height: Math.max(200, height),
          },
        },
      };
    });
  },
}));
