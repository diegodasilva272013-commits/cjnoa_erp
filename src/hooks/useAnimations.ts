import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Returns a ref and a boolean `visible` that turns true once the element
 * scrolls into the viewport (IntersectionObserver, fires once).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(threshold = 0.1) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/**
 * Animates a number from 0 to `target` over `duration` ms using requestAnimationFrame.
 */
export function useCountUp(target: number, duration = 800, start = true) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (!start) return;
    const from = prev.current;
    const diff = target - from;
    if (diff === 0) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(from + diff * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else prev.current = target;
    }

    requestAnimationFrame(tick);
  }, [target, duration, start]);

  return value;
}

/**
 * Returns a stagger-delay style for the nth child in a list.
 */
export function staggerDelay(index: number, base = 60): React.CSSProperties {
  return { animationDelay: `${index * base}ms` };
}
