export type ModelSubmenuPlacement = "left" | "right";

interface HorizontalBounds {
  left: number;
  right: number;
}

const SUBMENU_WIDTH = 238;
const SUBMENU_GAP = 7;
const EDGE_GUTTER = 8;

export function resolveModelSubmenuPlacement(
  popup: HorizontalBounds,
  viewport: HorizontalBounds,
  preferred: ModelSubmenuPlacement = "left",
): ModelSubmenuPlacement {
  const leftBoundary = Math.max(viewport.left, EDGE_GUTTER);
  const rightBoundary = Math.min(
    viewport.right,
    window.innerWidth - EDGE_GUTTER,
  );
  const requiredSpace = SUBMENU_WIDTH + SUBMENU_GAP;
  const fitsLeft = popup.left - leftBoundary >= requiredSpace;
  const fitsRight = rightBoundary - popup.right >= requiredSpace;
  if (preferred === "left" && fitsLeft) return "left";
  if (preferred === "right" && fitsRight) return "right";
  if (fitsLeft) return "left";
  if (fitsRight) return "right";
  const leftSpace = popup.left - leftBoundary;
  const rightSpace = rightBoundary - popup.right;
  return leftSpace >= rightSpace ? "left" : "right";
}
