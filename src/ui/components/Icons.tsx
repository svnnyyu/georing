// Small pixel-grid icons (each "pixel" is a 1×1 rect on a 9×9 grid), drawn in currentColor.

type Px = [number, number, number?, number?]; // x, y, width, height (in grid cells)

function PixelIcon({ px, label }: { px: Px[]; label?: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 9 9"
      width="18"
      height="18"
      shapeRendering="crispEdges"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {px.map(([x, y, w = 1, h = 1], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" />
      ))}
    </svg>
  );
}

export const MenuIcon = () => <PixelIcon px={[[1, 2, 7], [1, 4, 7], [1, 6, 7]]} />;
export const CloseIcon = () => (
  <PixelIcon px={[[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [7, 1], [6, 2], [5, 3], [3, 5], [2, 6], [1, 7]]} />
);
export const PlayIcon = () => <PixelIcon px={[[2, 1, 1, 7], [3, 2, 1, 5], [4, 3, 1, 3], [5, 4]]} />;
export const GearIcon = () => (
  <PixelIcon px={[[3, 0, 3], [1, 1, 1], [7, 1, 1], [1, 2, 7, 5], [0, 3, 1, 3], [8, 3, 1, 3], [3, 7, 3], [1, 7], [7, 7]]} />
);
export const ClockIcon = () => (
  <PixelIcon px={[[2, 0, 5], [1, 1], [7, 1], [0, 2, 1, 5], [8, 2, 1, 5], [1, 7], [7, 7], [2, 8, 5], [4, 2, 1, 3], [5, 4, 2]]} />
);
export const InfoIcon = () => <PixelIcon px={[[4, 1], [3, 3, 2], [4, 4, 1, 3], [3, 7, 3]]} />;
export const BulbIcon = () => (
  <PixelIcon px={[[3, 0, 3], [2, 1], [6, 1], [1, 2, 1, 3], [7, 2, 1, 3], [2, 5], [6, 5], [3, 6, 3], [3, 8, 3], [4, 3, 1, 3]]} />
);
