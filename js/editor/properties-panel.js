// @ts-nocheck — manipulação de DOM genérica (getElementById/eventos sem narrowing); só a camada de dados é checada (ver js/editor/types.js).
import { FONTS } from "./constants.js";
import { readImageFile, removeImageBackground } from "../image-tools.js";

// Painel de propriedades (direita): um construtor de formulário por tipo de
// campo, mais as seções compartilhadas (alinhar / ordem / duplicar-excluir).
export function createPropertiesPanel(ctx){
  const { state, clamp, round1, esc, propsBody, outerBox, codeMatrix } = ctx;

  function renderProps(){
    const selected = ctx.getSelectedFields();
    if(!selected.length){
      propsBody.innerHTML = `<div class="props-empty"><span class="big">＋</span>Nada selecionado.<br>Adicione um elemento pela barra de ferramentas, ou toque em um item na placa.</div>`;
      return;
    }
    if(selected.length > 1){ propsBatch(selected); return; }
    const f = selected[0];
    if(f.type === "text") propsText(f);
    else if(f.type === "image") propsImage(f);
    else if(f.type === "shape") propsShape(f);
    else propsCode(f);
  }

  // Painel de propriedades quando vários campos estão selecionados: em vez
  // do formulário por tipo, mostra as ações que fazem sentido para o grupo
  // (arrastar e redimensionar já funcionam direto no canvas).
  function propsBatch(fields){
    propsBody.innerHTML = `
      <div class="props-empty"><span class="big">${fields.length}</span>elementos selecionados</div>
      <div class="field-group">
        <button type="button" class="btn small" id="pBatchCenter" style="width:100%;">Centralizar grupo na peça</button>
      </div>
      <div class="field-group">
        <label>Ordem das camadas</label>
        <div class="field-actions-row">
          <button type="button" class="btn small" id="pBatchFront">↑ Frente</button>
          <button type="button" class="btn small" id="pBatchBack">↓ Trás</button>
        </div>
      </div>
      <div class="field-actions-row">
        <button type="button" class="btn small" id="pBatchDup">Duplicar</button>
        <button type="button" class="btn small danger" id="pBatchDel">Excluir</button>
      </div>`;

    document.getElementById("pBatchCenter").addEventListener("click", () => {
      ctx.centerSelected();
      ctx.showToast("Grupo centralizado");
    });
    document.getElementById("pBatchFront").addEventListener("click", () => ctx.reorderSelected("front"));
    document.getElementById("pBatchBack").addEventListener("click", () => ctx.reorderSelected("back"));
    document.getElementById("pBatchDup").addEventListener("click", () => ctx.duplicateSelected());
    document.getElementById("pBatchDel").addEventListener("click", () => ctx.deleteSelected());
  }

  function posRow(f, idX, idY){
    return `
      <div class="field-group row2">
        <div><label for="${idX}">X (mm)</label>
          <input type="number" class="text-input" id="${idX}" value="${f.x}" min="0" max="${state.plateW}" step="0.5" inputmode="decimal"></div>
        <div><label for="${idY}">Y (mm)</label>
          <input type="number" class="text-input" id="${idY}" value="${f.y}" min="0" max="${state.plateH}" step="0.5" inputmode="decimal"></div>
      </div>`;
  }
  function rotRow(f, id){
    return `
      <div class="field-group">
        <label for="${id}">Rotação (graus)</label>
        <input type="number" class="text-input" id="${id}" value="${f.rotation}" min="-180" max="180" step="1" inputmode="numeric">
      </div>`;
  }

  function propsText(f){
    propsBody.innerHTML = `
      <div class="field-group">
        <label for="pText">Texto</label>
        <textarea class="text-input" id="pText" rows="2"></textarea>
      </div>
      <div class="field-group">
        <label for="pFont">Fonte</label>
        <select class="select-input" id="pFont">
          ${FONTS.map(o => `<option value="${o.value}" ${o.value===f.font?"selected":""}>${o.label}</option>`).join("")}
        </select>
      </div>
      <div class="field-group">
        <label>Peso</label>
        <div class="seg" id="pWeight">
          <button type="button" data-v="400" class="${f.weight==='400'?'active':''}">Normal</button>
          <button type="button" data-v="600" class="${f.weight==='600'?'active':''}">Médio</button>
          <button type="button" data-v="700" class="${f.weight==='700'?'active':''}">Negrito</button>
        </div>
      </div>
      <div class="field-group row2">
        <div><label for="pSize">Altura (mm)</label>
          <input type="number" class="text-input" id="pSize" value="${f.size}" min="2" max="200" step="0.5" inputmode="decimal"></div>
        <div><label for="pSpacing">Espaço letras</label>
          <input type="number" class="text-input" id="pSpacing" value="${f.spacing}" min="-2" max="20" step="0.1" inputmode="decimal"></div>
      </div>
      <div class="field-group">
        <label>Alinhamento do texto</label>
        <div class="seg" id="pAlign">
          <button type="button" data-v="start" class="${f.align==='start'?'active':''}">Esq.</button>
          <button type="button" data-v="middle" class="${f.align==='middle'?'active':''}">Centro</button>
          <button type="button" data-v="end" class="${f.align==='end'?'active':''}">Dir.</button>
        </div>
      </div>
      ${posRow(f, "pX", "pY")}
      ${rotRow(f, "pRot")}
      <div class="field-group toggle-row">
        <label style="margin:0;">Caixa alta</label>
        <button type="button" class="switch ${f.uppercase?'on':''}" id="pUpper" aria-label="Alternar maiúsculas"></button>
      </div>
      ${alignSection()}
      ${orderSection()}
      ${actionsSection("p")}`;

    const ta = document.getElementById("pText");
    ta.value = f.text;
    ta.addEventListener("input", () => { f.text = ta.value; ctx.renderLive(); ctx.commitDebounced(); });

    bindNum("pSize", v => f.size = clamp(v||1, 0.5, 400));
    bindNum("pSpacing", v => f.spacing = v||0);
    bindNum("pX", v => f.x = clamp(v||0, 0, state.plateW));
    bindNum("pY", v => f.y = clamp(v||0, 0, state.plateH));
    bindNum("pRot", v => f.rotation = clamp(v||0, -180, 180));

    document.getElementById("pFont").addEventListener("change", e => { f.font = e.target.value; ctx.renderLive(); ctx.commit(); });
    document.getElementById("pUpper").addEventListener("click", e => {
      f.uppercase = !f.uppercase;
      e.currentTarget.classList.toggle("on", f.uppercase);
      ctx.renderLive(); ctx.commit();
    });
    bindSeg("pWeight", v => f.weight = v);
    bindSeg("pAlign", v => f.align = v);
    bindShared(f, "p");
  }

  function propsImage(f){
    if(!f.originalSrc) f.originalSrc = f.src;
    if(!isFinite(f.bgTolerance)) f.bgTolerance = 48;
    if(!isFinite(f.bgFeather)) f.bgFeather = 26;
    propsBody.innerHTML = `
      <img class="img-thumb" src="${f.src}" alt="Pré-visualização da imagem">
      <div class="img-meta" id="pIMeta">${esc(f.name)} · ${f.w} × ${f.h} mm</div>

      <div class="section-title">Preparação da imagem</div>
      <div class="field-group">
        <label for="pIBgTol">Remoção de fundo · tolerância</label>
        <div class="range-row">
          <input type="range" id="pIBgTol" min="8" max="160" step="2" value="${f.bgTolerance}">
          <span class="range-value" id="pIBgTolVal">${f.bgTolerance}</span>
        </div>
        <div class="hint">Detecta automaticamente a cor de fundo pelas bordas. Funciona melhor em fundos lisos, principalmente branco.</div>
      </div>
      <div class="field-group">
        <label for="pIBgFeather">Suavização da borda</label>
        <div class="range-row">
          <input type="range" id="pIBgFeather" min="0" max="80" step="2" value="${f.bgFeather}">
          <span class="range-value" id="pIBgFeatherVal">${f.bgFeather}</span>
        </div>
      </div>
      <div class="field-group laser-tools">
        <button type="button" class="btn primary wide" id="pIRemoveBg">Remover fundo</button>
        <button type="button" class="btn" id="pIRestore">Restaurar original</button>
        <button type="button" class="btn" id="pIWhiteBg">Remover fundo branco</button>
      </div>

      <div class="section-title">Tamanho e posição</div>
      <div class="field-group row2">
        <div><label for="pIW">Largura (mm)</label>
          <input type="number" class="text-input" id="pIW" value="${f.w}" min="2" max="1000" step="0.5" inputmode="decimal"></div>
        <div><label for="pIH">Altura (mm)</label>
          <input type="number" class="text-input" id="pIH" value="${f.h}" min="2" max="1000" step="0.5" inputmode="decimal"></div>
      </div>
      <div class="field-group toggle-row">
        <label style="margin:0;">Travar proporção</label>
        <button type="button" class="switch on" id="pILock" aria-label="Travar proporção"></button>
      </div>
      <div class="field-group">
        <label>Espelhar</label>
        <div class="laser-tools" id="flipTools">
          <button type="button" class="btn ${f.flipH?'primary':''}" data-flip="h">Horizontal</button>
          <button type="button" class="btn ${f.flipV?'primary':''}" data-flip="v">Vertical</button>
        </div>
      </div>
      ${posRow(f, "pIX", "pIY")}
      ${rotRow(f, "pIRot")}
      <div class="field-group">
        <label for="pIReplace">Substituir arquivo</label>
        <input type="file" class="text-input" id="pIReplace" accept="image/png,image/jpeg,image/svg+xml,image/webp">
      </div>
      ${alignSection()}
      ${orderSection()}
      ${actionsSection("pI")}`;

    let locked = true;
    const lockBtn = document.getElementById("pILock");
    lockBtn.addEventListener("click", () => { locked = !locked; lockBtn.classList.toggle("on", locked); });

    const tol = document.getElementById("pIBgTol"), feather = document.getElementById("pIBgFeather");
    tol.addEventListener("input", () => { f.bgTolerance = +tol.value; document.getElementById("pIBgTolVal").textContent = tol.value; });
    feather.addEventListener("input", () => { f.bgFeather = +feather.value; document.getElementById("pIBgFeatherVal").textContent = feather.value; });

    document.getElementById("pIRemoveBg").addEventListener("click", async () => {
      const btn = document.getElementById("pIRemoveBg");
      btn.disabled = true; btn.textContent = "Processando…";
      try{
        f.src = await removeImageBackground(f.originalSrc || f.src, f.bgTolerance, f.bgFeather, false);
        ctx.renderAll(); ctx.commit(); ctx.showToast("Fundo removido");
      }catch(_){ ctx.showToast("Não consegui remover o fundo desta imagem"); }
    });
    document.getElementById("pIWhiteBg").addEventListener("click", async () => {
      const btn = document.getElementById("pIWhiteBg");
      btn.disabled = true; btn.textContent = "Processando…";
      try{
        f.src = await removeImageBackground(f.originalSrc || f.src, f.bgTolerance, f.bgFeather, true);
        ctx.renderAll(); ctx.commit(); ctx.showToast("Fundo branco removido");
      }catch(_){ ctx.showToast("Não consegui processar a imagem"); }
    });
    document.getElementById("pIRestore").addEventListener("click", () => {
      f.src = f.originalSrc || f.src;
      ctx.renderAll(); ctx.commit(); ctx.showToast("Imagem original restaurada");
    });

    const wIn = document.getElementById("pIW"), hIn = document.getElementById("pIH");
    wIn.addEventListener("input", () => {
      const v = parseFloat(wIn.value);
      if(!isFinite(v) || v <= 0) return;
      const aspect = f.w/f.h;
      f.w = clamp(v, 1, 2000);
      if(locked){ f.h = round1(f.w/aspect); hIn.value = f.h; }
      ctx.renderLive(); syncImgMeta(f); ctx.commitDebounced();
    });
    hIn.addEventListener("input", () => {
      const v = parseFloat(hIn.value);
      if(!isFinite(v) || v <= 0) return;
      const aspect = f.w/f.h;
      f.h = clamp(v, 1, 2000);
      if(locked){ f.w = round1(f.h*aspect); wIn.value = f.w; }
      ctx.renderLive(); syncImgMeta(f); ctx.commitDebounced();
    });

    document.getElementById("flipTools").querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        if(b.dataset.flip === "h") f.flipH = !f.flipH; else f.flipV = !f.flipV;
        b.classList.toggle("primary", b.dataset.flip === "h" ? f.flipH : f.flipV);
        ctx.renderLive(); ctx.commit();
      });
    });

    bindNum("pIX", v => f.x = clamp(v||0, 0, state.plateW));
    bindNum("pIY", v => f.y = clamp(v||0, 0, state.plateH));
    bindNum("pIRot", v => f.rotation = clamp(v||0, -180, 180));

    document.getElementById("pIReplace").addEventListener("change", e => {
      const file = e.target.files[0];
      if(!file) return;
      readImageFile(file).then(r => {
        f.src = r.src; f.originalSrc = r.src; f.naturalW = r.naturalW; f.naturalH = r.naturalH; f.name = file.name;
        ctx.renderAll(); ctx.commit(); ctx.showToast("Imagem substituída");
      }).catch(() => ctx.showToast("Não consegui ler essa imagem"));
    });
    bindShared(f, "pI");
  }

  function propsShape(f){
    const name = f.shape === "line" ? "Linha" : (f.shape === "rect" ? "Retângulo" : "Moldura");
    propsBody.innerHTML = `
      <div class="img-meta">${name}</div>
      <div class="field-group row2">
        <div><label for="pSW">Largura (mm)</label>
          <input type="number" class="text-input" id="pSW" value="${f.w}" min="0.5" max="1000" step="0.5" inputmode="decimal"></div>
        <div><label for="pSH">${f.shape === "line" ? "Altura (n/a)" : "Altura (mm)"}</label>
          <input type="number" class="text-input" id="pSH" value="${f.h}" min="0" max="1000" step="0.5" inputmode="decimal" ${f.shape==="line"?"disabled":""}></div>
      </div>
      ${f.shape === "rect" ? "" : `
      <div class="field-group">
        <label for="pSStroke">Espessura do traço (mm)</label>
        <input type="number" class="text-input" id="pSStroke" value="${f.stroke}" min="0.1" max="20" step="0.1" inputmode="decimal">
      </div>`}
      ${posRow(f, "pSX", "pSY")}
      ${rotRow(f, "pSRot")}
      ${alignSection()}
      ${orderSection()}
      ${actionsSection("pS")}`;

    bindNum("pSW", v => f.w = clamp(v||1, 0.2, 2000));
    bindNum("pSH", v => f.h = clamp(v||0, 0, 2000));
    bindNum("pSStroke", v => f.stroke = clamp(v||0.1, 0.05, 30));
    bindNum("pSX", v => f.x = clamp(v||0, 0, state.plateW));
    bindNum("pSY", v => f.y = clamp(v||0, 0, state.plateH));
    bindNum("pSRot", v => f.rotation = clamp(v||0, -180, 180));
    bindShared(f, "pS");
  }

  function propsCode(f){
    const isQr = f.codeKind === "qr";
    const kindName = isQr ? "QR Code" : (f.codeKind === "code128" ? "Código de barras (Code 128)" : "Código de barras (Code 39)");
    const valid = !!codeMatrix(f);
    propsBody.innerHTML = `
      ${isQr ? `<div class="qr-card"><strong>Gerador de QR Code</strong><small>Digite um texto, link, telefone ou qualquer informação. O QR é atualizado automaticamente na placa.</small></div>` : ""}
      <div class="img-meta">${kindName}</div>
      <div class="field-group">
        <label for="pCData">Conteúdo</label>
        <textarea class="text-input" id="pCData" rows="2"></textarea>
        <div class="hint ${valid?'':'bad'}" id="pCHint">${valid ? "Válido" : codeHint(f)}</div>
      </div>
      ${isQr ? `<div class="field-group"><label for="pCEcl">Correção de erro</label><select class="select-input" id="pCEcl"><option value="L" ${f.qrEcl==='L'?'selected':''}>L — maior capacidade</option><option value="M" ${(f.qrEcl||'M')==='M'?'selected':''}>M — recomendada</option><option value="Q" ${f.qrEcl==='Q'?'selected':''}>Q — alta</option><option value="H" ${f.qrEcl==='H'?'selected':''}>H — máxima resistência</option></select></div>` : ""}
      <div class="field-group row2">
        <div><label for="pCW">Largura (mm)</label>
          <input type="number" class="text-input" id="pCW" value="${f.w}" min="5" max="1000" step="0.5" inputmode="decimal"></div>
        <div><label for="pCH">Altura (mm)</label>
          <input type="number" class="text-input" id="pCH" value="${f.h}" min="5" max="1000" step="0.5" inputmode="decimal"></div>
      </div>
      ${isQr ? "" : `
      <div class="field-group toggle-row">
        <label style="margin:0;">Mostrar texto embaixo</label>
        <button type="button" class="switch ${f.showText?'on':''}" id="pCText" aria-label="Mostrar texto"></button>
      </div>`}
      <div class="field-group toggle-row">
        <label style="margin:0;">Margem branca (recomendado)</label>
        <button type="button" class="switch ${f.quiet?'on':''}" id="pCQuiet" aria-label="Margem branca"></button>
      </div>
      ${posRow(f, "pCX", "pCY")}
      ${rotRow(f, "pCRot")}
      ${alignSection()}
      ${orderSection()}
      ${actionsSection("pC")}`;

    const ta = document.getElementById("pCData");
    ta.value = f.data;
    ta.addEventListener("input", () => {
      f.data = ta.value;
      ctx.renderLive();
      const ok = !!codeMatrix(f);
      const hint = document.getElementById("pCHint");
      hint.textContent = ok ? "Válido" : codeHint(f);
      hint.classList.toggle("bad", !ok);
      ctx.commitDebounced();
    });

    const ecl = document.getElementById("pCEcl");
    if(ecl) ecl.addEventListener("change", () => { f.qrEcl = ecl.value; delete f._cache; ctx.renderLive(); ctx.commit(); });

    bindNum("pCW", v => f.w = clamp(v||5, 3, 2000));
    bindNum("pCH", v => f.h = clamp(v||5, 3, 2000));
    bindNum("pCX", v => f.x = clamp(v||0, 0, state.plateW));
    bindNum("pCY", v => f.y = clamp(v||0, 0, state.plateH));
    bindNum("pCRot", v => f.rotation = clamp(v||0, -180, 180));

    const txtBtn = document.getElementById("pCText");
    if(txtBtn) txtBtn.addEventListener("click", e => {
      f.showText = !f.showText;
      e.currentTarget.classList.toggle("on", f.showText);
      ctx.renderLive(); ctx.commit();
    });
    document.getElementById("pCQuiet").addEventListener("click", e => {
      f.quiet = !f.quiet;
      e.currentTarget.classList.toggle("on", f.quiet);
      ctx.renderLive(); ctx.commit();
    });
    bindShared(f, "pC");
  }

  function codeHint(f){
    if(!f.data || !f.data.trim()) return "Digite algum conteúdo";
    if(f.codeKind === "qr") return "Conteúdo longo demais para o QR";
    if(f.codeKind === "code39") return "Code 39 aceita A-Z, 0-9, espaço e - . $ / + %";
    return "Code 128 aceita apenas caracteres ASCII comuns";
  }

  function syncImgMeta(f){
    const m = document.getElementById("pIMeta");
    if(m) m.textContent = `${f.name} · ${f.w} × ${f.h} mm`;
  }

  function bindNum(id, apply){
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener("input", () => {
      if(input.value === "" || input.value === "-") return;
      const v = parseFloat(input.value);
      if(!isFinite(v)) return;
      apply(v); ctx.renderLive(); ctx.commitDebounced();
    });
    input.addEventListener("blur", () => {
      if(input.value === "" || !isFinite(parseFloat(input.value))){ renderProps(); return; }
      apply(parseFloat(input.value)); ctx.renderLive(); ctx.commit();
    });
  }
  function bindSeg(id, apply){
    const g = document.getElementById(id);
    if(!g) return;
    g.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        g.querySelectorAll("button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        apply(b.dataset.v); ctx.renderLive(); ctx.commit();
      });
    });
  }
  function syncPosInputs(f){
    const ids = f.type === "text" ? ["pX","pY"] :
                f.type === "image" ? ["pIX","pIY"] :
                f.type === "shape" ? ["pSX","pSY"] : ["pCX","pCY"];
    const xi = document.getElementById(ids[0]), yi = document.getElementById(ids[1]);
    if(xi && document.activeElement !== xi) xi.value = f.x;
    if(yi && document.activeElement !== yi) yi.value = f.y;
    if(f.type === "image"){
      const wi = document.getElementById("pIW"), hi = document.getElementById("pIH");
      if(wi && document.activeElement !== wi) wi.value = f.w;
      if(hi && document.activeElement !== hi) hi.value = f.h;
      syncImgMeta(f);
    }
    if(f.type === "shape"){
      const wi = document.getElementById("pSW"), hi = document.getElementById("pSH");
      if(wi && document.activeElement !== wi) wi.value = f.w;
      if(hi && document.activeElement !== hi) hi.value = f.h;
    }
    if(f.type === "code"){
      const wi = document.getElementById("pCW"), hi = document.getElementById("pCH");
      if(wi && document.activeElement !== wi) wi.value = f.w;
      if(hi && document.activeElement !== hi) hi.value = f.h;
    }
  }

  // ================= SHARED PROPS SECTIONS =================
  function alignSection(){
    return `
      <div class="field-group">
        <label>Alinhar na placa</label>
        <div class="tool-grid" id="alignTools">
          <button type="button" data-al="left" title="Alinhar à esquerda"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="3" x2="4" y2="21"/><rect x="7" y="6" width="11" height="4"/><rect x="7" y="14" width="7" height="4"/></svg></button>
          <button type="button" data-al="hcenter" title="Centralizar na horizontal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="3" x2="12" y2="21"/><rect x="4" y="6" width="16" height="4"/><rect x="7" y="14" width="10" height="4"/></svg></button>
          <button type="button" data-al="right" title="Alinhar à direita"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="20" y1="3" x2="20" y2="21"/><rect x="6" y="6" width="11" height="4"/><rect x="10" y="14" width="7" height="4"/></svg></button>
          <button type="button" data-al="top" title="Alinhar ao topo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="4" x2="21" y2="4"/><rect x="6" y="7" width="4" height="11"/><rect x="14" y="7" width="4" height="7"/></svg></button>
          <button type="button" data-al="vcenter" title="Centralizar na vertical"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><rect x="6" y="4" width="4" height="16"/><rect x="14" y="7" width="4" height="10"/></svg></button>
          <button type="button" data-al="bottom" title="Alinhar à base"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="6" width="4" height="11"/><rect x="14" y="10" width="4" height="7"/></svg></button>
        </div>
        <button type="button" class="btn small" id="btnCenterBoth" style="width:100%; margin-top:7px;">Centralizar na peça</button>
      </div>`;
  }

  function orderSection(){
    return `
      <div class="field-group">
        <label>Ordem das camadas</label>
        <div class="tool-grid four" id="orderTools">
          <button type="button" data-ord="front" title="Trazer para a frente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="3" width="13" height="13" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M16 16v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4"/></svg></button>
          <button type="button" data-ord="forward" title="Avançar uma">▲</button>
          <button type="button" data-ord="backward" title="Recuar uma">▼</button>
          <button type="button" data-ord="back" title="Enviar para trás"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="13" height="13" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M8 8V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-4"/></svg></button>
        </div>
      </div>`;
  }

  function actionsSection(prefix){
    return `
      <div class="field-actions-row">
        <button type="button" class="btn small" id="${prefix}Dup">Duplicar</button>
        <button type="button" class="btn small danger" id="${prefix}Del">Excluir</button>
      </div>`;
  }

  function bindShared(f, prefix){
    const alignTools = document.getElementById("alignTools");
    if(alignTools){
      alignTools.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => { alignField(f, b.dataset.al); });
      });
    }
    const centerBtn = document.getElementById("btnCenterBoth");
    if(centerBtn) centerBtn.addEventListener("click", () => { alignField(f, "hcenter", true); alignField(f, "vcenter"); });

    const orderTools = document.getElementById("orderTools");
    if(orderTools){
      orderTools.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => reorderField(f.id, b.dataset.ord));
      });
    }
    const dup = document.getElementById(prefix+"Dup");
    const del = document.getElementById(prefix+"Del");
    if(dup) dup.addEventListener("click", () => ctx.duplicateField(f.id));
    if(del) del.addEventListener("click", () => ctx.deleteField(f.id));
  }

  function alignField(f, mode, silent){
    const b = outerBox(f);
    if(mode === "left") ctx.moveOuterTo(f, 0, b.y);
    else if(mode === "right") ctx.moveOuterTo(f, state.plateW-b.w, b.y);
    else if(mode === "hcenter") ctx.moveOuterTo(f, (state.plateW-b.w)/2, b.y);
    else if(mode === "top") ctx.moveOuterTo(f, b.x, 0);
    else if(mode === "bottom") ctx.moveOuterTo(f, b.x, state.plateH-b.h);
    else if(mode === "vcenter") ctx.moveOuterTo(f, b.x, (state.plateH-b.h)/2);
    ctx.renderCanvas(); ctx.renderLayers(); syncPosInputs(f);
    if(!silent) ctx.commit();
  }

  function reorderField(id, mode){
    const i = state.fields.findIndex(f => f.id === id);
    if(i < 0) return;
    const [f] = state.fields.splice(i, 1);
    if(mode === "front") state.fields.push(f);
    else if(mode === "back") state.fields.unshift(f);
    else if(mode === "forward") state.fields.splice(Math.min(state.fields.length, i+1), 0, f);
    else state.fields.splice(Math.max(0, i-1), 0, f);
    ctx.renderCanvas(); ctx.renderLayers();
    ctx.commit();
  }

  return {
    renderProps, posRow, rotRow, propsText, propsImage, propsShape, propsCode,
    codeHint, syncImgMeta, bindNum, bindSeg, syncPosInputs,
    alignSection, orderSection, actionsSection, bindShared, alignField, reorderField,
  };
}
