import { QR } from "../qr.js";
import { BARCODE } from "../barcode.js";
import { FONTS } from "./constants.js";

/** @typedef {import("./types.js").TextField} TextField */
/** @typedef {import("./types.js").ImageField} ImageField */
/** @typedef {import("./types.js").ShapeField} ShapeField */
/** @typedef {import("./types.js").CodeField} CodeField */

// Fábricas dos quatro tipos de campo (texto, imagem, forma, código) e o
// cache de matriz de QR/código de barras, reconstruído só quando o
// conteúdo relevante muda.
export function createFields(ctx){
  const { state, uid, round1 } = ctx;

  /**
   * @param {Partial<TextField>} [over]
   * @returns {TextField}
   */
  function newText(over){
    return Object.assign({
      id: uid(), type:"text", text:"TEXTO",
      x: Math.round(state.plateW/2), y: Math.round(state.plateH/2),
      size:18, font:FONTS[0].value, weight:"600",
      align:"middle", rotation:0, spacing:0, uppercase:false,
    }, over || {});
  }
  /**
   * @param {string} src
   * @param {string} name
   * @param {number} nw
   * @param {number} nh
   * @returns {ImageField}
   */
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
  /**
   * @param {ShapeField["shape"]} shape
   * @returns {ShapeField}
   */
  function newShape(shape){
    const w = Math.min(100, state.plateW*0.5);
    const h = shape === "line" ? 0 : Math.min(50, state.plateH*0.25);
    return {
      id:uid(), type:"shape", shape,
      x:round1((state.plateW-w)/2), y:round1((state.plateH-h)/2),
      w:round1(w), h:round1(h), rotation:0, stroke:1.5,
    };
  }
  /**
   * @param {CodeField["codeKind"]} kind
   * @returns {CodeField}
   */
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

  /**
   * @param {CodeField} f
   * @returns {*} matriz do QR ou string de bits do código de barras; `null` se o conteúdo for inválido
   */
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

  return { newText, newImage, newShape, newCode, codeMatrix };
}
