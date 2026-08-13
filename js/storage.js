// Persistência local de modelos e preferências.

export function loadTemplates(key){
  try{ const v=JSON.parse(localStorage.getItem(key)||"[]"); return Array.isArray(v)?v:[]; }catch(_){ return []; }
}
export function persistTemplates(key,list){
  try{ localStorage.setItem(key,JSON.stringify(list)); return true; }catch(_){ return false; }
}
export function loadPreference(key){
  try{ return localStorage.getItem(key); }catch(_){ return null; }
}
export function savePreference(key,value){
  try{ localStorage.setItem(key,value); return true; }catch(_){ return false; }
}
