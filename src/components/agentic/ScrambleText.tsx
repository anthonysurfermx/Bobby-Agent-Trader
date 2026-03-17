import { useState, useEffect, useRef } from 'react';

const CHARS = '0123456789$%ABCDEF.KM';

interface ScrambleTextProps {
  text: string;
  className?: string;
  speed?: number;    // ms per iteration
  iterations?: number; // scramble cycles before settling
}

export function ScrambleText({ text, className, speed = 30, iterations = 8 }: ScrambleTextProps) {
  const [display, setDisplay] = useState(text);
  const prevText = useRef(text);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (text === prevText.current && display === text) return;
    prevText.current = text;

    let i = 0;
    const target = text;

    const tick = () => {
      i++;
      const progress = Math.min(i / iterations, 1);
      const resolved = Math.floor(progress * target.length);

      const scrambled = target
        .split('')
        .map((ch, idx) => {
          if (idx < resolved) return ch;
          if (ch === ' ') return ' ';
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join('');

      setDisplay(scrambled);

      if (i < iterations + target.length) {
        frameRef.current = window.setTimeout(tick, speed);
      } else {
        setDisplay(target);
      }
    };

    frameRef.current = window.setTimeout(tick, speed);
    return () => clearTimeout(frameRef.current);
  }, [text, speed, iterations]);

  return <span className={className}>{display}</span>;
}
