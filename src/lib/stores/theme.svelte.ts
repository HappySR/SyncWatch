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
    primary: '#a78bfa',
    secondary: '#f0abfc',
    surface: 'rgba(255, 255, 255, 0.06)',
    surfaceHover: 'rgba(255, 255, 255, 0.12)',
    input: 'rgba(0, 0, 0, 0.35)',
    border: 'rgba(167, 139, 250, 0.25)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.85)',
      muted: 'rgba(255, 255, 255, 0.5)',
    },
  },
  soft: {
    primary: '#fda4af',
    secondary: '#fdba74',
    surface: 'rgba(253, 164, 175, 0.08)',
    surfaceHover: 'rgba(253, 164, 175, 0.15)',
    input: 'rgba(255, 240, 245, 0.12)',
    border: 'rgba(253, 164, 175, 0.3)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.9)',
      muted: 'rgba(255, 255, 255, 0.6)',
    },
  },
  cyan: {
    primary: '#22d3ee',
    secondary: '#38bdf8',
    surface: 'rgba(34, 211, 238, 0.08)',
    surfaceHover: 'rgba(34, 211, 238, 0.15)',
    input: 'rgba(8, 145, 178, 0.25)',
    border: 'rgba(34, 211, 238, 0.3)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.9)',
      muted: 'rgba(255, 255, 255, 0.6)',
    },
  },
  ocean: {
    primary: '#60a5fa',
    secondary: '#2dd4bf',
    surface: 'rgba(96, 165, 250, 0.08)',
    surfaceHover: 'rgba(96, 165, 250, 0.15)',
    input: 'rgba(30, 64, 175, 0.25)',
    border: 'rgba(96, 165, 250, 0.3)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.9)',
      muted: 'rgba(255, 255, 255, 0.6)',
    },
  },
  sunset: {
    primary: '#fbbf24',
    secondary: '#fb923c',
    surface: 'rgba(251, 191, 36, 0.08)',
    surfaceHover: 'rgba(251, 191, 36, 0.15)',
    input: 'rgba(180, 83, 9, 0.25)',
    border: 'rgba(251, 191, 36, 0.3)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.9)',
      muted: 'rgba(255, 255, 255, 0.6)',
    },
  },
  forest: {
    primary: '#34d399',
    secondary: '#a3e635',
    surface: 'rgba(52, 211, 153, 0.08)',
    surfaceHover: 'rgba(52, 211, 153, 0.15)',
    input: 'rgba(5, 150, 105, 0.25)',
    border: 'rgba(52, 211, 153, 0.3)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.9)',
      muted: 'rgba(255, 255, 255, 0.6)',
    },
  },
  sunishka: {
    primary: '#e5e5e5',
    secondary: '#cccccc',
    surface: 'rgba(255, 255, 255, 0.08)',
    surfaceHover: 'rgba(255, 255, 255, 0.15)',
    input: 'rgba(255, 255, 255, 0.12)',
    border: 'rgba(255, 255, 255, 0.2)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.9)',
      muted: 'rgba(255, 255, 255, 0.6)',
    },
  },
};

class ThemeStore {
  currentTheme = $state<Theme>('default');
  
  constructor() {
    // Load theme from localStorage, default to sunishka
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as Theme;
      if (saved && themes[saved]) {
        this.currentTheme = saved;
      } else {
        this.currentTheme = 'sunishka';
      }
    } else {
      this.currentTheme = 'sunishka';
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
    
    // Add data attribute for theme-specific styling
    root.setAttribute('data-theme', this.currentTheme);
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
