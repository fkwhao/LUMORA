import type { CSSProperties } from "react";

const GRID_SIZE = 3;
const PITCH = 6;
const MIDPOINT = (GRID_SIZE - 1) / 2;

export function ProcessingLattice() {
  const cells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const delay = ((x + y) / (2 * (GRID_SIZE - 1))) * 1500;
      const style = {
        left: x * PITCH,
        top: y * PITCH,
        animationDelay: `${delay}ms`,
      } as CSSProperties;

      cells.push(
        <span
          className="lumora-processing-lattice-cell"
          data-mid={x === MIDPOINT && y === MIDPOINT ? "" : undefined}
          key={`${x},${y}`}
          style={style}
        />,
      );
    }
  }

  return (
    <span className="lumora-processing-lattice" aria-hidden="true">
      <span className="lumora-processing-lattice-grid">{cells}</span>
    </span>
  );
}
