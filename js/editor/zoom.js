// Zoom do artboard: ajustar à tela, + / -, e reajuste em resize/orientationchange.
export function createZoom(ctx){
  const { state, clamp, canvasWrap, totalW, totalH } = ctx;

  function fitZoom(){
    const availW = canvasWrap.clientWidth - 32;
    const availH = canvasWrap.clientHeight - 32;
    if(availW <= 0 || availH <= 0) return;
    const base = 1.9;
    const z = Math.min(availW/(totalW()*base), availH/(totalH()*base));
    state.zoom = clamp(+z.toFixed(3), 0.15, 3);
    ctx.renderCanvas();
  }
  document.getElementById("btnZoomIn").addEventListener("click", () => { state.zoom = clamp(+(state.zoom+0.15).toFixed(3), 0.15, 4); ctx.renderCanvas(); });
  document.getElementById("btnZoomOut").addEventListener("click", () => { state.zoom = clamp(+(state.zoom-0.15).toFixed(3), 0.15, 4); ctx.renderCanvas(); });
  document.getElementById("btnZoomFit").addEventListener("click", fitZoom);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const leftDrawer = document.getElementById("sidebarLeft");
      const rightDrawer = document.getElementById("sidebarRight");
      if(!leftDrawer.classList.contains("open") && !rightDrawer.classList.contains("open")) fitZoom();
      else ctx.renderCanvas();
    }, 140);
  });
  window.addEventListener("orientationchange", () => setTimeout(fitZoom, 250));

  return { fitZoom };
}
