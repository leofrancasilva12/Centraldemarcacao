import { describe, it, expect, beforeEach } from "vitest";
import { createFields } from "../js/editor/fields.js";

function makeCtx(){
  let n = 1;
  return {
    state: { plateW: 380, plateH: 380 },
    uid: () => "f" + (n++),
    round1: v => Math.round(v*10)/10,
  };
}

describe("field factories", () => {
  it("newText centers a new text field on the plate", () => {
    const { newText } = createFields(makeCtx());
    const f = newText();
    expect(f.type).toBe("text");
    expect(f.x).toBe(190);
    expect(f.y).toBe(190);
    expect(f.text).toBe("TEXTO");
  });

  it("newText applies overrides on top of the defaults", () => {
    const { newText } = createFields(makeCtx());
    const f = newText({ text:"CUSTOM" });
    expect(f.text).toBe("CUSTOM");
  });

  it("newImage preserves aspect ratio while fitting inside the plate", () => {
    const { newImage } = createFields(makeCtx());
    const f = newImage("data:image/png;base64,x", "logo.png", 400, 200);
    expect(f.w / f.h).toBeCloseTo(400/200, 1);
    expect(f.w).toBeLessThanOrEqual(380);
    expect(f.h).toBeLessThanOrEqual(380);
  });

  it("newShape gives a zero-height line by default", () => {
    const { newShape } = createFields(makeCtx());
    const line = newShape("line");
    expect(line.h).toBe(0);
    const rect = newShape("rect");
    expect(rect.h).toBeGreaterThan(0);
  });

  it("newCode defaults QR content to https:// and barcode content to a sample", () => {
    const { newCode } = createFields(makeCtx());
    expect(newCode("qr").data).toBe("https://");
    expect(newCode("code128").data).toBe("TUBO-00123");
  });

  it("assigns unique, incrementing ids across factories", () => {
    const { newText, newImage } = createFields(makeCtx());
    const a = newText();
    const b = newImage("x", "n", 1, 1);
    expect(a.id).not.toBe(b.id);
  });
});

describe("codeMatrix cache", () => {
  let codeMatrix;
  beforeEach(() => {
    ({ codeMatrix } = createFields(makeCtx()));
  });

  it("encodes QR content and caches the result on the field", () => {
    const f = { codeKind:"qr", data:"https://example.com", qrEcl:"M" };
    const first = codeMatrix(f);
    expect(first).not.toBeNull();
    expect(f._cache.key).toBe("qr|https://example.com|M");
    const second = codeMatrix(f);
    expect(second).toBe(first); // same reference: served from cache
  });

  it("invalidates the cache when the relevant content changes", () => {
    const f = { codeKind:"code39", data:"ABC", qrEcl:"M" };
    const first = codeMatrix(f);
    f.data = "XYZ";
    const second = codeMatrix(f);
    expect(second).not.toBe(first);
  });

  it("returns null for content the code kind can't represent", () => {
    const f = { codeKind:"code39", data:"lower@case", qrEcl:"M" };
    expect(codeMatrix(f)).toBeNull();
  });
});
