// Ferramentas de imagem locais/offline.

/**
 * @param {File} file
 * @returns {Promise<{src:string, naturalW:number, naturalH:number}>}
 */
export function readImageFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL() below always yields a string result, never an ArrayBuffer.
      const src = /** @type {string} */ (reader.result);
      const img = new Image();
      img.onload = () => resolve({src, naturalW:img.naturalWidth||300, naturalH:img.naturalHeight||300});
      img.onerror = () => resolve({src, naturalW:300, naturalH:300});
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Remoção local/offline de fundos uniformes. Não envia a imagem para nenhum servidor.
export function removeImageBackground(src, tolerance, feather, forceWhite){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try{
        const maxSide = 1800;
        const scale = Math.min(1, maxSide/Math.max(img.naturalWidth||1, img.naturalHeight||1));
        const w = Math.max(1, Math.round((img.naturalWidth||1)*scale));
        const h = Math.max(1, Math.round((img.naturalHeight||1)*scale));
        const c = document.createElement("canvas"); c.width=w; c.height=h;
        const ctx = c.getContext("2d", {willReadFrequently:true});
        ctx.drawImage(img,0,0,w,h);
        const id = ctx.getImageData(0,0,w,h), d=id.data;

        let br=255,bg=255,bb=255;
        if(!forceWhite){
          const samples=[];
          const step=Math.max(1,Math.floor(Math.min(w,h)/40));
          for(let x=0;x<w;x+=step){ samples.push([x,0],[x,h-1]); }
          for(let y=0;y<h;y+=step){ samples.push([0,y],[w-1,y]); }
          let sr=0,sg=0,sb=0,n=0;
          for(const [x,y] of samples){ const i=(y*w+x)*4; if(d[i+3]<20) continue; sr+=d[i]; sg+=d[i+1]; sb+=d[i+2]; n++; }
          if(n){ br=sr/n; bg=sg/n; bb=sb/n; }
        }

        const t=Math.max(1,+tolerance||48), f=Math.max(0,+feather||0);
        const full=t, outer=t+f;
        for(let i=0;i<d.length;i+=4){
          if(d[i+3]===0) continue;
          const dr=d[i]-br, dg=d[i+1]-bg, db=d[i+2]-bb;
          const dist=Math.sqrt(dr*dr+dg*dg+db*db);
          if(dist<=full) d[i+3]=0;
          else if(f>0 && dist<outer) d[i+3]=Math.round(d[i+3]*((dist-full)/f));
        }
        ctx.putImageData(id,0,0);
        resolve(c.toDataURL("image/png"));
      }catch(err){ reject(err); }
    };
    img.onerror=reject;
    img.src=src;
  });
}
