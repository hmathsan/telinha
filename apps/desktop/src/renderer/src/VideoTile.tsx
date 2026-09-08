import { useEffect, useRef } from "react";

export interface VideoTileProps {
  readonly stream: MediaStream;
  readonly label: string;
  /** "stage" (padrão) ocupa a largura do Palco; "thumbnail" é a miniatura clicável da faixa. */
  readonly variant?: "stage" | "thumbnail";
  readonly onClick?: () => void;
  readonly onDoubleClick?: () => void;
}

export function VideoTile({ stream, label, variant = "stage", onClick, onDoubleClick }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const isThumbnail = variant === "thumbnail";

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        position: "relative",
        width: isThumbnail ? 160 : "100%",
        flex: isThumbnail ? "0 0 auto" : undefined,
        cursor: onClick ? "pointer" : onDoubleClick ? "zoom-in" : undefined,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", background: "#000", borderRadius: 8 }}
      />
      <span
        style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: isThumbnail ? 11 : 12,
        }}
      >
        {label}
      </span>
    </div>
  );
}
