import { LEFT_COLLAPSED_KEY, RIGHT_COLLAPSED_KEY } from "./constants.js";
import { loadPreference, savePreference } from "../storage.js";

// Gavetas laterais (modelos / propriedades): em telas estreitas, sobrepõem o
// canvas e deslizam para dentro/fora; no desktop, os mesmos botões do topbar
// recolhem/expandem o painel, liberando espaço para o canvas.
export function createDrawers(){
  const main = document.querySelector(".main");
  const leftDrawer = document.getElementById("sidebarLeft");
  const rightDrawer = document.getElementById("sidebarRight");
  const backdrop = document.getElementById("backdrop");
  const btnOpenLeft = document.getElementById("btnOpenLeft");
  const btnOpenRight = document.getElementById("btnOpenRight");
  const isCompact = () => window.matchMedia
    ? window.matchMedia("(max-width: 1024px)").matches
    : window.innerWidth <= 1024;

  function isCollapsed(side){
    return main.classList.contains(side === "left" ? "left-collapsed" : "right-collapsed");
  }
  function setCollapsed(side, collapsed){
    main.classList.toggle(side === "left" ? "left-collapsed" : "right-collapsed", collapsed);
    savePreference(side === "left" ? LEFT_COLLAPSED_KEY : RIGHT_COLLAPSED_KEY, collapsed ? "1" : "0");
    (side === "left" ? btnOpenLeft : btnOpenRight).setAttribute("aria-pressed", collapsed ? "false" : "true");
  }
  // Garante que o painel fique visível, seja abrindo a gaveta (mobile) ou
  // desfazendo o recolhimento (desktop) — usado ao adicionar um campo, para
  // que as propriedades apareçam prontas para edição.
  function openDrawer(side){
    if(isCompact()){
      (side === "left" ? leftDrawer : rightDrawer).classList.add("open");
      backdrop.classList.add("show");
      return;
    }
    if(isCollapsed(side)) setCollapsed(side, false);
  }
  function closeDrawer(side){
    (side === "left" ? leftDrawer : rightDrawer).classList.remove("open");
    if(!leftDrawer.classList.contains("open") && !rightDrawer.classList.contains("open")) backdrop.classList.remove("show");
  }
  function toggleSidebar(side){
    if(isCompact()){ openDrawer(side); return; }
    setCollapsed(side, !isCollapsed(side));
  }

  btnOpenLeft.addEventListener("click", () => toggleSidebar("left"));
  btnOpenRight.addEventListener("click", () => toggleSidebar("right"));
  document.getElementById("closeLeft").addEventListener("click", () => closeDrawer("left"));
  document.getElementById("closeRight").addEventListener("click", () => closeDrawer("right"));
  backdrop.addEventListener("click", () => { closeDrawer("left"); closeDrawer("right"); });

  // Restaura o recolhimento salvo (só tem efeito visual em telas largas —
  // a media query de mobile ignora essas classes e usa o layout de gaveta).
  setCollapsed("left", loadPreference(LEFT_COLLAPSED_KEY) === "1");
  setCollapsed("right", loadPreference(RIGHT_COLLAPSED_KEY) === "1");

  return { openDrawer, closeDrawer, toggleSidebar };
}
