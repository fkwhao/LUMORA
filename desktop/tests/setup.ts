import "@testing-library/jest-dom/vitest";

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver;

if (
  typeof globalThis.PointerEvent === "undefined" &&
  typeof globalThis.MouseEvent !== "undefined"
) {
  globalThis.PointerEvent = MouseEvent as typeof PointerEvent;
}

if (typeof HTMLElement !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(): void {},
  });
}
