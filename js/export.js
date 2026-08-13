// Exportação SVG/PNG.

export function createExporter(deps){
  const { state, SVGNS, XLINK, el, isBox, shownText, codeMatrix, loadTemplates, showToast } = deps;

  async function fontsReady(){
    if(document.fonts && document.fonts.ready){ try{ await document.fonts.ready; }catch(_){} }
  }
  function loadImg(src){
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej; i.src = src;
    });
  }

  async function exportSVG(opts){
    const transparent = !!(opts && opts.transparent);
    if(!state.fields.length){ showToast("Nada para exportar ainda"); return; }
    await fontsReady();
    const out = document.createElementNS(SVGNS, "svg");
    out.setAttribute("xmlns", SVGNS);
    out.setAttribute("xmlns:xlink", XLINK);
    out.setAttribute("width", state.plateW+"mm");
    out.setAttribute("height", state.plateH+"mm");
    out.setAttribute("viewBox", `0 0 ${state.plateW} ${state.plateH}`);
    if(!transparent) out.appendChild(el("rect", {x:0, y:0, width:state.plateW, height:state.plateH, fill:"#ffffff"}));

    const INK = "#000000";
    state.fields.forEach(f => {
      const cx = f.x + (isBox(f) ? f.w/2 : 0), cy = f.y + (isBox(f) ? f.h/2 : 0);
      const rot = `rotate(${f.rotation} ${cx} ${cy})`;

      if(f.type === "text"){
        const t = el("text", {x:f.x, y:f.y, "font-family":f.font.replace(/'/g,""),
          "font-size":f.size, "font-weight":f.weight, "text-anchor":f.align,
          "dominant-baseline":"middle", fill:INK,
          transform:`rotate(${f.rotation} ${f.x} ${f.y})`});
        t.style.letterSpacing = f.spacing+"mm";
        t.textContent = shownText(f);
        out.appendChild(t);
        return;
      }
      if(f.type === "image"){
        const img = el("image", {x:f.x, y:f.y, width:f.w, height:f.h, preserveAspectRatio:"none"});
        img.setAttributeNS(XLINK, "href", f.src);
        img.setAttribute("href", f.src);
        let tr = rot;
        if(f.flipH || f.flipV){
          const sx = f.flipH?-1:1, sy = f.flipV?-1:1;
          tr += ` translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;
        }
        img.setAttribute("transform", tr);
        out.appendChild(img);
        return;
      }
      if(f.type === "shape"){
        let n;
        if(f.shape === "line") n = el("line", {x1:f.x, y1:f.y+f.h/2, x2:f.x+f.w, y2:f.y+f.h/2, stroke:INK, "stroke-width":f.stroke});
        else if(f.shape === "rect") n = el("rect", {x:f.x, y:f.y, width:f.w, height:f.h, fill:INK});
        else n = el("rect", {x:f.x+f.stroke/2, y:f.y+f.stroke/2,
          width:Math.max(0.1,f.w-f.stroke), height:Math.max(0.1,f.h-f.stroke), fill:"none", stroke:INK, "stroke-width":f.stroke});
        n.setAttribute("transform", rot);
        out.appendChild(n);
        return;
      }
      // code
      const g = el("g", {transform:rot});
      const data = codeMatrix(f);
      if(!data) return;
      if(f.codeKind === "qr"){
        const quiet = f.quiet ? 4 : 0, total = data.size + quiet*2;
        const side = Math.min(f.w, f.h), unit = side/total;
        const ox = f.x + (f.w-side)/2, oy = f.y + (f.h-side)/2;
        if(f.quiet) g.appendChild(el("rect", {x:ox, y:oy, width:side, height:side, fill:"#ffffff"}));
        for(let r=0; r<data.size; r++){
          let c = 0;
          while(c < data.size){
            if(data.modules[r][c]){
              let len = 1;
              while(c+len < data.size && data.modules[r][c+len]) len++;
              g.appendChild(el("rect", {x:ox+(quiet+c)*unit, y:oy+(quiet+r)*unit,
                width:len*unit, height:unit, fill:INK}));
              c += len;
            } else c++;
          }
        }
      } else {
        const textH = f.showText ? Math.min(f.h*0.22, 6) : 0;
        const qU = f.quiet ? 10 : 0, totalU = data.length + qU*2;
        const unit = f.w/totalU, barsH = f.h - textH, ox = f.x + qU*unit;
        if(f.quiet) g.appendChild(el("rect", {x:f.x, y:f.y, width:f.w, height:f.h, fill:"#ffffff"}));
        let i = 0;
        while(i < data.length){
          if(data[i] === "1"){
            let len = 1;
            while(i+len < data.length && data[i+len] === "1") len++;
            g.appendChild(el("rect", {x:ox+i*unit, y:f.y, width:len*unit, height:barsH, fill:INK}));
            i += len;
          } else i++;
        }
        if(f.showText){
          const t = el("text", {x:f.x+f.w/2, y:f.y+f.h-textH*0.15, "text-anchor":"middle",
            fill:INK, "font-size":textH*0.85, "font-family":"IBM Plex Mono, monospace"});
          t.textContent = f.codeKind === "code39" ? f.data.toUpperCase() : f.data;
          g.appendChild(t);
        }
      }
      out.appendChild(g);
    });

    const src = new XMLSerializer().serializeToString(out);
    download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n'+src], {type:"image/svg+xml"}), filename()+(transparent?"-transparente":"")+".svg");
    showToast("SVG exportado");
  }

  const RASTER_MIME = {png:"image/png", jpeg:"image/jpeg", webp:"image/webp"};
  const RASTER_EXT = {png:"png", jpeg:"jpg", webp:"webp"};

  // format: "png" | "jpeg" | "webp". JPEG não tem canal alfa — ignora
  // transparent e sempre desenha fundo branco, mesmo se pedido.
  async function exportRaster(format, dpi, opts){
    const requestTransparent = !!(opts && opts.transparent);
    const transparent = requestTransparent && format !== "jpeg";
    if(!state.fields.length){ showToast("Nada para exportar ainda"); return; }
    await fontsReady();
    const k = dpi/25.4;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(state.plateW*k);
    canvas.height = Math.round(state.plateH*k);
    const ctx = canvas.getContext("2d");
    if(!transparent){
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    try{
      for(const f of state.fields){
        const cx = (f.x + (isBox(f) ? f.w/2 : 0))*k, cy = (f.y + (isBox(f) ? f.h/2 : 0))*k;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(f.rotation*Math.PI/180);
        ctx.fillStyle = "#000000";

        if(f.type === "text"){
          ctx.font = `${f.weight} ${f.size*k}px ${f.font.replace(/'/g,"")}`;
          const txt = shownText(f), sp = f.spacing*k, chars = [...txt];
          let total = 0;
          chars.forEach((ch,i) => { total += ctx.measureText(ch).width; if(i<chars.length-1) total += sp; });
          let cur = f.align === "start" ? 0 : (f.align === "end" ? -total : -total/2);
          chars.forEach(ch => { ctx.fillText(ch, cur, 0); cur += ctx.measureText(ch).width + sp; });
          ctx.restore(); continue;
        }

        const w = f.w*k, h = f.h*k, ox = -w/2, oy = -h/2;

        if(f.type === "image"){
          const img = await loadImg(f.src);
          ctx.scale(f.flipH?-1:1, f.flipV?-1:1);
          ctx.drawImage(img, ox, oy, w, h);
          ctx.restore(); continue;
        }
        if(f.type === "shape"){
          if(f.shape === "line"){
            ctx.lineWidth = f.stroke*k;
            ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox+w, 0); ctx.strokeStyle = "#000"; ctx.stroke();
          } else if(f.shape === "rect"){
            ctx.fillRect(ox, oy, w, h);
          } else {
            ctx.lineWidth = f.stroke*k; ctx.strokeStyle = "#000";
            ctx.strokeRect(ox+f.stroke*k/2, oy+f.stroke*k/2, Math.max(1,w-f.stroke*k), Math.max(1,h-f.stroke*k));
          }
          ctx.restore(); continue;
        }

        // code
        const data = codeMatrix(f);
        if(!data){ ctx.restore(); continue; }
        if(f.codeKind === "qr"){
          const quiet = f.quiet?4:0, total = data.size+quiet*2;
          const side = Math.min(w,h), unit = side/total;
          const qx = ox+(w-side)/2, qy = oy+(h-side)/2;
          if(f.quiet){ ctx.fillStyle = "#fff"; ctx.fillRect(qx, qy, side, side); ctx.fillStyle = "#000"; }
          for(let r=0; r<data.size; r++){
            let c = 0;
            while(c < data.size){
              if(data.modules[r][c]){
                let len = 1;
                while(c+len < data.size && data.modules[r][c+len]) len++;
                ctx.fillRect(qx+(quiet+c)*unit, qy+(quiet+r)*unit, len*unit+0.5, unit+0.5);
                c += len;
              } else c++;
            }
          }
        } else {
          const textH = f.showText ? Math.min(h*0.22, 6*k) : 0;
          const qU = f.quiet?10:0, totalU = data.length+qU*2;
          const unit = w/totalU, barsH = h-textH, bx = ox+qU*unit;
          if(f.quiet){ ctx.fillStyle = "#fff"; ctx.fillRect(ox, oy, w, h); ctx.fillStyle = "#000"; }
          let i = 0;
          while(i < data.length){
            if(data[i] === "1"){
              let len = 1;
              while(i+len < data.length && data[i+len] === "1") len++;
              ctx.fillRect(bx+i*unit, oy, len*unit+0.5, barsH);
              i += len;
            } else i++;
          }
          if(f.showText){
            ctx.font = `${textH*0.85}px 'IBM Plex Mono', monospace`;
            ctx.textAlign = "center";
            const label = f.codeKind === "code39" ? f.data.toUpperCase() : f.data;
            ctx.fillText(label, 0, oy+h-textH*0.5);
            ctx.textAlign = "left";
          }
        }
        ctx.restore();
      }
    }catch(_){
      showToast("Falha ao desenhar um dos elementos");
      return;
    }

    const ext = RASTER_EXT[format], mime = RASTER_MIME[format];
    const quality = format === "png" ? undefined : 0.92;
    canvas.toBlob(blob => {
      if(!blob){ showToast(`Falha ao gerar o ${ext.toUpperCase()}`); return; }
      download(blob, filename()+`-${dpi}dpi`+(transparent?"-transparente":"")+`.${ext}`);
      showToast(`${ext.toUpperCase()} ${dpi} DPI exportado`);
    }, mime, quality);
  }

  function filename(){
    const t = loadTemplates().find(x => x.id === state.activeTemplateId);
    const base = t ? t.name : "marcacao";
    return base.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-zA-Z0-9-_ ]/g,"").trim().replace(/\s+/g,"-").toLowerCase() || "marcacao";
  }
  function download(blob, name){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return { exportSVG, exportRaster };
}
