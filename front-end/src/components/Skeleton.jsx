import { useMemo } from 'react';

export default function Skeleton({ lines = 3, height = 16, width = '100%', circle = false, className = '' }) {
  const lineHeights = useMemo(() => Array.from({ length: lines }, () => height), [lines, height]);
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    >
      {lineHeights.map((h, i) => (
        <div
          key={i}
          style={{
            height: h,
            width: i === lineHeights.length - 1 ? '60%' : '100%',
            borderRadius: circle ? '50%' : 4,
            background: 'var(--border-color)',
            minHeight: h,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function SkeletonCard({ lines = 4 }) {
  return <Skeleton lines={lines} />;
}
