import { MARGIN } from "./constants.js";

/** @typedef {import("./types.js").Field} Field */
/** @typedef {import("./types.js").TextField} TextField */
/** @typedef {import("./types.js").ImageField} ImageField */
/** @typedef {import("./types.js").ShapeField} ShapeField */
/** @typedef {import("./types.js").CodeField} CodeField */

// Geometria dos campos na placa: caixa delimitadora, largura de texto medida
// e a caixa "externa" (relativa à placa, sem a margem do artboard) usada
// pelas ferramentas de alinhamento.
/**
 * @param {{
 *   isBox: (f: Field) => f is ImageField|ShapeField|CodeField,
 *   round1: (v: number) => number,
 * }} ctx
 */
export function createGeometry(ctx){
  const { isBox, round1 } = ctx;

  /** @param {TextField} f @returns {string} */
  const shownText = f => f.uppercase ? f.text.toUpperCase() : f.text;

  let measureCtx = null, measureTried = false;
  /** @param {TextField} f @returns {number} */
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

  /** @param {Field} f @returns {{x:number,y:number,w:number,h:number}} */
  function bboxOf(f){
    if(isBox(f)) return {x:MARGIN+f.x, y:MARGIN+f.y, w:f.w, h:f.h};
    // isBox() é falso apenas para type==="text", então f é um TextField aqui.
    const px = MARGIN+f.x, py = MARGIN+f.y;
    const w = textWidth(f)+4, h = f.size*1.3;
    const x0 = f.align === "start" ? px-2 : (f.align === "end" ? px-w+2 : px-w/2);
    return {x:x0, y:py-h/2, w, h};
  }

  // Plate-relative outer box, used by the alignment tools.
  /** @param {Field} f @returns {{x:number,y:number,w:number,h:number}} */
  function outerBox(f){
    if(isBox(f)) return {x:f.x, y:f.y, w:f.w, h:f.h};
    const b = bboxOf(f);
    return {x:b.x-MARGIN, y:b.y-MARGIN, w:b.w, h:b.h};
  }
  /** @param {Field} f @param {number} nx @param {number} ny */
  function moveOuterTo(f, nx, ny){
    if(isBox(f)){ f.x = round1(nx); f.y = round1(ny); return; }
    const cur = outerBox(f);
    f.x = round1(f.x + (nx - cur.x));
    f.y = round1(f.y + (ny - cur.y));
  }

  // As 4 pontas da caixa externa do campo, giradas por f.rotation ao redor do
  // próprio centro — usado para a caixa de seleção do grupo (multi-seleção).
  /** @param {Field} f @returns {{x:number,y:number}[]} */
  function rotatedOuterCorners(f){
    const b = outerBox(f);
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const rad = (f.rotation||0)*Math.PI/180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].map(([x,y]) => {
      const dx = x-cx, dy = y-cy;
      return {x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos};
    });
  }

  // Caixa alinhada aos eixos (plate-relative) que envolve todos os campos
  // dados, considerando a rotação de cada um — usada pela seleção múltipla.
  /** @param {Field[]} fields @returns {{x:number,y:number,w:number,h:number}} */
  function groupOuterBox(fields){
    if(!fields.length) return {x:0, y:0, w:0, h:0};
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    fields.forEach(f => {
      rotatedOuterCorners(f).forEach(p => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      });
    });
    return {x:minX, y:minY, w:maxX-minX, h:maxY-minY};
  }

  return { shownText, textWidth, bboxOf, outerBox, moveOuterTo, groupOuterBox };
}
