/**
 * Theme handling.
 *
 * The bootstrap script in the root layout sets an inline background and color
 * on <html> to avoid a flash before CSS loads. Any toggle therefore has to
 * rewrite those inline values as well as the class — the previous Settings
 * toggle only touched the class, so switching to light left <html> with a
 * dark inline background and light text inherited over it until a reload.
 *
 * The values here must stay in step with the bootstrap script.
 */

export type Theme = "light" | "dark";

/** Storage key. Kept as-is so existing users don't lose their preference. */
export const THEME_STORAGE_KEY = "menai-theme";

const SHELL: Record<Theme, { background: string; color: string }> = {
  dark: { background: "#0f0f11", color: "#eceef2" },
  light: { background: "#f4f5f7", color: "#0f1117" },
};

/** Apply a theme to the document. Safe to call on the client only. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  root.classList.toggle("dark", theme === "dark");
  root.style.background = SHELL[theme].background;
  root.style.color = SHELL[theme].color;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode, or storage disabled. The theme still applies for this
    // session; it just won't survive a reload.
  }
}

/** The stored preference, defaulting to dark. */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
