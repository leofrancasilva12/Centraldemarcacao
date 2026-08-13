import { createExporter } from "./export.js";
import { MARGIN, SVGNS, XLINK } from "./editor/constants.js";
import { createToast } from "./editor/toast.js";
import { createDialogs } from "./editor/dialogs.js";
import { createSelection } from "./editor/selection.js";
import { createGeometry } from "./editor/geometry.js";
import { createFields } from "./editor/fields.js";
import { createDrawers } from "./editor/drawers.js";
import { createHistory } from "./editor/history.js";
import { createInteraction } from "./editor/interaction.js";
import { createRenderer } from "./editor/render.js";
import { createLayers } from "./editor/layers.js";
import { createFieldOps } from "./editor/field-ops.js";
import { createPropertiesPanel } from "./editor/properties-panel.js";
import { createZoom } from "./editor/zoom.js";
import { createTheme } from "./editor/theme.js";
import { createTemplates } from "./editor/templates.js";
import { createToolbar } from "./editor/toolbar.js";
import { createKeyboard } from "./editor/keyboard.js";

/** @typedef {import("./editor/types.js").EditorState} EditorState */
/** @typedef {import("./editor/types.js").Field} Field */
/** @typedef {import("./editor/types.js").ImageField} ImageField */
/** @typedef {import("./editor/types.js").ShapeField} ShapeField */
/** @typedef {import("./editor/types.js").CodeField} CodeField */

// Monta o app: um objeto `ctx` compartilhado é preenchido incrementalmente
// por cada módulo (histórico, desenho, painel de propriedades, interação
// com o canvas, modelos salvos etc.), e os módulos se chamam entre si
// através de `ctx.<função>` — assim cada arquivo fica pequeno e testável
// isoladamente, sem perder o acesso ao estado compartilhado do editor.
export function initEditor(){
  /** @type {EditorState} */
  const state = {
    plateW: 380, plateH: 380,
    fields: [], selectedIds: [],
    zoom: 1, activeTemplateId: null,
  };

  let nextId = 1;
  const uid = () => "f" + (nextId++);
  const clamp = (v,min,max) => Math.max(min, Math.min(max, v));
  const round1 = v => Math.round(v*10)/10;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  /**
   * Só campos "caixa" (imagem/forma/código) têm w/h/posição de canto — texto
   * é medido pelo conteúdo. Usado por toda a geometria para ramificar entre os dois.
   * @param {Field} f
   * @returns {f is ImageField|ShapeField|CodeField}
   */
  const isBox = f => f.type !== "text";

  const ctx = {
    state, uid, clamp, round1, esc, isBox,
    svg: document.getElementById("artboard"),
    canvasWrap: document.getElementById("canvasWrap"),
    propsBody: document.getElementById("propsBody"),
    totalW: () => state.plateW + MARGIN,
    totalH: () => state.plateH + MARGIN,
    getField: id => state.fields.find(f => f.id === id),
  };

  Object.assign(ctx, createToast());
  Object.assign(ctx, createDialogs());
  Object.assign(ctx, createSelection(ctx));
  Object.assign(ctx, createGeometry(ctx));
  Object.assign(ctx, createFields(ctx));
  Object.assign(ctx, createDrawers());
  Object.assign(ctx, createHistory(ctx));
  Object.assign(ctx, createInteraction(ctx));
  Object.assign(ctx, createRenderer(ctx));
  Object.assign(ctx, createLayers(ctx));
  Object.assign(ctx, createFieldOps(ctx));
  Object.assign(ctx, createPropertiesPanel(ctx));
  Object.assign(ctx, createZoom(ctx));
  Object.assign(ctx, createTheme(ctx));
  Object.assign(ctx, createTemplates(ctx));

  const { exportSVG, exportPNG } = createExporter({
    state, SVGNS, XLINK, el: ctx.el, isBox: ctx.isBox, shownText: ctx.shownText,
    codeMatrix: ctx.codeMatrix, loadTemplates: ctx.loadTemplates, showToast: ctx.showToast,
  });
  ctx.exportSVG = exportSVG;
  ctx.exportPNG = exportPNG;

  Object.assign(ctx, createToolbar(ctx));
  createKeyboard(ctx);

  // ================= INIT =================
  ctx.initTheme();
  ctx.renderTemplateList();
  ctx.renderAll();
  ctx.commit();
  requestAnimationFrame(() => ctx.fitZoom());
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => ctx.renderCanvas());
}
