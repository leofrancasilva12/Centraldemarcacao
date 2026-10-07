// Exportação PNG/JPG.

export function createExporter(deps){
  const { state, isBox, shownText, codeMatrix, loadTemplates, showToast } = deps;

  async function fontsReady(){
    if(document.fonts && document.fonts.ready){ try{ await document.fonts.ready; }catch(_){} }
  }
  function loadImg(src){
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej; i.src = src;
    });
  }

  const RASTER_MIME = {png:"image/png", jpeg:"image/jpeg"};
  const RASTER_EXT = {png:"png", jpeg:"jpg"};
  // Acima disso, o canvas fica grande demais: trava o navegador (às vezes por
  // minutos, sem nenhum aviso) ou estoura o limite de tamanho de canvas em
  // alguns navegadores/celulares. Placas grandes em DPI alto são escaladas
  // para caber nesse limite, com aviso.
  const MAX_RASTER_DIM = 12000;

  // format: "png" | "jpeg". JPEG não tem canal alfa — ignora
  // transparent e sempre desenha fundo branco, mesmo se pedido.
  async function exportRaster(format, dpi, opts){
    const requestTransparent = !!(opts && opts.transparent);
    const transparent = requestTransparent && format !== "jpeg";
    if(!state.fields.length){ showToast("Nada para exportar ainda"); return; }
    showToast("Gerando imagem…");
    await fontsReady();
    let k = dpi/25.4;
    let effectiveDpi = dpi;
    const rawDim = Math.max(state.plateW, state.plateH)*k;
    if(rawDim > MAX_RASTER_DIM){
      k *= MAX_RASTER_DIM/rawDim;
      effectiveDpi = Math.round(k*25.4);
      showToast(`Placa grande: resolução ajustada para ~${effectiveDpi} DPI para não travar o navegador`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(state.plateW*k);
    canvas.height = Math.round(state.plateH*k);
    const ctx = canvas.getContext("2d");
    if(!ctx){
      showToast("Não consegui desenhar a imagem — alguma extensão do navegador pode estar bloqueando o canvas");
      return;
    }

    try{
      if(!transparent){
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0,0,canvas.width,canvas.height);
      }
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

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
    let blob;
    try{
      blob = await new Promise(resolve => canvas.toBlob(resolve, mime, quality));
    }catch(_){
      blob = null;
    }
    if(!blob){ showToast(`Falha ao gerar o ${ext.toUpperCase()} — tente de novo ou desative extensões de privacidade/bloqueio`); return; }
    try{
      download(blob, filename()+`-${effectiveDpi}dpi`+(transparent?"-transparente":"")+`.${ext}`);
    }catch(_){
      showToast("Falha ao iniciar o download");
      return;
    }
    showToast(`${ext.toUpperCase()} ${effectiveDpi} DPI exportado`);
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

  return { exportRaster };
}
