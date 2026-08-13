// @ts-nocheck — manipulação de DOM/SVG genérica (getElementById sem narrowing); só a camada de dados é checada (ver js/editor/types.js).
import { MARGIN, SVGNS, XLINK } from "./constants.js";

// Desenha o estado atual (placa, grade, réguas e campos) no <svg id="artboard">.
export function createRenderer(ctx){
  const { state, svg, getField, totalW, totalH, bboxOf, shownText, codeMatrix } = ctx;

  function el(tag, attrs){
    const n = document.createElementNS(SVGNS, tag);
    for(const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function renderAll(){ renderCanvas(); ctx.renderLayers(); ctx.renderProps(); updateSelectionActionButtons(); }

  function updateSelectionActionButtons(){
    const hasSel = !!getField(state.selectedId);
    ["btnDupQuick","btnCenterQuick","btnFrontQuick","btnBackQuick"].forEach(id => {
      const btn = document.getElementById(id);
      if(btn) btn.disabled = !hasSel;
    });
  }
  function renderLive(){ renderCanvas(); ctx.renderLayers(); }

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
    ctx.attachCanvasHandlers();
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

  return {
    el, renderAll, renderLive, renderCanvas, updateSelectionActionButtons,
    drawGrid, drawRulers, drawText, boxGroup, addSelectionChrome, addBoxChrome,
    drawImage, drawShape, drawCode, drawQrInto, drawBarsInto,
  };
}
