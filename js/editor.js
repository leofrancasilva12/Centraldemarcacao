import { QR } from "./qr.js";
import { BARCODE } from "./barcode.js";
import { readImageFile, removeImageBackground } from "./image-tools.js";
import { loadTemplates as storageLoadTemplates, persistTemplates as storagePersistTemplates, loadPreference, savePreference } from "./storage.js";
import { createExporter } from "./export.js";

export function initEditor(){


  const FONTS = [
    {label:"Oswald (condensada)", value:"'Oswald', sans-serif"},
    {label:"Bebas Neue", value:"'Bebas Neue', sans-serif"},
    {label:"Archivo Black", value:"'Archivo Black', sans-serif"},
    {label:"Anton", value:"'Anton', sans-serif"},
    {label:"Stardos Stencil", value:"'Stardos Stencil', sans-serif"},
    {label:"IBM Plex Mono", value:"'IBM Plex Mono', monospace"},
    {label:"Roboto Mono", value:"'Roboto Mono', monospace"},
  ];
  const MARGIN = 16;
  const STORE_KEY = "laserMarkTemplates_v2";
  const THEME_KEY = "laserMarkTheme_v1";
  const SVGNS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const SNAP_MM = 5;
  const HISTORY_MAX = 40;

  const state = {
    plateW: 380, plateH: 380,
    fields: [], selectedId: null,
    zoom: 1, activeTemplateId: null,
  };

  let nextId = 1;
  const uid = () => "f" + (nextId++);
  const clamp = (v,min,max) => Math.max(min, Math.min(max, v));
  const round1 = v => Math.round(v*10)/10;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  const svg = document.getElementById("artboard");
  const canvasWrap = document.getElementById("canvasWrap");
  const propsBody = document.getElementById("propsBody");

  const totalW = () => state.plateW + MARGIN;
  const totalH = () => state.plateH + MARGIN;
  const getField = id => state.fields.find(f => f.id === id);
  const isBox = f => f.type !== "text";

  // ================= HISTORY (undo / redo) =================
  let history = [], histIndex = -1, historyTimer = null;

  function snapshot(){
    return JSON.stringify({plateW:state.plateW, plateH:state.plateH, fields:state.fields, selectedId:state.selectedId});
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
    state.selectedId = data.selectedId;
    state.fields.forEach(f => { delete f._cache; });
    document.getElementById("plateW").value = state.plateW;
    document.getElementById("plateH").value = state.plateH;
    renderAll();
  }
  function undo(){
    if(histIndex <= 0) return;
    clearTimeout(historyTimer);
    histIndex--;
    applySnapshot(history[histIndex]);
    updateHistoryButtons();
    showToast("Desfeito");
  }
  function redo(){
    if(histIndex >= history.length-1) return;
    histIndex++;
    applySnapshot(history[histIndex]);
    updateHistoryButtons();
    showToast("Refeito");
  }
  function updateHistoryButtons(){
    const undoDisabled = histIndex <= 0;
    const redoDisabled = histIndex >= history.length-1;
    ["btnUndo","btnUndoMobile"].forEach(id => { const b=document.getElementById(id); if(b) b.disabled=undoDisabled; });
    ["btnRedo","btnRedoMobile"].forEach(id => { const b=document.getElementById(id); if(b) b.disabled=redoDisabled; });
  }

  // ================= FIELD FACTORIES =================
  function newText(over){
    return Object.assign({
      id: uid(), type:"text", text:"TEXTO",
      x: Math.round(state.plateW/2), y: Math.round(state.plateH/2),
      size:18, font:FONTS[0].value, weight:"600",
      align:"middle", rotation:0, spacing:0, uppercase:false,
    }, over || {});
  }
  function newImage(src, name, nw, nh){
    const aspect = (nw && nh) ? nw/nh : 1;
    let w = Math.min(90, state.plateW*0.45), h = w/aspect;
    if(h > state.plateH*0.45){ h = state.plateH*0.45; w = h*aspect; }
    return {
      id:uid(), type:"image", src, originalSrc:src, name:name||"imagem", naturalW:nw, naturalH:nh,
      bgTolerance:48, bgFeather:26,
      x:round1((state.plateW-w)/2), y:round1((state.plateH-h)/2),
      w:round1(w), h:round1(h), rotation:0, flipH:false, flipV:false,
    };
  }
  function newShape(shape){
    const w = Math.min(100, state.plateW*0.5);
    const h = shape === "line" ? 0 : Math.min(50, state.plateH*0.25);
    return {
      id:uid(), type:"shape", shape,
      x:round1((state.plateW-w)/2), y:round1((state.plateH-h)/2),
      w:round1(w), h:round1(h), rotation:0, stroke:1.5,
    };
  }
  function newCode(kind){
    const isQr = kind === "qr";
    const w = isQr ? 40 : 70;
    const h = isQr ? 40 : 25;
    return {
      id:uid(), type:"code", codeKind:kind,
      data: isQr ? "https://" : "TUBO-00123",
      showText: !isQr, quiet: true, qrEcl:"M",
      x:round1((state.plateW-w)/2), y:round1((state.plateH-h)/2),
      w, h, rotation:0,
    };
  }

  // ================= CODE RENDERING CACHE =================
  function codeMatrix(f){
    const key = f.codeKind + "|" + f.data + "|" + (f.qrEcl||"M");
    if(f._cache && f._cache.key === key) return f._cache.value;
    let value = null;
    try{
      if(f.codeKind === "qr"){
        value = QR.encode(f.data, f.qrEcl || "M");
      } else if(f.codeKind === "code128"){
        value = BARCODE.code128B(f.data);
      } else {
        value = BARCODE.code39(f.data);
      }
    }catch(_){ value = null; }
    f._cache = {key, value};
    return value;
  }

  // ================= RENDER =================
  function renderAll(){ renderCanvas(); renderLayers(); renderProps(); updateSelectionActionButtons(); }

  function updateSelectionActionButtons(){
    const hasSel = !!getField(state.selectedId);
    ["btnDupQuick","btnCenterQuick","btnFrontQuick","btnBackQuick"].forEach(id => {
      const btn = document.getElementById(id);
      if(btn) btn.disabled = !hasSel;
    });
  }
  function renderLive(){ renderCanvas(); renderLayers(); }

  function el(tag, attrs){
    const n = document.createElementNS(SVGNS, tag);
    for(const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function renderCanvas(){
    const W = totalW(), H = totalH();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const base = 1.9;
    svg.setAttribute("width", W*base*state.zoom);
    svg.setAttribute("height", H*base*state.zoom);
    svg.innerHTML = "";

    svg.appendChild(el("rect", {x:MARGIN, y:MARGIN, width:state.plateW, height:state.plateH, class:"plate-rect"}));
    if(document.getElementById("chkGrid").checked) drawGrid();
    drawRulers();

    state.fields.forEach(f => {
      if(f.type === "text") drawText(f);
      else if(f.type === "image") drawImage(f);
      else if(f.type === "shape") drawShape(f);
      else if(f.type === "code") drawCode(f);
    });

    document.getElementById("zoomReadout").textContent = Math.round(state.zoom*100) + "%";
    attachCanvasHandlers();
  }

  function drawGrid(){
    for(let x=0; x<=state.plateW; x+=10)
      svg.appendChild(el("line", {x1:MARGIN+x, x2:MARGIN+x, y1:MARGIN, y2:MARGIN+state.plateH, class:"grid-line"+(x%50===0?" major":"")}));
    for(let y=0; y<=state.plateH; y+=10)
      svg.appendChild(el("line", {y1:MARGIN+y, y2:MARGIN+y, x1:MARGIN, x2:MARGIN+state.plateW, class:"grid-line"+(y%50===0?" major":"")}));
  }
  function drawRulers(){
    for(let x=0; x<=state.plateW; x+=50){
      svg.appendChild(el("line", {x1:MARGIN+x, x2:MARGIN+x, y1:MARGIN-3, y2:MARGIN, class:"ruler-tick"}));
      const t = el("text", {x:MARGIN+x, y:MARGIN-5, class:"ruler-text", "text-anchor":"middle"});
      t.textContent = x; svg.appendChild(t);
    }
    for(let y=0; y<=state.plateH; y+=50){
      svg.appendChild(el("line", {y1:MARGIN+y, y2:MARGIN+y, x1:MARGIN-3, x2:MARGIN, class:"ruler-tick"}));
      const t = el("text", {x:MARGIN-5, y:MARGIN+y+1.2, class:"ruler-text", "text-anchor":"end"});
      t.textContent = y; svg.appendChild(t);
    }
  }

  const shownText = f => f.uppercase ? f.text.toUpperCase() : f.text;

  function drawText(f){
    const px = MARGIN+f.x, py = MARGIN+f.y;
    const t = el("text", {x:px, y:py, "font-family":f.font, "font-size":f.size, "font-weight":f.weight,
      "text-anchor":f.align, "dominant-baseline":"middle",
      transform:`rotate(${f.rotation} ${px} ${py})`, class:"field-text"});
    t.style.letterSpacing = f.spacing + "mm";
    t.textContent = shownText(f);
    t.dataset.id = f.id;
    svg.appendChild(t);
    if(f.id === state.selectedId){
      const b = bboxOf(f);
      const g = el("g", {transform:`rotate(${f.rotation} ${px} ${py})`});
      addSelectionChrome(g, b, f, {x:px, y:py}, true);
      svg.appendChild(g);
    }
  }

  function boxGroup(f){
    const b = bboxOf(f);
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const g = el("g", {transform:`rotate(${f.rotation} ${cx} ${cy})`});
    return {g, b, cx, cy};
  }

  function addSelectionChrome(g, b, f, pivot, showAnchor){
    if(f.id !== state.selectedId) return;
    g.appendChild(el("rect", {x:b.x, y:b.y, width:b.w, height:b.h, class:"sel-box"}));
    if(showAnchor) g.appendChild(el("circle", {cx:pivot.x, cy:pivot.y, r:1.4, class:"anchor-dot"}));

    const touch = window.innerWidth <= 760;
    const hitSize = touch ? 12 : 8;
    const handleR = touch ? 2.35 : 1.8;
    const corners = [
      {name:"tl", x:b.x, y:b.y},
      {name:"tr", x:b.x+b.w, y:b.y},
      {name:"bl", x:b.x, y:b.y+b.h},
      {name:"br", x:b.x+b.w, y:b.y+b.h}
    ];
    corners.forEach(c => {
      const hit = el("rect", {
        x:c.x-hitSize/2, y:c.y-hitSize/2, width:hitSize, height:hitSize, class:"corner-hit"
      });
      hit.dataset.id = f.id;
      hit.dataset.role = "resize-corner";
      hit.dataset.corner = c.name;
      g.appendChild(hit);

      const dot = el("circle", {cx:c.x, cy:c.y, r:handleR, class:"corner-handle"});
      dot.dataset.id = f.id;
      dot.dataset.role = "resize-corner";
      dot.dataset.corner = c.name;
      g.appendChild(dot);
    });

    const stemTop = b.y - (touch ? 10 : 8);
    const rotY = b.y - (touch ? 14 : 12);
    const rotX = b.x + b.w/2;
    g.appendChild(el("line", {x1:rotX, y1:b.y, x2:rotX, y2:stemTop, class:"rotate-stem"}));
    const rotHit = el("circle", {cx:rotX, cy:rotY, r:touch ? 6 : 4.6, class:"rotate-hit"});
    rotHit.dataset.id = f.id;
    rotHit.dataset.role = "rotate";
    g.appendChild(rotHit);
    const rot = el("circle", {cx:rotX, cy:rotY, r:touch ? 2.35 : 1.9, class:"rotate-handle"});
    rot.dataset.id = f.id;
    rot.dataset.role = "rotate";
    g.appendChild(rot);
  }

  function addBoxChrome(g, b, f){
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    addSelectionChrome(g, b, f, {x:cx, y:cy}, false);
  }

  function drawImage(f){
    const {g, b, cx, cy} = boxGroup(f);
    const img = el("image", {x:b.x, y:b.y, width:b.w, height:b.h, preserveAspectRatio:"none", class:"field-image"});
    img.setAttributeNS(XLINK, "href", f.src);
    img.setAttribute("href", f.src);
    img.dataset.id = f.id;
    if(f.flipH || f.flipV){
      const sx = f.flipH ? -1 : 1, sy = f.flipV ? -1 : 1;
      img.setAttribute("transform", `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`);
    }
    g.appendChild(img);
    addBoxChrome(g, b, f);
    svg.appendChild(g);
  }

  function drawShape(f){
    const {g, b} = boxGroup(f);
    let node;
    if(f.shape === "line"){
      node = el("line", {x1:b.x, y1:b.y+b.h/2, x2:b.x+b.w, y2:b.y+b.h/2,
        stroke:"var(--plate-ink)", "stroke-width":f.stroke, "stroke-linecap":"butt", class:"field-shape"});
    } else if(f.shape === "rect"){
      node = el("rect", {x:b.x, y:b.y, width:b.w, height:b.h, fill:"var(--plate-ink)", class:"field-shape"});
    } else {
      node = el("rect", {x:b.x+f.stroke/2, y:b.y+f.stroke/2,
        width:Math.max(0.1,b.w-f.stroke), height:Math.max(0.1,b.h-f.stroke),
        fill:"none", stroke:"var(--plate-ink)", "stroke-width":f.stroke, class:"field-shape"});
    }
    node.dataset.id = f.id;
    g.appendChild(node);
    if(f.shape === "line"){
      const pad = el("rect", {x:b.x, y:b.y+b.h/2-2, width:b.w, height:4, class:"hit-pad"});
      pad.dataset.id = f.id;
      g.appendChild(pad);
    }
    addBoxChrome(g, b, f);
    svg.appendChild(g);
  }

  function drawCode(f){
    const {g, b} = boxGroup(f);
    const data = codeMatrix(f);

    if(!data){
      const warn = el("rect", {x:b.x, y:b.y, width:b.w, height:b.h, fill:"none",
        stroke:"var(--danger)", "stroke-width":0.6, "stroke-dasharray":"2 1.5"});
      g.appendChild(warn);
      const msg = el("text", {x:b.x+b.w/2, y:b.y+b.h/2, "text-anchor":"middle",
        "dominant-baseline":"middle", fill:"var(--danger)", "font-size":Math.min(4, b.h/3),
        "font-family":"monospace"});
      msg.textContent = "conteúdo inválido";
      g.appendChild(msg);
      const pad = el("rect", {x:b.x, y:b.y, width:b.w, height:b.h, class:"hit-pad"});
      pad.dataset.id = f.id; g.appendChild(pad);
      addBoxChrome(g, b, f);
      svg.appendChild(g);
      return;
    }

    if(f.codeKind === "qr") drawQrInto(g, b, f, data);
    else drawBarsInto(g, b, f, data);

    const pad = el("rect", {x:b.x, y:b.y, width:b.w, height:b.h, class:"hit-pad"});
    pad.dataset.id = f.id;
    g.appendChild(pad);
    addBoxChrome(g, b, f);
    svg.appendChild(g);
  }

  function drawQrInto(g, b, f, qr){
    // Quiet zone of 4 modules is part of the spec; scanners need it.
    const quiet = f.quiet ? 4 : 0;
    const total = qr.size + quiet*2;
    const side = Math.min(b.w, b.h);
    const unit = side/total;
    const ox = b.x + (b.w-side)/2, oy = b.y + (b.h-side)/2;

    if(f.quiet){
      g.appendChild(el("rect", {x:ox, y:oy, width:side, height:side, fill:"#ffffff"}));
    }
    // Merge horizontal runs into single rects: fewer nodes, cleaner laser paths.
    for(let r=0; r<qr.size; r++){
      let c = 0;
      while(c < qr.size){
        if(qr.modules[r][c]){
          let len = 1;
          while(c+len < qr.size && qr.modules[r][c+len]) len++;
          g.appendChild(el("rect", {
            x: ox + (quiet+c)*unit, y: oy + (quiet+r)*unit,
            width: len*unit + 0.01, height: unit + 0.01,
            fill: "var(--plate-ink)", class:"code-mod",
          }));
          c += len;
        } else c++;
      }
    }
  }

  function drawBarsInto(g, b, f, bits){
    const textH = f.showText ? Math.min(b.h*0.22, 6) : 0;
    const quietUnits = f.quiet ? 10 : 0;
    const totalUnits = bits.length + quietUnits*2;
    const unit = b.w/totalUnits;
    const barsH = b.h - textH;
    const ox = b.x + quietUnits*unit;

    if(f.quiet) g.appendChild(el("rect", {x:b.x, y:b.y, width:b.w, height:b.h, fill:"#ffffff"}));

    let i = 0;
    while(i < bits.length){
      if(bits[i] === "1"){
        let len = 1;
        while(i+len < bits.length && bits[i+len] === "1") len++;
        g.appendChild(el("rect", {x: ox + i*unit, y: b.y, width: len*unit + 0.01, height: barsH,
          fill:"var(--plate-ink)", class:"code-mod"}));
        i += len;
      } else i++;
    }

    if(f.showText){
      const t = el("text", {x:b.x+b.w/2, y:b.y+b.h-textH*0.15, "text-anchor":"middle",
        fill:"var(--plate-ink)", "font-size":textH*0.85, "font-family":"'IBM Plex Mono', monospace",
        "letter-spacing":"0.3"});
      t.textContent = f.codeKind === "code39" ? f.data.toUpperCase() : f.data;
      g.appendChild(t);
    }
  }

  // ================= GEOMETRY =================
  function bboxOf(f){
    if(isBox(f)) return {x:MARGIN+f.x, y:MARGIN+f.y, w:f.w, h:f.h};
    const px = MARGIN+f.x, py = MARGIN+f.y;
    const w = textWidth(f)+4, h = f.size*1.3;
    const x0 = f.align === "start" ? px-2 : (f.align === "end" ? px-w+2 : px-w/2);
    return {x:x0, y:py-h/2, w, h};
  }

  let measureCtx = null, measureTried = false;
  function textWidth(f){
    const txt = shownText(f);
    const extra = f.spacing*Math.max(0, txt.length-1);
    if(!measureTried){
      measureTried = true;
      try{ measureCtx = document.createElement("canvas").getContext("2d"); }catch(_){ measureCtx = null; }
    }
    // A failed measurement must never break the whole render — fall back to an estimate.
    if(!measureCtx) return txt.length*f.size*0.55 + extra;
    try{
      measureCtx.font = `${f.weight} ${f.size*3.78}px ${f.font.replace(/'/g,"")}`;
      return measureCtx.measureText(txt).width/3.78 + extra;
    }catch(_){
      return txt.length*f.size*0.55 + extra;
    }
  }

  // Plate-relative outer box, used by the alignment tools.
  function outerBox(f){
    if(isBox(f)) return {x:f.x, y:f.y, w:f.w, h:f.h};
    const b = bboxOf(f);
    return {x:b.x-MARGIN, y:b.y-MARGIN, w:b.w, h:b.h};
  }
  function moveOuterTo(f, nx, ny){
    if(isBox(f)){ f.x = round1(nx); f.y = round1(ny); return; }
    const cur = outerBox(f);
    f.x = round1(f.x + (nx - cur.x));
    f.y = round1(f.y + (ny - cur.y));
  }

  // ================= LAYERS =================
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
    renderAll();
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
    if(dup) dup.addEventListener("click", () => duplicateField(f.id));
    if(del) del.addEventListener("click", () => deleteField(f.id));
  }

  function alignField(f, mode, silent){
    const b = outerBox(f);
    if(mode === "left") moveOuterTo(f, 0, b.y);
    else if(mode === "right") moveOuterTo(f, state.plateW-b.w, b.y);
    else if(mode === "hcenter") moveOuterTo(f, (state.plateW-b.w)/2, b.y);
    else if(mode === "top") moveOuterTo(f, b.x, 0);
    else if(mode === "bottom") moveOuterTo(f, b.x, state.plateH-b.h);
    else if(mode === "vcenter") moveOuterTo(f, b.x, (state.plateH-b.h)/2);
    renderCanvas(); renderLayers(); syncPosInputs(f);
    if(!silent) commit();
  }

  function reorderField(id, mode){
    const i = state.fields.findIndex(f => f.id === id);
    if(i < 0) return;
    const [f] = state.fields.splice(i, 1);
    if(mode === "front") state.fields.push(f);
    else if(mode === "back") state.fields.unshift(f);
    else if(mode === "forward") state.fields.splice(Math.min(state.fields.length, i+1), 0, f);
    else state.fields.splice(Math.max(0, i-1), 0, f);
    renderCanvas(); renderLayers();
    commit();
  }

  // ================= PROPS =================
  function renderProps(){
    const f = getField(state.selectedId);
    if(!f){
      propsBody.innerHTML = `<div class="props-empty"><span class="big">＋</span>Nada selecionado.<br>Adicione um elemento pela barra de ferramentas, ou toque em um item na placa.</div>`;
      return;
    }
    if(f.type === "text") propsText(f);
    else if(f.type === "image") propsImage(f);
    else if(f.type === "shape") propsShape(f);
    else propsCode(f);
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
    ta.addEventListener("input", () => { f.text = ta.value; renderLive(); commitDebounced(); });

    bindNum("pSize", v => f.size = clamp(v||1, 0.5, 400));
    bindNum("pSpacing", v => f.spacing = v||0);
    bindNum("pX", v => f.x = clamp(v||0, 0, state.plateW));
    bindNum("pY", v => f.y = clamp(v||0, 0, state.plateH));
    bindNum("pRot", v => f.rotation = clamp(v||0, -180, 180));

    document.getElementById("pFont").addEventListener("change", e => { f.font = e.target.value; renderLive(); commit(); });
    document.getElementById("pUpper").addEventListener("click", e => {
      f.uppercase = !f.uppercase;
      e.currentTarget.classList.toggle("on", f.uppercase);
      renderLive(); commit();
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
        renderAll(); commit(); showToast("Fundo removido");
      }catch(_){ showToast("Não consegui remover o fundo desta imagem"); }
    });
    document.getElementById("pIWhiteBg").addEventListener("click", async () => {
      const btn = document.getElementById("pIWhiteBg");
      btn.disabled = true; btn.textContent = "Processando…";
      try{
        f.src = await removeImageBackground(f.originalSrc || f.src, f.bgTolerance, f.bgFeather, true);
        renderAll(); commit(); showToast("Fundo branco removido");
      }catch(_){ showToast("Não consegui processar a imagem"); }
    });
    document.getElementById("pIRestore").addEventListener("click", () => {
      f.src = f.originalSrc || f.src;
      renderAll(); commit(); showToast("Imagem original restaurada");
    });

    const wIn = document.getElementById("pIW"), hIn = document.getElementById("pIH");
    wIn.addEventListener("input", () => {
      const v = parseFloat(wIn.value);
      if(!isFinite(v) || v <= 0) return;
      const aspect = f.w/f.h;
      f.w = clamp(v, 1, 2000);
      if(locked){ f.h = round1(f.w/aspect); hIn.value = f.h; }
      renderLive(); syncImgMeta(f); commitDebounced();
    });
    hIn.addEventListener("input", () => {
      const v = parseFloat(hIn.value);
      if(!isFinite(v) || v <= 0) return;
      const aspect = f.w/f.h;
      f.h = clamp(v, 1, 2000);
      if(locked){ f.w = round1(f.h*aspect); wIn.value = f.w; }
      renderLive(); syncImgMeta(f); commitDebounced();
    });

    document.getElementById("flipTools").querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        if(b.dataset.flip === "h") f.flipH = !f.flipH; else f.flipV = !f.flipV;
        b.classList.toggle("primary", b.dataset.flip === "h" ? f.flipH : f.flipV);
        renderLive(); commit();
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
        renderAll(); commit(); showToast("Imagem substituída");
      }).catch(() => showToast("Não consegui ler essa imagem"));
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
      renderLive();
      const ok = !!codeMatrix(f);
      const hint = document.getElementById("pCHint");
      hint.textContent = ok ? "Válido" : codeHint(f);
      hint.classList.toggle("bad", !ok);
      commitDebounced();
    });

    const ecl = document.getElementById("pCEcl");
    if(ecl) ecl.addEventListener("change", () => { f.qrEcl = ecl.value; delete f._cache; renderLive(); commit(); });

    bindNum("pCW", v => f.w = clamp(v||5, 3, 2000));
    bindNum("pCH", v => f.h = clamp(v||5, 3, 2000));
    bindNum("pCX", v => f.x = clamp(v||0, 0, state.plateW));
    bindNum("pCY", v => f.y = clamp(v||0, 0, state.plateH));
    bindNum("pCRot", v => f.rotation = clamp(v||0, -180, 180));

    const txtBtn = document.getElementById("pCText");
    if(txtBtn) txtBtn.addEventListener("click", e => {
      f.showText = !f.showText;
      e.currentTarget.classList.toggle("on", f.showText);
      renderLive(); commit();
    });
    document.getElementById("pCQuiet").addEventListener("click", e => {
      f.quiet = !f.quiet;
      e.currentTarget.classList.toggle("on", f.quiet);
      renderLive(); commit();
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
      apply(v); renderLive(); commitDebounced();
    });
    input.addEventListener("blur", () => {
      if(input.value === "" || !isFinite(parseFloat(input.value))){ renderProps(); return; }
      apply(parseFloat(input.value)); renderLive(); commit();
    });
  }
  function bindSeg(id, apply){
    const g = document.getElementById(id);
    if(!g) return;
    g.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        g.querySelectorAll("button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        apply(b.dataset.v); renderLive(); commit();
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

  // ================= FIELD OPS =================
  function addField(f){
    state.fields.push(f);
    state.selectedId = f.id;
    renderAll();
    commit();                 // history first: a UI hiccup must not cost an undo step
    openDrawer("right");
  }
  function duplicateField(id){
    const f = getField(id);
    if(!f) return;
    const copy = Object.assign({}, f, {id:uid(),
      x: clamp(f.x+8, 0, state.plateW), y: clamp(f.y+8, 0, state.plateH)});
    delete copy._cache;
    state.fields.push(copy);
    state.selectedId = copy.id;
    renderAll(); commit();
  }
  function deleteField(id){
    state.fields = state.fields.filter(f => f.id !== id);
    if(state.selectedId === id) state.selectedId = null;
    renderAll(); commit();
  }

  // ================= CANVAS INTERACTION =================
  let dragging = null, resizing = null, resizeCtx = null, movedDuringDrag = false;
  const dragOffset = {x:0, y:0};
  const snapOn = () => document.getElementById("chkSnap").checked;
  const snapVal = v => snapOn() ? Math.round(v/SNAP_MM)*SNAP_MM : Math.round(v*2)/2;

  function svgPoint(evt){
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if(!ctm) return {x:0,y:0};
    return pt.matrixTransform(ctm.inverse());
  }
  function unrotate(x, y, cx, cy, deg){
    const rad = -deg*Math.PI/180, dx = x-cx, dy = y-cy;
    return {x: cx + dx*Math.cos(rad) - dy*Math.sin(rad), y: cy + dx*Math.sin(rad) + dy*Math.cos(rad)};
  }

  function attachCanvasHandlers(){
    svg.querySelectorAll('[data-id]:not([data-role])').forEach(node => {
      node.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation();
        const f = getField(node.dataset.id);
        if(!f) return;
        const p = svgPoint(e);
        dragOffset.x = p.x - MARGIN - f.x;
        dragOffset.y = p.y - MARGIN - f.y;
        dragging = f.id; movedDuringDrag = false;
        try{ svg.setPointerCapture(e.pointerId); }catch(_){}
        if(state.selectedId !== f.id){ state.selectedId = f.id; renderAll(); }
        else renderCanvas();
      });
    });

    svg.querySelectorAll('[data-role="resize-corner"], [data-role="rotate"]').forEach(node => {
      node.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation();
        const f = getField(node.dataset.id);
        if(!f) return;
        const outer = outerBox(f);
        const centerX = outer.x + outer.w/2;
        const centerY = outer.y + outer.h/2;
        const pivotX = f.type === "text" ? f.x : centerX;
        const pivotY = f.type === "text" ? f.y : centerY;
        if(node.dataset.role === "rotate"){
          const p = svgPoint(e);
          resizeCtx = {
            mode:"rotate",
            pivotX, pivotY,
            startRotation:f.rotation,
            startAngle:Math.atan2((p.y-MARGIN)-pivotY, (p.x-MARGIN)-pivotX)
          };
        } else {
          resizeCtx = {
            mode:"scale-corner",
            corner:node.dataset.corner || "br",
            pivotX, pivotY,
            rotation:f.rotation,
            centerX, centerY,
            halfW:Math.max(1, outer.w/2),
            halfH:Math.max(1, outer.h/2),
            startW:Math.max(1, outer.w),
            startH:Math.max(1, outer.h),
            startSize:f.type === "text" ? f.size : null,
            aspect:f.h > 0 ? f.w/f.h : 0,
            keepAspect:f.type === "image" || (f.type === "code" && f.codeKind === "qr")
          };
        }
        resizing = f.id; movedDuringDrag = false;
        if(state.selectedId !== f.id) state.selectedId = f.id;
        try{ svg.setPointerCapture(e.pointerId); }catch(_){}
      });
    });
  }

  svg.addEventListener("pointermove", e => {
    if(dragging){
      const f = getField(dragging);
      if(!f) return;
      const p = svgPoint(e);
      const b = outerBox(f);
      const maxX = isBox(f) ? Math.max(0, state.plateW-f.w) : state.plateW;
      const maxY = isBox(f) ? Math.max(0, state.plateH-f.h) : state.plateH;
      f.x = clamp(snapVal(p.x - MARGIN - dragOffset.x), 0, maxX);
      f.y = clamp(snapVal(p.y - MARGIN - dragOffset.y), 0, maxY);
      movedDuringDrag = true;
      renderCanvas(); syncPosInputs(f);
      return;
    }
    if(resizing){
      const f = getField(resizing);
      if(!f || !resizeCtx) return;
      const p = svgPoint(e);

      if(resizeCtx.mode === "rotate"){
        const ang = Math.atan2((p.y-MARGIN)-resizeCtx.pivotY, (p.x-MARGIN)-resizeCtx.pivotX);
        const next = resizeCtx.startRotation + (ang - resizeCtx.startAngle) * 180 / Math.PI;
        f.rotation = round1((((next + 180) % 360) + 360) % 360 - 180);
        movedDuringDrag = true;
        renderCanvas(); syncPosInputs(f);
        return;
      }

      if(resizeCtx.mode === "scale-corner"){
        const local = unrotate(p.x-MARGIN, p.y-MARGIN, resizeCtx.pivotX, resizeCtx.pivotY, resizeCtx.rotation);
        const scaleX = Math.max(0.08, Math.abs(local.x - resizeCtx.centerX) / resizeCtx.halfW);
        const scaleY = Math.max(0.08, Math.abs(local.y - resizeCtx.centerY) / resizeCtx.halfH);

        if(f.type === "text"){
          const scale = Math.max(scaleX, scaleY);
          f.size = round1(clamp(resizeCtx.startSize * scale, 3, 180));
          const nb = outerBox(f);
          moveOuterTo(f, resizeCtx.centerX - nb.w/2, resizeCtx.centerY - nb.h/2);
        } else {
          let w, h;
          if(resizeCtx.keepAspect && resizeCtx.aspect > 0){
            const scale = Math.max(scaleX, scaleY);
            w = resizeCtx.startW * scale;
            h = resizeCtx.startH * scale;
          } else {
            w = resizeCtx.startW * scaleX;
            h = resizeCtx.startH * scaleY;
          }
          const minH = f.type === "shape" && f.shape === "line" ? 0 : 1;
          f.w = round1(clamp(snapVal(w), 1, 2000));
          f.h = round1(clamp(snapVal(h), minH, 2000));
          moveOuterTo(f, resizeCtx.centerX - f.w/2, resizeCtx.centerY - f.h/2);
        }
        movedDuringDrag = true;
        renderCanvas(); syncPosInputs(f);
      }
    }
  });

  function endPointer(){
    if(dragging || resizing){
      renderLayers();
      if(movedDuringDrag) commit();
    }
    dragging = null; resizing = null; resizeCtx = null; movedDuringDrag = false;
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  window.addEventListener("pointerup", endPointer);

  svg.addEventListener("pointerdown", e => {
    const t = e.target;
    if(t === svg || t.classList.contains("plate-rect") || t.classList.contains("grid-line") ||
       t.classList.contains("ruler-tick") || t.classList.contains("ruler-text")){
      if(state.selectedId !== null){ state.selectedId = null; renderAll(); }
    }
  });

  // ================= ZOOM =================
  function fitZoom(){
    const availW = canvasWrap.clientWidth - 32;
    const availH = canvasWrap.clientHeight - 32;
    if(availW <= 0 || availH <= 0) return;
    const base = 1.9;
    const z = Math.min(availW/(totalW()*base), availH/(totalH()*base));
    state.zoom = clamp(+z.toFixed(3), 0.15, 3);
    renderCanvas();
  }
  document.getElementById("btnZoomIn").addEventListener("click", () => { state.zoom = clamp(+(state.zoom+0.15).toFixed(3), 0.15, 4); renderCanvas(); });
  document.getElementById("btnZoomOut").addEventListener("click", () => { state.zoom = clamp(+(state.zoom-0.15).toFixed(3), 0.15, 4); renderCanvas(); });
  document.getElementById("btnZoomFit").addEventListener("click", fitZoom);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if(!leftDrawer.classList.contains("open") && !rightDrawer.classList.contains("open")) fitZoom();
      else renderCanvas();
    }, 140);
  });
  window.addEventListener("orientationchange", () => setTimeout(fitZoom, 250));

  // ================= DIALOGOS TEMATICOS =================
  const appDialog = document.getElementById("appDialog");
  const dialogCard = appDialog.querySelector(".dialog-card");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogMessage = document.getElementById("dialogMessage");
  const dialogIcon = document.getElementById("dialogIcon");
  const dialogBody = document.getElementById("dialogBody");
  const dialogCancel = document.getElementById("dialogCancel");
  const dialogConfirm = document.getElementById("dialogConfirm");
  let dialogResolver = null;

  function closeAppDialog(value){
    if(!appDialog.classList.contains("open")) return;
    appDialog.classList.remove("open");
    appDialog.setAttribute("aria-hidden", "true");
    const resolve = dialogResolver;
    dialogResolver = null;
    setTimeout(() => { dialogBody.innerHTML = ""; if(resolve) resolve(value); }, 120);
  }

  function openAppDialog(opts){
    const o = Object.assign({
      title:"Confirmar", message:"", icon:"?", danger:false, input:false,
      inputValue:"", placeholder:"", confirmText:"Confirmar", cancelText:"Cancelar"
    }, opts || {});

    if(dialogResolver) closeAppDialog(false);
    dialogTitle.textContent = o.title;
    dialogMessage.textContent = o.message;
    dialogMessage.style.display = o.message ? "block" : "none";
    dialogIcon.textContent = o.icon;
    dialogIcon.classList.toggle("danger", !!o.danger);
    dialogCancel.textContent = o.cancelText;
    dialogConfirm.textContent = o.confirmText;
    dialogConfirm.className = o.danger ? "btn confirm-danger" : "btn primary";
    dialogBody.innerHTML = "";

    let input = null;
    if(o.input){
      input = document.createElement("input");
      input.type = "text";
      input.className = "dialog-input";
      input.value = o.inputValue || "";
      input.placeholder = o.placeholder || "";
      input.autocomplete = "off";
      dialogBody.appendChild(input);
    }

    appDialog.classList.add("open");
    appDialog.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      if(input){ input.focus(); input.select(); }
      else dialogConfirm.focus();
    });

    return new Promise(resolve => {
      dialogResolver = resolve;
      dialogCancel.onclick = () => closeAppDialog(o.input ? null : false);
      dialogConfirm.onclick = () => {
        if(input){
          const value = input.value.trim();
          if(!value){ input.focus(); return; }
          closeAppDialog(value);
        } else closeAppDialog(true);
      };
      appDialog.onclick = e => { if(e.target === appDialog) closeAppDialog(o.input ? null : false); };
      dialogCard.onclick = e => e.stopPropagation();
      appDialog.onkeydown = e => {
        if(e.key === "Escape"){ e.preventDefault(); closeAppDialog(o.input ? null : false); }
        if(e.key === "Enter" && input && document.activeElement === input){
          e.preventDefault(); dialogConfirm.click();
        }
      };
    });
  }

  function askConfirm(message, options){
    return openAppDialog(Object.assign({title:"Confirmar ação", message, icon:"?"}, options || {}));
  }
  function askText(message, options){
    return openAppDialog(Object.assign({title:"Salvar modelo", message, icon:"✎", input:true}, options || {}));
  }

  const { exportSVG, exportPNG } = createExporter({
    state, SVGNS, XLINK, el, isBox, shownText, codeMatrix, loadTemplates, showToast
  });

  // ================= TOOLBAR =================
  document.getElementById("btnAddText").addEventListener("click", () => addField(newText({text:"NOVO TEXTO"})));
  document.getElementById("chkGrid").addEventListener("change", renderCanvas);

  document.getElementById("btnAddImage").addEventListener("click", () => document.getElementById("fileImageInput").click());
  document.getElementById("btnAddQR").addEventListener("click", () => {
    const q = newCode("qr");
    q.data = "https://";
    addField(q);
    showToast("QR Code adicionado — digite o conteúdo em Propriedades");
  });
  document.getElementById("btnDupQuick").addEventListener("click", () => {
    if(state.selectedId) duplicateField(state.selectedId);
  });
  document.getElementById("btnCenterQuick").addEventListener("click", () => {
    const f = getField(state.selectedId);
    if(!f) return;
    alignField(f, "hcenter", true);
    alignField(f, "vcenter");
    showToast("Elemento centralizado");
  });
  document.getElementById("btnFrontQuick").addEventListener("click", () => {
    if(!state.selectedId) return;
    reorderField(state.selectedId, "front");
    showToast("Elemento trazido para frente");
  });
  document.getElementById("btnBackQuick").addEventListener("click", () => {
    if(!state.selectedId) return;
    reorderField(state.selectedId, "back");
    showToast("Elemento enviado para trás");
  });
  document.getElementById("fileImageInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if(!file) return;
    readImageFile(file).then(r => {
      addField(newImage(r.src, file.name, r.naturalW, r.naturalH));
      showToast("Imagem adicionada");
    }).catch(() => showToast("Não consegui ler essa imagem"))
      .finally(() => { e.target.value = ""; });
  });

  // --- popup menus ---
  function setupMenu(btnId, menuId, onPick, dataKey){
    const btn = document.getElementById(btnId), menu = document.getElementById(menuId);
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("open");
      closeAllMenus();
      if(!isOpen){ menu.classList.add("open"); btn.setAttribute("aria-expanded","true"); }
    });
    menu.querySelectorAll("button").forEach(item => {
      item.addEventListener("click", e => {
        e.stopPropagation();
        closeAllMenus();
        onPick(item.dataset[dataKey]);
      });
    });
  }
  function closeAllMenus(){
    document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
    document.querySelectorAll('[aria-expanded="true"]').forEach(b => b.setAttribute("aria-expanded","false"));
  }
  document.addEventListener("click", closeAllMenus);

  setupMenu("btnDownload", "downloadMenu", fmt => {
    if(fmt === "svg") exportSVG();
    else exportPNG(fmt === "png600" ? 600 : 300);
  }, "dl");

  document.getElementById("btnUndo").addEventListener("click", undo);
  document.getElementById("btnRedo").addEventListener("click", redo);
  document.getElementById("btnUndoMobile").addEventListener("click", undo);
  document.getElementById("btnRedoMobile").addEventListener("click", redo);

  document.getElementById("plateW").addEventListener("change", e => {
    state.plateW = clamp(parseFloat(e.target.value)||380, 10, 1000);
    e.target.value = state.plateW;
    state.fields.forEach(f => f.x = clamp(f.x, 0, isBox(f) ? Math.max(0,state.plateW-f.w) : state.plateW));
    renderAll(); fitZoom(); commit();
  });
  document.getElementById("plateH").addEventListener("change", e => {
    state.plateH = clamp(parseFloat(e.target.value)||380, 10, 1000);
    e.target.value = state.plateH;
    state.fields.forEach(f => f.y = clamp(f.y, 0, isBox(f) ? Math.max(0,state.plateH-f.h) : state.plateH));
    renderAll(); fitZoom(); commit();
  });

  document.getElementById("btnNew").addEventListener("click", async () => {
    if(state.fields.length){
      const ok = await askConfirm("O que não estiver salvo será perdido.", {
        title:"Nova marcação", icon:"＋", confirmText:"Começar nova"
      });
      if(!ok) return;
    }
    state.fields = []; state.selectedId = null; state.activeTemplateId = null;
    renderAll(); renderTemplateList(); commit(); closeDrawer("left");
  });

  // ================= TEMPLATES =================
  function loadTemplates(){
    return storageLoadTemplates(STORE_KEY);
  }
  function persistTemplates(list){
    const ok = storagePersistTemplates(STORE_KEY, list);
    if(!ok) showToast("Armazenamento cheio. Exclua modelos antigos com imagens grandes.");
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
    state.selectedId = null; state.activeTemplateId = id;
    document.getElementById("plateW").value = state.plateW;
    document.getElementById("plateH").value = state.plateH;
    renderAll(); renderTemplateList(); fitZoom(); commit();
    showToast(`Modelo "${t.name}" carregado`);
    closeDrawer("left");
  }
  async function removeTemplate(id){
    const ok = await askConfirm("Essa exclusão não pode ser desfeita.", {
      title:"Excluir modelo", icon:"!", danger:true, confirmText:"Excluir"
    });
    if(!ok) return;
    persistTemplates(loadTemplates().filter(x => x.id !== id));
    if(state.activeTemplateId === id) state.activeTemplateId = null;
    renderTemplateList();
    showToast("Modelo excluído");
  }
  document.getElementById("btnSaveTmpl").addEventListener("click", async () => {
    if(!state.fields.length){ showToast("Adicione ao menos um elemento antes de salvar"); return; }
    const name = await askText("Dê um nome para identificar esta marcação depois.", {
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
      renderTemplateList(); showToast("Modelo salvo");
    }
  });

  // ================= TOAST =================
  let toastTimer = null;
  function showToast(msg){
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ================= THEME =================
  function setTheme(name, silent){
    document.documentElement.setAttribute("data-theme", name);
    savePreference(THEME_KEY, name);
    const btnDark = document.getElementById("themeDark");
    const btnLight = document.getElementById("themeLight");
    btnDark.classList.toggle("active", name === "dark");
    btnLight.classList.toggle("active", name === "light");
    btnDark.setAttribute("aria-pressed", name === "dark" ? "true" : "false");
    btnLight.setAttribute("aria-pressed", name === "light" ? "true" : "false");
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content", name === "dark" ? "#121417" : "#FAF9F6");
    if(!silent) showToast(name === "dark" ? "Tema escuro ativado" : "Tema claro ativado");
  }
  document.getElementById("themeDark").addEventListener("click", () => setTheme("dark", false));
  document.getElementById("themeLight").addEventListener("click", () => setTheme("light", false));

  // ================= DRAWERS =================
  const leftDrawer = document.getElementById("sidebarLeft");
  const rightDrawer = document.getElementById("sidebarRight");
  const backdrop = document.getElementById("backdrop");
  const isCompact = () => window.matchMedia
    ? window.matchMedia("(max-width: 1024px)").matches
    : window.innerWidth <= 1024;

  function openDrawer(side){
    if(!isCompact()) return;
    (side === "left" ? leftDrawer : rightDrawer).classList.add("open");
    backdrop.classList.add("show");
  }
  function closeDrawer(side){
    (side === "left" ? leftDrawer : rightDrawer).classList.remove("open");
    if(!leftDrawer.classList.contains("open") && !rightDrawer.classList.contains("open")) backdrop.classList.remove("show");
  }
  document.getElementById("btnOpenLeft").addEventListener("click", () => openDrawer("left"));
  document.getElementById("btnOpenRight").addEventListener("click", () => openDrawer("right"));
  document.getElementById("closeLeft").addEventListener("click", () => closeDrawer("left"));
  document.getElementById("closeRight").addEventListener("click", () => closeDrawer("right"));
  backdrop.addEventListener("click", () => { closeDrawer("left"); closeDrawer("right"); });

  // ================= KEYBOARD =================
  function isEditing(){
    const a = document.activeElement;
    if(!a) return false;
    return a.isContentEditable || ["INPUT","TEXTAREA","SELECT","BUTTON"].includes(a.tagName);
  }
  window.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.key.toLowerCase() === "z"){
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if(mod && e.key.toLowerCase() === "y"){ e.preventDefault(); redo(); return; }
    if(e.key === "Escape"){ closeAllMenus(); closeDrawer("left"); closeDrawer("right"); return; }
    if(e.key === "Delete" && state.selectedId && !isEditing()){
      deleteField(state.selectedId);
      e.preventDefault();
    }
  });

  // ================= INIT =================
  (function initTheme(){
    const saved = loadPreference(THEME_KEY);
    const prefersLight = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
    setTheme(saved || (prefersLight ? "light" : "dark"), true);
  })();


  renderTemplateList();
  renderAll();
  commit();
  requestAnimationFrame(fitZoom);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderCanvas());


}
