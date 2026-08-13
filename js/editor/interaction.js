// @ts-nocheck — manipulação de DOM genérica (getElementById/eventos sem narrowing); só a camada de dados é checada (ver js/editor/types.js).
import { MARGIN, SNAP_MM } from "./constants.js";

// Arrastar, redimensionar e girar campos diretamente no artboard SVG.
export function createInteraction(ctx){
  const { state, svg, isBox, clamp, round1, getField, outerBox } = ctx;

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
        if(state.selectedId !== f.id){ state.selectedId = f.id; ctx.renderAll(); }
        else ctx.renderCanvas();
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
      const maxX = isBox(f) ? Math.max(0, state.plateW-f.w) : state.plateW;
      const maxY = isBox(f) ? Math.max(0, state.plateH-f.h) : state.plateH;
      f.x = clamp(snapVal(p.x - MARGIN - dragOffset.x), 0, maxX);
      f.y = clamp(snapVal(p.y - MARGIN - dragOffset.y), 0, maxY);
      movedDuringDrag = true;
      ctx.renderCanvas(); ctx.syncPosInputs(f);
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
        ctx.renderCanvas(); ctx.syncPosInputs(f);
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
          ctx.moveOuterTo(f, resizeCtx.centerX - nb.w/2, resizeCtx.centerY - nb.h/2);
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
          ctx.moveOuterTo(f, resizeCtx.centerX - f.w/2, resizeCtx.centerY - f.h/2);
        }
        movedDuringDrag = true;
        ctx.renderCanvas(); ctx.syncPosInputs(f);
      }
    }
  });

  function endPointer(){
    if(dragging || resizing){
      ctx.renderLayers();
      if(movedDuringDrag) ctx.commit();
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
      if(state.selectedId !== null){ state.selectedId = null; ctx.renderAll(); }
    }
  });

  return { svgPoint, unrotate, attachCanvasHandlers, endPointer };
}
