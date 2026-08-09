import { useEffect, useRef } from "react";

const PARTICLE_SIZE = 10;
const PARTICLE_COUNT = 50;
const MOUSE_RADIUS = 32;
const MOUSE_FORCE = 30;
const FONT_SIZE = 80;

function getPalette() {
  const dark = document.documentElement.dataset.theme === "dark";
  const base = dark ? "#FFFFFF" : "#171717";
  return [base, "#F9731A", base];
}

export function PixelDriftHeading({ text }: { text: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (navigator.userAgent.includes("jsdom")) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let frame: number | undefined;
    let width = 0;
    let height = 0;
    let textMaxWidth = 0;
    let textMaxHeight = 0;
    let dpr = 1;
    let count = 0;
    let originX = new Float32Array(0);
    let originY = new Float32Array(0);
    let particleX = new Float32Array(0);
    let particleY = new Float32Array(0);
    let repulsionX = new Float32Array(0);
    let repulsionY = new Float32Array(0);
    let colorIndexes = new Uint8Array(0);
    let previousMouseX = -99999;
    let previousMouseY = -99999;
    let smoothedMouseX = -99999;
    let smoothedMouseY = -99999;
    let mouseSpeed = 0;
    const pointer = { x: -99999, y: -99999, active: false };

    const fitFontSize = (
      measureContext: CanvasRenderingContext2D,
      maxWidth: number,
      maxHeight: number,
    ) => {
      let low = 8;
      let high = FONT_SIZE;
      let best = low;

      for (let iteration = 0; iteration < 12; iteration += 1) {
        const size = (low + high) / 2;
        measureContext.font = `700 ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const metrics = measureContext.measureText(text);
        const measuredHeight =
          (metrics.actualBoundingBoxAscent || size * 0.8) +
          (metrics.actualBoundingBoxDescent || size * 0.2);
        if (metrics.width <= maxWidth && measuredHeight <= maxHeight) {
          best = size;
          low = size;
        } else {
          high = size;
        }
      }

      return Math.max(8, Math.floor(best));
    };

    const sampleText = () => {
      if (width <= 0 || height <= 0) return;

      const offscreen = document.createElement("canvas");
      offscreen.width = Math.max(1, Math.floor(width * dpr));
      offscreen.height = Math.max(1, Math.floor(height * dpr));
      const offscreenContext = offscreen.getContext("2d", {
        willReadFrequently: true,
      });
      if (!offscreenContext) return;
      offscreenContext.scale(dpr, dpr);

      const effectiveFontSize = fitFontSize(
        offscreenContext,
        textMaxWidth,
        textMaxHeight,
      );
      const font = `700 ${effectiveFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

      offscreenContext.clearRect(0, 0, width, height);
      offscreenContext.fillStyle = "#fff";
      offscreenContext.font = font;
      offscreenContext.textAlign = "center";
      offscreenContext.textBaseline = "middle";
      offscreenContext.fillText(text, width / 2, height / 2);

      const image = offscreenContext.getImageData(
        0,
        0,
        offscreen.width,
        offscreen.height,
      );
      const stride = Math.max(
        2,
        Math.round(150 / Math.max(1, Math.min(50, PARTICLE_COUNT))),
      );
      let candidates = 0;

      for (let y = 0; y < height; y += stride) {
        for (let x = 0; x < width; x += stride) {
          const index =
            (Math.floor(y * dpr) * image.width + Math.floor(x * dpr)) * 4 + 3;
          if ((image.data[index] ?? 0) > 128) candidates += 1;
        }
      }

      const downsample =
        candidates > 30000 ? Math.ceil(candidates / 30000) : 1;
      const allocation = Math.min(candidates, 30000);
      const nextOriginX = new Float32Array(allocation);
      const nextOriginY = new Float32Array(allocation);
      const nextColorIndexes = new Uint8Array(allocation);
      let particleIndex = 0;
      let seen = 0;

      for (let y = 0; y < height && particleIndex < allocation; y += stride) {
        for (let x = 0; x < width && particleIndex < allocation; x += stride) {
          const index =
            (Math.floor(y * dpr) * image.width + Math.floor(x * dpr)) * 4 + 3;
          if ((image.data[index] ?? 0) <= 128) continue;
          if (seen % downsample === 0) {
            nextOriginX[particleIndex] = x;
            nextOriginY[particleIndex] = y;
            nextColorIndexes[particleIndex] = Math.floor(Math.random() * 3);
            particleIndex += 1;
          }
          seen += 1;
        }
      }

      count = particleIndex;
      originX = nextOriginX;
      originY = nextOriginY;
      particleX = nextOriginX.slice();
      particleY = nextOriginY.slice();
      repulsionX = new Float32Array(allocation);
      repulsionY = new Float32Array(allocation);
      colorIndexes = nextColorIndexes;
    };

    const resize = () => {
      const containerRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const nextWidth = Math.floor(canvasRect.width);
      const nextHeight = Math.floor(canvasRect.height);
      if (nextWidth <= 0 || nextHeight <= 0) return;

      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      width = nextWidth;
      height = nextHeight;
      textMaxWidth = containerRect.width * 0.92;
      textMaxHeight = containerRect.height * 0.92;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      sampleText();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? width / rect.width : 1;
      const scaleY = rect.height > 0 ? height / rect.height : 1;
      const mouseX = (event.clientX - rect.left) * scaleX;
      const mouseY = (event.clientY - rect.top) * scaleY;

      if (previousMouseX > -9000) {
        mouseSpeed = Math.hypot(
          mouseX - previousMouseX,
          mouseY - previousMouseY,
        );
      }
      previousMouseX = mouseX;
      previousMouseY = mouseY;
      pointer.x = mouseX;
      pointer.y = mouseY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.x = -99999;
      pointer.y = -99999;
      pointer.active = false;
      previousMouseX = -99999;
      previousMouseY = -99999;
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const hitSpeed = mouseSpeed;
      mouseSpeed *= 0.88;

      if (pointer.active) {
        const smoothing = Math.max(0.08, 0.3 - hitSpeed * 0.006);
        if (smoothedMouseX < -9000) {
          smoothedMouseX = pointer.x;
          smoothedMouseY = pointer.y;
        } else {
          smoothedMouseX += (pointer.x - smoothedMouseX) * smoothing;
          smoothedMouseY += (pointer.y - smoothedMouseY) * smoothing;
        }
      } else {
        smoothedMouseX = -99999;
        smoothedMouseY = -99999;
      }

      const radiusSquared = MOUSE_RADIUS * MOUSE_RADIUS;
      const buckets: number[][] = [[], [], []];

      for (let index = 0; index < count; index += 1) {
        const homeX = originX[index] ?? 0;
        const homeY = originY[index] ?? 0;
        let offsetX = repulsionX[index] ?? 0;
        let offsetY = repulsionY[index] ?? 0;
        let inZone = false;
        if (pointer.active) {
          const deltaX = homeX - smoothedMouseX;
          const deltaY = homeY - smoothedMouseY;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
          if (distanceSquared > 0 && distanceSquared < radiusSquared) {
            const distance = Math.sqrt(distanceSquared);
            const normalX = deltaX / distance;
            const normalY = deltaY / distance;
            const falloff = 1 - distance / MOUSE_RADIUS;
            const push = falloff * hitSpeed * MOUSE_FORCE * 0.05;
            offsetX += normalX * push;
            offsetY += normalY * push;
            offsetX +=
              (normalX * (MOUSE_RADIUS - distance) - offsetX) * 0.06;
            offsetY +=
              (normalY * (MOUSE_RADIUS - distance) - offsetY) * 0.06;
            inZone = true;
          }
        }
        if (!inZone) {
          offsetX *= 0.97;
          offsetY *= 0.97;
        }
        repulsionX[index] = offsetX;
        repulsionY[index] = offsetY;
        particleX[index] = homeX + offsetX;
        particleY[index] = homeY + offsetY;
        const colorIndex = colorIndexes[index] ?? 0;
        buckets[colorIndex]?.push(index);
      }

      const palette = getPalette();
      const drawSize = Math.max(1, PARTICLE_SIZE / 4);
      const half = drawSize / 2;
      buckets.forEach((bucket, paletteIndex) => {
        context.fillStyle = palette[paletteIndex] ?? "#FFFFFF";
        bucket.forEach((index) => {
          context.fillRect(
            (particleX[index] ?? 0) - half,
            (particleY[index] ?? 0) - half,
            drawSize,
            drawSize,
          );
        });
      });

      frame = requestAnimationFrame(draw);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointercancel", handlePointerLeave);
    frame = requestAnimationFrame(draw);

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointercancel", handlePointerLeave);
    };
  }, [text]);

  return (
    <span className="pixel-drift-heading" ref={containerRef}>
      <canvas
        className="pixel-drift-heading-canvas"
        ref={canvasRef}
        aria-hidden="true"
      />
    </span>
  );
}
