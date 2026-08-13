import { describe, it, expect } from "vitest";
import { BARCODE } from "../js/barcode.js";

describe("BARCODE.code128B", () => {
  it("encodes printable ASCII into a bar/space bit string", () => {
    const bits = BARCODE.code128B("TUBO-00123");
    expect(bits).toMatch(/^[01]+$/);
    expect(bits.length).toBeGreaterThan(0);
  });

  it("rejects characters outside subset B (control chars, high bytes)", () => {
    expect(BARCODE.code128B("tab\ttab")).toBeNull();
    expect(BARCODE.code128B("café")).toBeNull();
  });

  it("produces different bit strings for different content", () => {
    const a = BARCODE.code128B("AAA111");
    const b = BARCODE.code128B("ZZZ999");
    expect(a).not.toBe(b);
  });
});

describe("BARCODE.code39", () => {
  it("encodes supported characters into a bar/space bit string", () => {
    const bits = BARCODE.code39("ABC-123");
    expect(bits).toMatch(/^[01]+$/);
    expect(bits.length).toBeGreaterThan(0);
  });

  it("is case-insensitive (lowercase is upper-cased before encoding)", () => {
    expect(BARCODE.code39("abc")).toBe(BARCODE.code39("ABC"));
  });

  it("rejects characters outside the supported charset", () => {
    expect(BARCODE.code39("lower@case!")).toBeNull();
  });
});
