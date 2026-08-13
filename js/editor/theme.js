import { THEME_KEY } from "./constants.js";
import { loadPreference, savePreference } from "../storage.js";

// Tema claro/escuro, persistido em localStorage e aplicado via [data-theme].
export function createTheme(ctx){
  function setTheme(name, silent){
    document.documentElement.setAttribute("data-theme", name);
    savePreference(THEME_KEY, name);
    const btnDark = document.getElementById("themeDark");
    const btnLight = document.getElementById("themeLight");
    btnDark.classList.toggle("active", name === "dark");
    btnLight.classList.toggle("active", name === "light");
    btnDark.setAttribute("aria-pressed", name === "dark" ? "true" : "false");
    btnLight.setAttribute("aria-pressed", name === "light" ? "true" : "false");
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content", name === "dark" ? "#121417" : "#FAF9F6");
    if(!silent) ctx.showToast(name === "dark" ? "Tema escuro ativado" : "Tema claro ativado");
  }
  document.getElementById("themeDark").addEventListener("click", () => setTheme("dark", false));
  document.getElementById("themeLight").addEventListener("click", () => setTheme("light", false));

  function initTheme(){
    const saved = loadPreference(THEME_KEY);
    const prefersLight = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
    setTheme(saved || (prefersLight ? "light" : "dark"), true);
  }

  return { setTheme, initTheme };
}
