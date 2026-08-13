// @ts-nocheck — manipulação de DOM genérica (getElementById/eventos sem narrowing); só a camada de dados é checada (ver js/editor/types.js).
import { STORE_KEY } from "./constants.js";
import {
  loadTemplates as storageLoadTemplates,
  persistTemplates as storagePersistTemplates,
  getLastStorageError,
} from "../storage.js";

// Modelos salvos: listar, aplicar, excluir, e exportar/importar como .json.
export function createTemplates(ctx){
  const { state, esc } = ctx;

  function loadTemplates(){
    return storageLoadTemplates(STORE_KEY);
  }
  function persistTemplates(list){
    const ok = storagePersistTemplates(STORE_KEY, list);
    if(!ok){
      ctx.showToast(getLastStorageError() === "quota"
        ? "Armazenamento cheio. Exclua modelos antigos com imagens grandes."
        : "Não foi possível salvar o modelo. O armazenamento local está indisponível neste navegador (ex.: modo privado).");
    }
    return ok;
  }
  function renderTemplateList(){
    const list = loadTemplates(), box = document.getElementById("tmplList");
    if(!list.length){
      box.innerHTML = '<div class="empty-note">Nenhum modelo salvo ainda. Monte a marcação e toque em "Salvar modelo".</div>';
      return;
    }
    box.innerHTML = "";
    list.slice().reverse().forEach(t => {
      const item = document.createElement("div");
      item.className = "tmpl-item" + (t.id === state.activeTemplateId ? " active" : "");
      const d = new Date(t.createdAt);
      const when = d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      item.innerHTML = `
        <div class="tmpl-name">${esc(t.name)}</div>
        <div class="tmpl-meta">${t.fields.length} elemento(s) · ${when}</div>
        <div class="tmpl-actions">
          <button type="button" data-act="load">Abrir</button>
          <button type="button" data-act="del">Excluir</button>
        </div>`;
      item.querySelector('[data-act="load"]').addEventListener("click", e => { e.stopPropagation(); applyTemplate(t.id); });
      item.querySelector('[data-act="del"]').addEventListener("click", e => { e.stopPropagation(); removeTemplate(t.id); });
      item.addEventListener("click", () => applyTemplate(t.id));
      box.appendChild(item);
    });
  }
  function applyTemplate(id){
    const t = loadTemplates().find(x => x.id === id);
    if(!t) return;
    state.plateW = t.plateW; state.plateH = t.plateH;
    state.fields = JSON.parse(JSON.stringify(t.fields));
    state.fields.forEach(f => { if(!f.type) f.type = "text"; delete f._cache; });
    state.selectedIds = []; state.activeTemplateId = id;
    document.getElementById("plateW").value = state.plateW;
    document.getElementById("plateH").value = state.plateH;
    ctx.renderAll(); renderTemplateList(); ctx.fitZoom(); ctx.commit();
    ctx.showToast(`Modelo "${t.name}" carregado`);
    ctx.closeDrawer("left");
  }
  async function removeTemplate(id){
    const ok = await ctx.askConfirm("Essa exclusão não pode ser desfeita.", {
      title:"Excluir modelo", icon:"!", danger:true, confirmText:"Excluir"
    });
    if(!ok) return;
    persistTemplates(loadTemplates().filter(x => x.id !== id));
    if(state.activeTemplateId === id) state.activeTemplateId = null;
    renderTemplateList();
    ctx.showToast("Modelo excluído");
  }
  document.getElementById("btnSaveTmpl").addEventListener("click", async () => {
    if(!state.fields.length){ ctx.showToast("Adicione ao menos um elemento antes de salvar"); return; }
    const name = await ctx.askText("Dê um nome para identificar esta marcação depois.", {
      title:"Salvar modelo", placeholder:"Ex.: Placa cliente 01", confirmText:"Salvar"
    });
    if(!name) return;
    const list = loadTemplates();
    const clean = JSON.parse(JSON.stringify(state.fields));
    clean.forEach(f => delete f._cache);
    const tmpl = {id:"t"+Date.now(), name:name.trim(), createdAt:Date.now(),
      plateW:state.plateW, plateH:state.plateH, fields:clean};
    list.push(tmpl);
    if(persistTemplates(list)){
      state.activeTemplateId = tmpl.id;
      renderTemplateList(); ctx.showToast("Modelo salvo");
    }
  });
  document.getElementById("btnNew").addEventListener("click", async () => {
    if(state.fields.length){
      const ok = await ctx.askConfirm("O que não estiver salvo será perdido.", {
        title:"Nova marcação", icon:"＋", confirmText:"Começar nova"
      });
      if(!ok) return;
    }
    state.fields = []; state.selectedIds = []; state.activeTemplateId = null;
    ctx.renderAll(); renderTemplateList(); ctx.commit(); ctx.closeDrawer("left");
  });

  // ================= EXPORT / IMPORT DE MODELOS =================
  function downloadJSON(obj, name){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById("btnExportTmpl").addEventListener("click", () => {
    const list = loadTemplates();
    if(!list.length){ ctx.showToast("Nenhum modelo salvo para exportar"); return; }
    const stamp = new Date().toISOString().slice(0,10);
    downloadJSON({app:"central-marcacao-laser", version:1, exportedAt:Date.now(), templates:list}, `modelos-${stamp}.json`);
    ctx.showToast(`${list.length} modelo(s) exportado(s)`);
  });

  function isValidImportedTemplate(t){
    return t && typeof t === "object" && typeof t.name === "string" && Array.isArray(t.fields);
  }
  document.getElementById("btnImportTmpl").addEventListener("click", () => {
    document.getElementById("fileImportInput").click();
  });
  document.getElementById("fileImportInput").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if(!file) return;
    let parsed;
    try{
      parsed = JSON.parse(await file.text());
    }catch(_){
      ctx.showToast("Arquivo inválido: não é um JSON de modelos válido");
      return;
    }
    const incoming = Array.isArray(parsed) ? parsed : parsed?.templates;
    if(!Array.isArray(incoming) || !incoming.length){
      ctx.showToast("Arquivo inválido: nenhum modelo encontrado");
      return;
    }
    const valid = incoming.filter(isValidImportedTemplate);
    if(!valid.length){
      ctx.showToast("Arquivo inválido: nenhum modelo reconhecido");
      return;
    }
    // Novos ids para nunca colidir com modelos já salvos neste navegador.
    const imported = valid.map((t, i) => ({
      id: "t" + Date.now() + "_" + i,
      name: t.name.trim() || "Modelo importado",
      createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
      plateW: Number(t.plateW) || 380,
      plateH: Number(t.plateH) || 380,
      fields: Array.isArray(t.fields) ? t.fields : [],
    }));
    const list = loadTemplates().concat(imported);
    if(persistTemplates(list)){
      renderTemplateList();
      ctx.showToast(`${imported.length} modelo(s) importado(s)`);
    }
  });

  return { loadTemplates, persistTemplates, renderTemplateList, applyTemplate, removeTemplate };
}
