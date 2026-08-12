interface RectLike {
  top: number;
  right: number;
  height: number;
  left: number;
}

const TOOLTIP_GAP = 8;

export function resolveQuestionRailTooltipPosition(
  trigger: RectLike,
  containingBlock?: Pick<RectLike, "top" | "left">,
) {
  return {
    top:
      trigger.top -
      (containingBlock?.top ?? 0) +
      trigger.height / 2,
    left:
      trigger.right -
      (containingBlock?.left ?? 0) +
      TOOLTIP_GAP,
  };
}
