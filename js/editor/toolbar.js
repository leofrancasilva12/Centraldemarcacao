// @ts-nocheck — manipulação de DOM genérica (getElementById/eventos sem narrowing); só a camada de dados é checada (ver js/editor/types.js).
import { readImageFile } from "../image-tools.js";

// Barra de ferramentas do stage: adicionar campos, ações rápidas de seleção,
// menu de download e os inputs de tamanho da placa.
export function createToolbar(ctx){
  const { state, clamp, isBox } = ctx;

  document.getElementById("btnAddText").addEventListener("click", () => ctx.addField(ctx.newText({text:"NOVO TEXTO"})));
  document.getElementById("chkGrid").addEventListener("change", () => ctx.renderCanvas());

  document.getElementById("btnAddImage").addEventListener("click", () => document.getElementById("fileImageInput").click());
  document.getElementById("btnAddQR").addEventListener("click", () => {
    const q = ctx.newCode("qr");
    q.data = "https://";
    ctx.addField(q);
    ctx.showToast("QR Code adicionado — digite o conteúdo em Propriedades");
  });
  document.getElementById("btnSelectAll").addEventListener("click", () => {
    if(!state.fields.length){ ctx.showToast("Não há elementos para selecionar"); return; }
    ctx.selectAll();
    ctx.renderAll();
  });
  document.getElementById("btnDupQuick").addEventListener("click", () => {
    if(state.selectedIds.length) ctx.duplicateSelected();
  });
  document.getElementById("btnCenterQuick").addEventListener("click", () => {
    if(!state.selectedIds.length) return;
    ctx.centerSelected();
    ctx.showToast(state.selectedIds.length > 1 ? "Grupo centralizado" : "Elemento centralizado");
  });
  document.getElementById("btnFrontQuick").addEventListener("click", () => {
    if(!state.selectedIds.length) return;
    ctx.reorderSelected("front");
    ctx.showToast("Trazido para frente");
  });
  document.getElementById("btnBackQuick").addEventListener("click", () => {
    if(!state.selectedIds.length) return;
    ctx.reorderSelected("back");
    ctx.showToast("Enviado para trás");
  });
  document.getElementById("fileImageInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if(!file) return;
    readImageFile(file).then(r => {
      ctx.addField(ctx.newImage(r.src, file.name, r.naturalW, r.naturalH));
      ctx.showToast("Imagem adicionada");
    }).catch(() => ctx.showToast("Não consegui ler essa imagem"))
      .finally(() => { e.target.value = ""; });
  });

  // --- popup menus ---
  function setupMenu(btnId, menuId, onPick, dataKey){
    const btn = document.getElementById(btnId), menu = document.getElementById(menuId);
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("open");
      closeAllMenus();
      if(!isOpen){ menu.classList.add("open"); btn.setAttribute("aria-expanded","true"); }
    });
    menu.querySelectorAll("button").forEach(item => {
      item.addEventListener("click", e => {
        e.stopPropagation();
        closeAllMenus();
        onPick(item.dataset[dataKey]);
      });
    });
  }
  function closeAllMenus(){
    document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
    document.querySelectorAll('[aria-expanded="true"]').forEach(b => b.setAttribute("aria-expanded","false"));
  }
  document.addEventListener("click", closeAllMenus);

  setupMenu("btnDownload", "downloadMenu", fmt => {
    if(fmt === "svg") ctx.exportSVG();
    else ctx.exportPNG(fmt === "png600" ? 600 : 300);
  }, "dl");

  document.getElementById("btnUndo").addEventListener("click", () => ctx.undo());
  document.getElementById("btnRedo").addEventListener("click", () => ctx.redo());
  document.getElementById("btnUndoMobile").addEventListener("click", () => ctx.undo());
  document.getElementById("btnRedoMobile").addEventListener("click", () => ctx.redo());

  document.getElementById("plateW").addEventListener("change", e => {
    state.plateW = clamp(parseFloat(e.target.value)||380, 10, 1000);
    e.target.value = state.plateW;
    state.fields.forEach(f => f.x = clamp(f.x, 0, isBox(f) ? Math.max(0,state.plateW-f.w) : state.plateW));
    ctx.renderAll(); ctx.fitZoom(); ctx.commit();
  });
  document.getElementById("plateH").addEventListener("change", e => {
    state.plateH = clamp(parseFloat(e.target.value)||380, 10, 1000);
    e.target.value = state.plateH;
    state.fields.forEach(f => f.y = clamp(f.y, 0, isBox(f) ? Math.max(0,state.plateH-f.h) : state.plateH));
    ctx.renderAll(); ctx.fitZoom(); ctx.commit();
  });

  return { closeAllMenus };
}
