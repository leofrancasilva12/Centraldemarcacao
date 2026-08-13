// @ts-nocheck — manipulação de DOM genérica (activeElement/tagName sem narrowing); só a camada de dados é checada (ver js/editor/types.js).
// Atalhos de teclado globais.
export function createKeyboard(ctx){
  function isEditing(){
    const a = document.activeElement;
    if(!a) return false;
    return a.isContentEditable || ["INPUT","TEXTAREA","SELECT","BUTTON"].includes(a.tagName);
  }
  window.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.key.toLowerCase() === "z"){
      e.preventDefault();
      e.shiftKey ? ctx.redo() : ctx.undo();
      return;
    }
    if(mod && e.key.toLowerCase() === "y"){ e.preventDefault(); ctx.redo(); return; }
    if(mod && e.key.toLowerCase() === "a" && !isEditing()){
      e.preventDefault();
      if(ctx.state.fields.length){ ctx.selectAll(); ctx.renderAll(); }
      return;
    }
    if(e.key === "Escape"){
      ctx.closeAllMenus(); ctx.closeDrawer("left"); ctx.closeDrawer("right");
      if(ctx.state.selectedIds.length){ ctx.clearSelection(); ctx.renderAll(); }
      return;
    }
    if((e.key === "Delete" || e.key === "Backspace") && ctx.state.selectedIds.length && !isEditing()){
      ctx.deleteSelected();
      e.preventDefault();
    }
  });
}
