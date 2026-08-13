// Operações de alto nível sobre a lista de campos: adicionar, duplicar, excluir.
export function createFieldOps(ctx){
  const { state, uid, clamp, getField } = ctx;

  function addField(f){
    state.fields.push(f);
    state.selectedId = f.id;
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
    state.selectedId = copy.id;
    ctx.renderAll(); ctx.commit();
  }
  function deleteField(id){
    state.fields = state.fields.filter(f => f.id !== id);
    if(state.selectedId === id) state.selectedId = null;
    ctx.renderAll(); ctx.commit();
  }

  return { addField, duplicateField, deleteField };
}
