import { describe, it, expect } from "vitest";
import { createGeometry } from "../js/editor/geometry.js";

function makeCtx(){
  return {
    isBox: f => f.type !== "text",
    round1: v => Math.round(v*10)/10,
  };
}

describe("geometry", () => {
  it("shownText upper-cases only when the field asks for it", () => {
    const { shownText } = createGeometry(makeCtx());
    expect(shownText({ text:"abc", uppercase:false })).toBe("abc");
    expect(shownText({ text:"abc", uppercase:true })).toBe("ABC");
  });

  it("bboxOf for a box field (image/shape/code) uses x/y/w/h directly, offset by the artboard margin", () => {
    const { bboxOf } = createGeometry(makeCtx());
    const b = bboxOf({ type:"image", x:10, y:20, w:30, h:40 });
    expect(b).toEqual({ x:26, y:36, w:30, h:40 }); // MARGIN (16) + x/y
  });

  it("outerBox for a box field strips the artboard margin back out", () => {
    const { outerBox } = createGeometry(makeCtx());
    expect(outerBox({ type:"image", x:10, y:20, w:30, h:40 })).toEqual({ x:10, y:20, w:30, h:40 });
  });

  it("moveOuterTo repositions a box field by setting x/y directly", () => {
    const { moveOuterTo } = createGeometry(makeCtx());
    const f = { type:"shape", shape:"rect", x:10, y:20, w:30, h:40 };
    moveOuterTo(f, 5, 15);
    expect(f.x).toBe(5);
    expect(f.y).toBe(15);
  });

  it("moveOuterTo repositions a text field relative to its measured bounding box", () => {
    const { moveOuterTo } = createGeometry(makeCtx());
    const f = { type:"text", text:"HI", x:100, y:100, size:18, weight:"600", font:"sans-serif", spacing:0, align:"middle", uppercase:false };
    moveOuterTo(f, 0, 0);
    // Centering at (0,0) should move x/y back towards the origin, not leave them unchanged.
    expect(f.x).toBeLessThan(100);
    expect(f.y).toBeLessThan(100);
  });
});
