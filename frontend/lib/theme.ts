export const THEME_STORAGE_KEY = "ridewing-theme";
export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/**
 * Runs in <head> before first paint so a non-default theme has no
 * light-mode flash. Shared, not client-marked, so server components can
 * inline it.
 */
export function themeInitScript() {
  return `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}`;
}