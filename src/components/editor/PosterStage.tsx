'use client';

import { useEffect, useMemo, useState } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import type { LayerId, PosterDraft } from '@/domain/project';
import { moveLayer } from '@/domain/editor';

type PosterStageProps = {
  draft: PosterDraft;
  selectedLayer: LayerId | null;
  onSelectLayer: (layerId: LayerId | null) => void;
  onChange: (draft: PosterDraft) => void;
  stageRef?: React.RefObject<KonvaStage | null>;
};

type LoadedImage = globalThis.HTMLImageElement;

function useLoadedImage(dataUrl: string): LoadedImage | undefined {
  const [image, setImage] = useState<LoadedImage>();

  useEffect(() => {
    if (!dataUrl || typeof window === 'undefined') {
      setImage(undefined);
      return;
    }
    const next = new window.Image();
    next.onload = () => setImage(next);
    next.onerror = () => setImage(undefined);
    next.src = dataUrl;
    return () => {
      next.onload = null;
      next.onerror = null;
    };
  }, [dataUrl]);

  return image;
}

function containRect(width: number, height: number) {
  if (!width || !height) return { x: 0, y: 0, width: 360, height: 480 };
  const scale = Math.min(360 / width, 480 / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;
  return {
    x: (360 - fittedWidth) / 2,
    y: (480 - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight
  };
}

export function PosterStage({ draft, selectedLayer, onSelectLayer, onChange, stageRef }: PosterStageProps) {
  const image = useLoadedImage(draft.image.dataUrl);
  const imageRect = useMemo(
    () => containRect(image?.naturalWidth ?? draft.image.width, image?.naturalHeight ?? draft.image.height),
    [draft.image.height, draft.image.width, image]
  );

  const handleDragEnd = (layerId: LayerId, x: number, y: number) => {
    const boundedX = Math.max(8, Math.min(352, x));
    const boundedY = Math.max(8, Math.min(472, y));
    onChange(moveLayer(draft, layerId, boundedX, boundedY));
  };

  return (
    <div className="poster-stage-shell" aria-label="海报画布">
      <Stage ref={stageRef} width={360} height={480} className="poster-stage">
        <Layer>
          <Rect width={360} height={480} fill={draft.background} onClick={() => onSelectLayer(null)} />
          {image && (
            <KonvaImage
              image={image}
              {...imageRect}
              listening={false}
            />
          )}
          {Object.values(draft.layers.stickers).map((sticker) => (
            <Text
              key={sticker.id}
              x={sticker.x}
              y={sticker.y}
              text={sticker.emoji}
              fontSize={28 * sticker.scale}
              draggable
              onClick={() => onSelectLayer(sticker.id)}
              onTap={() => onSelectLayer(sticker.id)}
              onDragEnd={(event) => handleDragEnd(sticker.id, event.target.x(), event.target.y())}
            />
          ))}
          {(['title', 'description', 'tag'] as const).map((layerId) => {
            const layer = draft.layers[layerId];
            if (!layer) return null;
            return (
              <Text
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                text={layer.text}
                fontFamily={layer.fontFamily}
                fontSize={layer.fontSize}
                fill={layer.fill}
                align={layer.align}
                lineHeight={1.35}
                draggable
                onClick={() => onSelectLayer(layer.id)}
                onTap={() => onSelectLayer(layer.id)}
                onDragEnd={(event) => handleDragEnd(layer.id, event.target.x(), event.target.y())}
              />
            );
          })}
          {selectedLayer && <Rect name="selection-frame" x={4} y={4} width={352} height={472} stroke="#D87568" dash={[5, 5]} listening={false} />}
        </Layer>
      </Stage>
    </div>
  );
}
