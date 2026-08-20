import { vscForeground } from "..";

interface ContinueLogoProps {
  height?: number;
  width?: number;
}

export default function ContinueLogo({
  height = 987,
  width = 299,
}: ContinueLogoProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 987 299"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="493"
        y="175"
        fontFamily="sans-serif"
        fontSize="140"
        fontWeight="bold"
        textAnchor="middle"
        fill={vscForeground}
      >
        OGContinue
      </text>
    </svg>
  );
}
