type Theme = 'default' | 'soft' | 'cyan' | 'ocean' | 'sunset' | 'forest' | 'sunishka';

interface ThemeColors {
  primary: string;
  secondary: string;
  surface: string;
  surfaceHover: string;
  input: string;
  border: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
}

const themes: Record<Theme, ThemeColors> = {
  default: {
    primary: '#8b5cf6',
    secondary: '#ec4899',
    surface: 'rgba(255, 255, 255, 0.05)',
    surfaceHover: 'rgba(255, 255, 255, 0.1)',
    input: 'rgba(0, 0, 0, 0.3)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.8)',
      muted: 'rgba(255, 255, 255, 0.4)',
    },
  },
  soft: {
    primary: '#f472b6',
    secondary: '#fb923c',
    surface: 'rgba(255, 182, 193, 0.05)',
    surfaceHover: 'rgba(255, 182, 193, 0.1)',
    input: 'rgba(255, 240, 245, 0.1)',
    border: 'rgba(255, 182, 193, 0.2)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.85)',
      muted: 'rgba(255, 255, 255, 0.5)',
    },
  },
  cyan: {
    primary: '#06b6d4',
    secondary: '#0ea5e9',
    surface: 'rgba(6, 182, 212, 0.05)',
    surfaceHover: 'rgba(6, 182, 212, 0.1)',
    input: 'rgba(8, 145, 178, 0.2)',
    border: 'rgba(6, 182, 212, 0.2)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.85)',
      muted: 'rgba(255, 255, 255, 0.5)',
    },
  },
  ocean: {
    primary: '#3b82f6',
    secondary: '#14b8a6',
    surface: 'rgba(59, 130, 246, 0.05)',
    surfaceHover: 'rgba(59, 130, 246, 0.1)',
    input: 'rgba(30, 64, 175, 0.2)',
    border: 'rgba(59, 130, 246, 0.2)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.85)',
      muted: 'rgba(255, 255, 255, 0.5)',
    },
  },
  sunset: {
    primary: '#f59e0b',
    secondary: '#ef4444',
    surface: 'rgba(245, 158, 11, 0.05)',
    surfaceHover: 'rgba(245, 158, 11, 0.1)',
    input: 'rgba(180, 83, 9, 0.2)',
    border: 'rgba(245, 158, 11, 0.2)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.85)',
      muted: 'rgba(255, 255, 255, 0.5)',
    },
  },
  forest: {
    primary: '#10b981',
    secondary: '#84cc16',
    surface: 'rgba(16, 185, 129, 0.05)',
    surfaceHover: 'rgba(16, 185, 129, 0.1)',
    input: 'rgba(5, 150, 105, 0.2)',
    border: 'rgba(16, 185, 129, 0.2)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.85)',
      muted: 'rgba(255, 255, 255, 0.5)',
    },
  },
  sunishka: {
    primary: '#000000',
    secondary: '#333333',
    surface: 'rgba(255, 255, 255, 0.05)',
    surfaceHover: 'rgba(255, 255, 255, 0.1)',
    input: 'rgba(255, 255, 255, 0.1)',
    border: 'rgba(255, 255, 255, 0.15)',
    text: {
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.85)',
        muted: 'rgba(255, 255, 255, 0.5)',
    },
  },
};

class ThemeStore {
  currentTheme = $state<Theme>('default');
  
  constructor() {
    // Load theme from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as Theme;
      if (saved && themes[saved]) {
        this.currentTheme = saved;
      }
    }
  }
  
  setTheme(theme: Theme) {
    this.currentTheme = theme;
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
    this.applyTheme();
  }
  
  applyTheme() {
    const theme = themes[this.currentTheme];
    const root = document.documentElement;
    
    root.style.setProperty('--color-primary', theme.primary);
    root.style.setProperty('--color-secondary', theme.secondary);
    root.style.setProperty('--color-surface', theme.surface);
    root.style.setProperty('--color-surface-hover', theme.surfaceHover);
    root.style.setProperty('--color-input', theme.input);
    root.style.setProperty('--color-border', theme.border);
    root.style.setProperty('--color-text-primary', theme.text.primary);
    root.style.setProperty('--color-text-secondary', theme.text.secondary);
    root.style.setProperty('--color-text-muted', theme.text.muted);
  }
  
  getThemes() {
    return Object.keys(themes) as Theme[];
  }
  
  getThemeName(theme: Theme): string {
    const names: Record<Theme, string> = {
      default: 'Default Purple',
      soft: 'Soft Pink',
      cyan: 'Cyan Blue',
      ocean: 'Ocean Blue',
      sunset: 'Sunset Orange',
      forest: 'Forest Green',
      sunishka: "Sunishka's Favourite",
    };
    return names[theme];
  }
}

export const themeStore = new ThemeStore();
