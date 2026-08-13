/** @typedef {import("./types.js").Field} Field */
/** @typedef {import("./types.js").EditorState} EditorState */

// Seleção de campos (um ou vários), independente de como ela foi feita
// (clique, shift-clique, ou laço de seleção no canvas).
/** @param {{state: EditorState}} ctx */
export function createSelection(ctx){
  const { state } = ctx;

  /** @returns {Field[]} */
  function getSelectedFields(){
    if(!state.selectedIds.length) return [];
    const ids = new Set(state.selectedIds);
    return state.fields.filter(f => ids.has(f.id));
  }
  /** @param {string} id @returns {boolean} */
  function isSelected(id){
    return state.selectedIds.includes(id);
  }
  /** @param {string|null} id */
  function selectOnly(id){
    state.selectedIds = id ? [id] : [];
  }
  /** @param {string[]} ids */
  function selectMany(ids){
    state.selectedIds = ids.slice();
  }
  /** @param {string} id */
  function toggleSelect(id){
    state.selectedIds = isSelected(id)
      ? state.selectedIds.filter(x => x !== id)
      : [...state.selectedIds, id];
  }
  function clearSelection(){
    state.selectedIds = [];
  }
  function selectAll(){
    state.selectedIds = state.fields.map(f => f.id);
  }

  return { getSelectedFields, isSelected, selectOnly, selectMany, toggleSelect, clearSelection, selectAll };
}
