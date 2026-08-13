import { describe, it, expect, beforeEach } from "vitest";
import { createSelection } from "../js/editor/selection.js";

function makeCtx(){
  return {
    state: {
      fields: [{id:"f1"}, {id:"f2"}, {id:"f3"}],
      selectedIds: [],
    },
  };
}

describe("selection", () => {
  let ctx, sel;
  beforeEach(() => {
    ctx = makeCtx();
    sel = createSelection(ctx);
  });

  it("starts with nothing selected", () => {
    expect(sel.getSelectedFields()).toEqual([]);
    expect(sel.isSelected("f1")).toBe(false);
  });

  it("selectOnly replaces the whole selection with a single id", () => {
    sel.selectMany(["f1", "f2"]);
    sel.selectOnly("f3");
    expect(ctx.state.selectedIds).toEqual(["f3"]);
  });

  it("selectOnly(null) clears the selection", () => {
    sel.selectOnly("f1");
    sel.selectOnly(null);
    expect(ctx.state.selectedIds).toEqual([]);
  });

  it("toggleSelect adds and then removes an id", () => {
    sel.toggleSelect("f1");
    expect(sel.isSelected("f1")).toBe(true);
    sel.toggleSelect("f1");
    expect(sel.isSelected("f1")).toBe(false);
  });

  it("toggleSelect accumulates several ids", () => {
    sel.toggleSelect("f1");
    sel.toggleSelect("f2");
    expect(ctx.state.selectedIds).toEqual(["f1", "f2"]);
  });

  it("getSelectedFields returns the actual field objects, not just ids", () => {
    sel.selectMany(["f2", "f3"]);
    expect(sel.getSelectedFields().map(f => f.id)).toEqual(["f2", "f3"]);
  });

  it("selectAll selects every field currently on the plate", () => {
    sel.selectAll();
    expect(ctx.state.selectedIds).toEqual(["f1", "f2", "f3"]);
  });

  it("clearSelection empties the selection", () => {
    sel.selectAll();
    sel.clearSelection();
    expect(ctx.state.selectedIds).toEqual([]);
  });
});
