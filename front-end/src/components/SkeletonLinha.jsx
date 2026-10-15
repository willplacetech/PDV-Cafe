import Skeleton from './Skeleton.jsx';

export default function SkeletonLinha({ lines = 1, height = 16, width = '100%', circle = false, className = '' }) {
  return <Skeleton lines={lines} height={height} width={width} circle={circle} className={className} />;
}
