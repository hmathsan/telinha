import { useEffect, useRef } from "react";

export interface VideoTileProps {
  readonly stream: MediaStream;
  readonly label: string;
}

export function VideoTile({ stream, label }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div style={{ position: "relative" }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", background: "#000", borderRadius: 8 }} />
      <span style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
        {label}
      </span>
    </div>
  );
}
