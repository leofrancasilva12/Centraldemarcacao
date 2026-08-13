// @ts-nocheck — manipulação de DOM genérica (getElementById sem narrowing);
// só a camada de dados é checada (ver js/editor/types.js).
import { HISTORY_MAX } from "./constants.js";

// Undo/redo por snapshots JSON do estado (placa + campos + seleção).
export function createHistory(ctx){
  const { state } = ctx;
  let history = [], histIndex = -1, historyTimer = null;

  function snapshot(){
    return JSON.stringify({plateW:state.plateW, plateH:state.plateH, fields:state.fields, selectedIds:state.selectedIds});
  }
  function commit(){
    const snap = snapshot();
    if(histIndex >= 0 && history[histIndex] === snap) return;
    history = history.slice(0, histIndex+1);
    history.push(snap);
    if(history.length > HISTORY_MAX) history.shift();
    histIndex = history.length-1;
    updateHistoryButtons();
  }
  // Typing shouldn't create one history entry per keystroke.
  function commitDebounced(){
    clearTimeout(historyTimer);
    historyTimer = setTimeout(commit, 700);
  }
  function applySnapshot(snap){
    const data = JSON.parse(snap);
    state.plateW = data.plateW; state.plateH = data.plateH;
    state.fields = data.fields;
    state.selectedIds = data.selectedIds || [];
    state.fields.forEach(f => { delete f._cache; });
    document.getElementById("plateW").value = state.plateW;
    document.getElementById("plateH").value = state.plateH;
    ctx.renderAll();
  }
  function undo(){
    if(histIndex <= 0) return;
    clearTimeout(historyTimer);
    histIndex--;
    applySnapshot(history[histIndex]);
    updateHistoryButtons();
    ctx.showToast("Desfeito");
  }
  function redo(){
    if(histIndex >= history.length-1) return;
    histIndex++;
    applySnapshot(history[histIndex]);
    updateHistoryButtons();
    ctx.showToast("Refeito");
  }
  function updateHistoryButtons(){
    const undoDisabled = histIndex <= 0;
    const redoDisabled = histIndex >= history.length-1;
    ["btnUndo","btnUndoMobile"].forEach(id => { const b=document.getElementById(id); if(b) b.disabled=undoDisabled; });
    ["btnRedo","btnRedoMobile"].forEach(id => { const b=document.getElementById(id); if(b) b.disabled=redoDisabled; });
  }

  return { commit, commitDebounced, undo, redo, updateHistoryButtons, applySnapshot, snapshot };
}
