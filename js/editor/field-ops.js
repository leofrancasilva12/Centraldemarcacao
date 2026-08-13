// Operações de alto nível sobre a lista de campos: adicionar, duplicar,
// excluir — tanto para um campo isolado quanto para a seleção inteira
// (multi-seleção, ao estilo Canva).
export function createFieldOps(ctx){
  const { state, uid, clamp, getField, round1 } = ctx;

  function addField(f){
    state.fields.push(f);
    ctx.selectOnly(f.id);
    ctx.renderAll();
    ctx.commit();              // history first: a UI hiccup must not cost an undo step
    ctx.openDrawer("right");
  }
  function duplicateField(id){
    const f = getField(id);
    if(!f) return;
    const copy = Object.assign({}, f, {id:uid(),
      x: clamp(f.x+8, 0, state.plateW), y: clamp(f.y+8, 0, state.plateH)});
    delete copy._cache;
    state.fields.push(copy);
    ctx.selectOnly(copy.id);
    ctx.renderAll(); ctx.commit();
  }
  function deleteField(id){
    state.fields = state.fields.filter(f => f.id !== id);
    if(ctx.isSelected(id)) ctx.selectMany(state.selectedIds.filter(x => x !== id));
    ctx.renderAll(); ctx.commit();
  }

  // ---- Operações em lote (toda a seleção atual, 1 ou vários campos) ----

  function duplicateSelected(){
    const ids = state.selectedIds.slice();
    if(!ids.length) return;
    const copies = ids.map(id => {
      const f = getField(id);
      const copy = Object.assign({}, f, {id:uid(),
        x: clamp(f.x+8, 0, state.plateW), y: clamp(f.y+8, 0, state.plateH)});
      delete copy._cache;
      return copy;
    });
    state.fields.push(...copies);
    ctx.selectMany(copies.map(c => c.id));
    ctx.renderAll(); ctx.commit();
  }
  function deleteSelected(){
    const ids = new Set(state.selectedIds);
    if(!ids.size) return;
    state.fields = state.fields.filter(f => !ids.has(f.id));
    ctx.clearSelection();
    ctx.renderAll(); ctx.commit();
  }
  // Move todos os campos selecionados para frente/trás como um bloco,
  // preservando a ordem relativa entre eles.
  function reorderSelected(mode){
    const ids = new Set(state.selectedIds);
    if(!ids.size) return;
    const selected = state.fields.filter(f => ids.has(f.id));
    const rest = state.fields.filter(f => !ids.has(f.id));
    state.fields = mode === "front" ? [...rest, ...selected] : [...selected, ...rest];
    ctx.renderCanvas(); ctx.renderLayers();
    ctx.commit();
  }
  // Centraliza a seleção na peça. Com um único campo, preserva o
  // comportamento original (usa a caixa não-girada); com vários, centraliza
  // a caixa do grupo (considerando a rotação de cada campo) e move todos
  // juntos, mantendo as posições relativas entre eles.
  function centerSelected(){
    const fields = ctx.getSelectedFields();
    if(!fields.length) return;
    if(fields.length === 1){
      ctx.alignField(fields[0], "hcenter", true);
      ctx.alignField(fields[0], "vcenter");
      return;
    }
    const gb = ctx.groupOuterBox(fields);
    const dx = (state.plateW - gb.w)/2 - gb.x;
    const dy = (state.plateH - gb.h)/2 - gb.y;
    fields.forEach(f => { f.x = round1(f.x+dx); f.y = round1(f.y+dy); });
    ctx.renderCanvas(); ctx.renderLayers();
    ctx.commit();
  }

  return { addField, duplicateField, deleteField, duplicateSelected, deleteSelected, reorderSelected, centerSelected };
}
