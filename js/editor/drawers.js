// Gavetas laterais (modelos / propriedades) em telas estreitas.
export function createDrawers(){
  const leftDrawer = document.getElementById("sidebarLeft");
  const rightDrawer = document.getElementById("sidebarRight");
  const backdrop = document.getElementById("backdrop");
  const isCompact = () => window.matchMedia
    ? window.matchMedia("(max-width: 1024px)").matches
    : window.innerWidth <= 1024;

  function openDrawer(side){
    if(!isCompact()) return;
    (side === "left" ? leftDrawer : rightDrawer).classList.add("open");
    backdrop.classList.add("show");
  }
  function closeDrawer(side){
    (side === "left" ? leftDrawer : rightDrawer).classList.remove("open");
    if(!leftDrawer.classList.contains("open") && !rightDrawer.classList.contains("open")) backdrop.classList.remove("show");
  }
  document.getElementById("btnOpenLeft").addEventListener("click", () => openDrawer("left"));
  document.getElementById("btnOpenRight").addEventListener("click", () => openDrawer("right"));
  document.getElementById("closeLeft").addEventListener("click", () => closeDrawer("left"));
  document.getElementById("closeRight").addEventListener("click", () => closeDrawer("right"));
  backdrop.addEventListener("click", () => { closeDrawer("left"); closeDrawer("right"); });

  return { openDrawer, closeDrawer };
}
