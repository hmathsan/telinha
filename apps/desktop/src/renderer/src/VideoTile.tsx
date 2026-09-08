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
  const frameClass = `video-frame ${isThumbnail ? "video-frame-thumb" : "w-full"}`;
  const content = (
    <>
      <video ref={videoRef} autoPlay playsInline muted />
      <span className="video-frame-label">{label}</span>
    </>
  );

  // Miniatura é um controle: `<button>` para receber foco de teclado e o anel de acento do
  // Nocturne, como qualquer outro elemento interativo (spec 0007, "Regras").
  if (onClick) {
    return (
      <button type="button" className={`${frameClass} cursor-pointer rounded-md p-0 text-left`} onClick={onClick} onDoubleClick={onDoubleClick}>
        {content}
      </button>
    );
  }

  return (
    <div className={frameClass} onDoubleClick={onDoubleClick}>
      {content}
    </div>
  );
}
