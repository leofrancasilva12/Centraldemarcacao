// @ts-nocheck — manipulação de DOM genérica (getElementById/eventos sem narrowing); só a camada de dados é checada (ver js/editor/types.js).
import { MARGIN, SNAP_MM } from "./constants.js";

// Arrastar, redimensionar e girar campos diretamente no artboard SVG —
// incluindo seleção múltipla (shift-clique, laço de seleção) e transformação
// do grupo inteiro (mover, aumentar/diminuir), ao estilo Canva/Figma.
export function createInteraction(ctx){
  const { state, svg, isBox, clamp, round1, getField, outerBox } = ctx;

  let dragging = null, resizing = null, resizeCtx = null, movedDuringDrag = false;
  let dragOffset = null, dragFieldsStart = null, pendingNarrowId = null;
  let resizingGroup = false, groupResizeCtx = null;
  let marquee = null; // {startX, startY, additive, baseSelection, moved}
  const snapOn = () => document.getElementById("chkSnap").checked;
  const snapVal = v => snapOn() ? Math.round(v/SNAP_MM)*SNAP_MM : Math.round(v*2)/2;
  const rectsIntersect = (a, b) =>
    a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;

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

  // O campo "agarrado" pelo cursor é o que efetivamente encaixa na grade
  // (igual ao arraste de um único campo); os demais selecionados seguem
  // pelo mesmo delta em pixels, preservando a posição relativa entre eles.
  function beginGroupDrag(evt, grabbedField){
    const p = svgPoint(evt);
    dragOffset = {x: p.x - MARGIN - grabbedField.x, y: p.y - MARGIN - grabbedField.y};
    dragFieldsStart = ctx.getSelectedFields().map(f => ({id:f.id, x:f.x, y:f.y}));
    dragging = grabbedField.id; movedDuringDrag = false;
    try{ svg.setPointerCapture(evt.pointerId); }catch(_){}
  }

  function attachCanvasHandlers(){
    svg.querySelectorAll('[data-id]:not([data-role])').forEach(node => {
      node.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation();
        const f = getField(node.dataset.id);
        if(!f) return;
        const modifier = e.shiftKey || e.ctrlKey || e.metaKey;
        pendingNarrowId = null;
        if(modifier){
          ctx.toggleSelect(f.id);
          ctx.renderAll();
          if(!ctx.isSelected(f.id)) return; // just removed from selection — nothing to drag
        } else if(!ctx.isSelected(f.id)){
          ctx.selectOnly(f.id);
          ctx.renderAll();
        } else {
          // Already part of the current selection (maybe several items): keep it
          // as-is so the whole group can be dragged; narrow to just this one on
          // pointerup if the user didn't actually drag anything.
          pendingNarrowId = f.id;
        }
        beginGroupDrag(e, f);
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
        if(!ctx.isSelected(f.id)) ctx.selectOnly(f.id);
        try{ svg.setPointerCapture(e.pointerId); }catch(_){}
      });
    });

    svg.querySelectorAll('[data-role="group-resize-corner"]').forEach(node => {
      node.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation();
        const selected = ctx.getSelectedFields();
        if(selected.length < 2) return;
        const gb = ctx.groupOuterBox(selected);
        groupResizeCtx = {
          centerX: gb.x + gb.w/2,
          centerY: gb.y + gb.h/2,
          halfW: Math.max(1, gb.w/2),
          halfH: Math.max(1, gb.h/2),
          fields: selected.map(f => ({
            field:f, startX:f.x, startY:f.y, startW:f.w, startH:f.h,
            startSize: f.type === "text" ? f.size : null,
          })),
        };
        resizingGroup = true; movedDuringDrag = false;
        try{ svg.setPointerCapture(e.pointerId); }catch(_){}
      });
    });
  }

  svg.addEventListener("pointermove", e => {
    if(dragging){
      const grabbed = getField(dragging);
      if(!grabbed){ dragging = null; return; }
      const p = svgPoint(e);
      const grabbedStart = dragFieldsStart.find(s => s.id === dragging);
      const maxGX = isBox(grabbed) ? Math.max(0, state.plateW-grabbed.w) : state.plateW;
      const maxGY = isBox(grabbed) ? Math.max(0, state.plateH-grabbed.h) : state.plateH;
      // O campo agarrado encaixa na grade normalmente; os demais seguem pelo
      // mesmo deslocamento em pixels, sem encaixe próprio, para não deformar
      // as posições relativas dentro do grupo.
      const newGrabbedX = clamp(snapVal(p.x - MARGIN - dragOffset.x), 0, maxGX);
      const newGrabbedY = clamp(snapVal(p.y - MARGIN - dragOffset.y), 0, maxGY);
      const dx = newGrabbedX - grabbedStart.x, dy = newGrabbedY - grabbedStart.y;
      dragFieldsStart.forEach(start => {
        const f = getField(start.id);
        if(!f) return;
        const maxX = isBox(f) ? Math.max(0, state.plateW-f.w) : state.plateW;
        const maxY = isBox(f) ? Math.max(0, state.plateH-f.h) : state.plateH;
        f.x = clamp(round1(start.x + dx), 0, maxX);
        f.y = clamp(round1(start.y + dy), 0, maxY);
      });
      if(Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) movedDuringDrag = true;
      ctx.renderCanvas();
      ctx.syncPosInputs(grabbed);
      return;
    }
    if(resizingGroup && groupResizeCtx){
      const p = svgPoint(e);
      const localX = p.x-MARGIN, localY = p.y-MARGIN;
      const scaleX = Math.max(0.1, Math.abs(localX - groupResizeCtx.centerX) / groupResizeCtx.halfW);
      const scaleY = Math.max(0.1, Math.abs(localY - groupResizeCtx.centerY) / groupResizeCtx.halfH);
      const scale = Math.max(scaleX, scaleY); // grupo sempre escala proporcionalmente
      const {centerX, centerY} = groupResizeCtx;
      groupResizeCtx.fields.forEach(({field:f, startX, startY, startW, startH, startSize}) => {
        if(f.type === "text"){
          f.size = round1(clamp(startSize*scale, 3, 180));
          f.x = round1(clamp(centerX + (startX-centerX)*scale, 0, state.plateW));
          f.y = round1(clamp(centerY + (startY-centerY)*scale, 0, state.plateH));
        } else {
          const minH = f.type === "shape" && f.shape === "line" ? 0 : 1;
          const newW = clamp(round1(startW*scale), 1, 2000);
          const newH = clamp(round1(startH*scale), minH, 2000);
          const cx = centerX + (startX + startW/2 - centerX)*scale;
          const cy = centerY + (startY + startH/2 - centerY)*scale;
          f.w = newW; f.h = newH;
          f.x = round1(clamp(cx - newW/2, 0, Math.max(0, state.plateW-newW)));
          f.y = round1(clamp(cy - newH/2, 0, Math.max(0, state.plateH-newH)));
        }
      });
      movedDuringDrag = true;
      ctx.renderCanvas();
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
      return;
    }
    if(marquee){
      const p = svgPoint(e);
      const x1 = Math.min(marquee.startX, p.x-MARGIN), x2 = Math.max(marquee.startX, p.x-MARGIN);
      const y1 = Math.min(marquee.startY, p.y-MARGIN), y2 = Math.max(marquee.startY, p.y-MARGIN);
      if(Math.abs((p.x-MARGIN)-marquee.startX) > 0.5 || Math.abs((p.y-MARGIN)-marquee.startY) > 0.5) marquee.moved = true;
      ctx.marqueeRect = {x:x1, y:y1, w:x2-x1, h:y2-y1};
      const hits = state.fields.filter(f => rectsIntersect(ctx.marqueeRect, outerBox(f))).map(f => f.id);
      ctx.selectMany(marquee.additive ? Array.from(new Set([...marquee.baseSelection, ...hits])) : hits);
      ctx.renderCanvas(); ctx.renderLayers();
    }
  });

  function endPointer(){
    if(dragging || resizing || resizingGroup){
      ctx.renderLayers();
      if(movedDuringDrag) ctx.commit();
      else if(dragging && pendingNarrowId){ ctx.selectOnly(pendingNarrowId); ctx.renderAll(); }
    }
    if(marquee){
      ctx.marqueeRect = null;
      if(!marquee.moved && !marquee.additive){ ctx.clearSelection(); ctx.renderAll(); }
      else ctx.renderCanvas();
      marquee = null;
    }
    dragging = null; resizing = null; resizeCtx = null;
    resizingGroup = false; groupResizeCtx = null;
    dragOffset = null; dragFieldsStart = null; pendingNarrowId = null;
    movedDuringDrag = false;
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  window.addEventListener("pointerup", endPointer);

  svg.addEventListener("pointerdown", e => {
    const t = e.target;
    if(t === svg || t.classList.contains("plate-rect") || t.classList.contains("grid-line") ||
       t.classList.contains("ruler-tick") || t.classList.contains("ruler-text")){
      const p = svgPoint(e);
      marquee = {
        startX: p.x-MARGIN, startY: p.y-MARGIN,
        additive: e.shiftKey || e.ctrlKey || e.metaKey,
        baseSelection: state.selectedIds.slice(),
        moved: false,
      };
      try{ svg.setPointerCapture(e.pointerId); }catch(_){}
    }
  });

  return { svgPoint, unrotate, attachCanvasHandlers, endPointer };
}
