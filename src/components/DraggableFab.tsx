import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface FabPosition {
  /** Viewport-space x (px) of the FAB centre. */
  x: number;
  /** Viewport-space y (px) of the FAB centre. */
  y: number;
}

interface DraggableFabProps {
  /** Default position (centre of the FAB) – used the very first time it appears. */
  defaultPosition: FabPosition;
  /** Storage key so each FAB remembers its own position. */
  storageKey: string;
  /** Bottom margin (px) the FAB must keep away from. Useful for tab bars. */
  bottomMargin?: number;
  /** Top margin (px) the FAB must keep away from (header / search bar). */
  topMargin?: number;
  /** The visual content of the floating button. */
  children: React.ReactNode;
  /** Accessible label & title. */
  ariaLabel: string;
  title?: string;
  className?: string;
  /** Optional click handler – receives the mouse / touch event. */
  onClick?: () => void;
}

/**
 * A small floating action button that the user can drag to any spot on
 * the screen. The position is persisted in localStorage so it stays where
 * the user dropped it on the next reload.
 */
export const DraggableFab: React.FC<DraggableFabProps> = ({
  defaultPosition,
  storageKey,
  bottomMargin = 0,
  topMargin = 0,
  children,
  ariaLabel,
  title,
  className = '',
  onClick,
}) => {
  const [pos, setPos] = useState<FabPosition>(() => {
    if (typeof window === 'undefined') return defaultPosition;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as FabPosition;
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
      }
    } catch {
      /* ignore */
    }
    return defaultPosition;
  });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Keep within viewport on resize so the button never gets lost off-screen
  useEffect(() => {
    const handleResize = () => {
      setPos((current) => clampToViewport(current, defaultPosition, bottomMargin, topMargin));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    (next: FabPosition) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    buttonRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      pointerId: e.pointerId,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) < 4) return; // treat as a tap
    dragRef.current.moved = true;
    const next = clampToViewport(
      {
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      },
      defaultPosition,
      bottomMargin,
      topMargin
    );
    setPos(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const wasMoved = dragRef.current.moved;
    dragRef.current = null;
    buttonRef.current?.releasePointerCapture(e.pointerId);
    if (wasMoved) {
      persist(pos);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={ariaLabel}
      title={title || ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(e) => {
        // Prevent synthetic click after drag (browsers fire click after pointerup)
        e.preventDefault();
      }}
      className={`fixed z-40 touch-none select-none cursor-grab active:cursor-grabbing ${className}`}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {children}
    </button>
  );
};

function clampToViewport(
  pos: FabPosition,
  defaultPosition: FabPosition,
  bottomMargin: number,
  topMargin: number
): FabPosition {
  if (typeof window === 'undefined') return pos;
  const size = 56; // FAB diameter in px
  const half = size / 2;
  const minX = half;
  const maxX = window.innerWidth - half;
  const minY = topMargin + half;
  const maxY = window.innerHeight - bottomMargin - half;
  const safeMaxX = Math.max(minX, maxX);
  const safeMaxY = Math.max(minY, maxY);
  if (
    Number.isNaN(pos.x) ||
    Number.isNaN(pos.y) ||
    pos.x < 0 ||
    pos.x > safeMaxX + 100 ||
    pos.y < 0 ||
    pos.y > safeMaxY + 100
  ) {
    return defaultPosition;
  }
  return {
    x: Math.min(Math.max(pos.x, minX), safeMaxX),
    y: Math.min(Math.max(pos.y, minY), safeMaxY),
  };
}
