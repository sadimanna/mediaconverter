export const THEMES = [
  { id: "dark", label: "Dark" },
  { id: "blue", label: "Blue" },
  { id: "pink", label: "Pink" },
  { id: "green", label: "Green" },
  { id: "yellow", label: "Chrome yellow" },
  { id: "white", label: "White" }
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "window-theme";

export const loadTheme = (): ThemeId => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.some((theme) => theme.id === saved)) return saved as ThemeId;
  } catch {
    // storage unavailable; fall back to the default
  }
  return "dark";
};

export const applyTheme = (theme: ThemeId) => {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable; the theme still applies for this session
  }
};
