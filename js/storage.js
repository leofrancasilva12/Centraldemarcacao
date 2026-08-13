// Persistência local de modelos e preferências.

/** @typedef {import("./editor/types.js").Template} Template */

// Distingue "sem espaço" de outras falhas (modo privado, storage desabilitado etc.)
// para que a UI possa mostrar uma mensagem que realmente ajuda o usuário.
/** @param {*} err @returns {boolean} */
function isQuotaExceeded(err){
  return !!err && (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

/** @type {"quota"|"unavailable"|null} */
let lastError = null;
/** Motivo da última falha de escrita, para exibição opcional na UI. @returns {"quota"|"unavailable"|null} */
export function getLastStorageError(){
  return lastError;
}

/** @param {string} key @returns {Template[]} */
export function loadTemplates(key){
  try{ const v=JSON.parse(localStorage.getItem(key)||"[]"); return Array.isArray(v)?v:[]; }catch(_){ return []; }
}
/** @param {string} key @param {Template[]} list @returns {boolean} */
export function persistTemplates(key,list){
  try{
    localStorage.setItem(key,JSON.stringify(list));
    lastError = null;
    return true;
  }catch(err){
    lastError = isQuotaExceeded(err) ? "quota" : "unavailable";
    return false;
  }
}
export function loadPreference(key){
  try{ return localStorage.getItem(key); }catch(_){ return null; }
}
export function savePreference(key,value){
  try{
    localStorage.setItem(key,value);
    lastError = null;
    return true;
  }catch(err){
    lastError = isQuotaExceeded(err) ? "quota" : "unavailable";
    return false;
  }
}
