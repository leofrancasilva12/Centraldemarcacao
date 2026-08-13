// Lista de camadas (painel direito) e seleção de campo.
export function createLayers(ctx){
  const { state, esc, shownText } = ctx;

  function renderLayers(){
    const list = document.getElementById("layerList");
    list.innerHTML = "";
    if(!state.fields.length){
      list.innerHTML = '<div class="empty-note" style="padding:4px 2px;">Nenhum campo ainda.</div>';
      return;
    }
    // Topmost item first: matches what the operator sees on the plate.
    state.fields.slice().reverse().forEach((f, revIdx) => {
      const i = state.fields.length-1-revIdx;
      const item = document.createElement("div");
      item.className = "layer-item" + (f.id === state.selectedId ? " active" : "");
      item.innerHTML = `<span class="idx">${i+1}</span>${layerIcon(f)}<span class="lbl">${esc(layerLabel(f))}</span>`;
      item.addEventListener("click", () => selectField(f.id));
      list.appendChild(item);
    });
  }
  function layerLabel(f){
    if(f.type === "image") return f.name || "imagem";
    if(f.type === "shape") return f.shape === "line" ? "linha" : (f.shape === "rect" ? "retângulo" : "moldura");
    if(f.type === "code") return (f.codeKind === "qr" ? "QR: " : "código: ") + f.data;
    return shownText(f) || "(vazio)";
  }
  function layerIcon(f){
    const wrap = s => `<span class="icon-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${s}</svg></span>`;
    if(f.type === "image") return wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>');
    if(f.type === "shape") return wrap('<rect x="3" y="6" width="18" height="12" rx="1"/>');
    if(f.type === "code") return wrap('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>');
    return wrap('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>');
  }

  function selectField(id){
    if(state.selectedId === id) return;
    state.selectedId = id;
    ctx.renderAll();
  }

  return { renderLayers, layerLabel, layerIcon, selectField };
}
