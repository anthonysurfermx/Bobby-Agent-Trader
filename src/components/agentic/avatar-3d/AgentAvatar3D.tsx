import { useRef, useCallback } from 'react';
import { getAvatarFallbackColor } from './AvatarShapeGenerator';
import { cn } from '@/lib/utils';

interface AgentAvatar3DProps {
  slug: string;
  name: string;
  size?: number;
  className?: string;
  staticImage?: string;
  onHoverAttach?: (container: HTMLElement, slug: string) => void;
  onHoverDetach?: () => void;
}

export function AgentAvatar3D({
  slug,
  name,
  size = 36,
  className,
  staticImage,
  onHoverAttach,
  onHoverDetach,
}: AgentAvatar3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (containerRef.current && onHoverAttach) {
      onHoverAttach(containerRef.current, slug);
    }
  }, [slug, onHoverAttach]);

  const handleMouseLeave = useCallback(() => {
    onHoverDetach?.();
  }, [onHoverDetach]);

  const fallbackColor = getAvatarFallbackColor(slug);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative shrink-0 rounded-lg overflow-hidden cursor-pointer',
        'transition-shadow duration-200',
        'hover:shadow-[0_0_14px_rgba(99,102,241,0.4)]',
        className
      )}
      style={{ width: size, height: size }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {staticImage ? (
        <img
          src={staticImage}
          alt={`${name} avatar`}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-white font-bold text-xs"
          style={{ backgroundColor: fallbackColor }}
        >
          {initial}
        </div>
      )}
    </div>
  );
}
