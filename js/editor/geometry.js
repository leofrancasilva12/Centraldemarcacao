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

  return { shownText, textWidth, bboxOf, outerBox, moveOuterTo };
}
