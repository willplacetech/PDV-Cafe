export function installNumberInputWheelGuard(documentRef) {
  const handleWheel = (event) => {
    const target = event.target;
    if (target?.type === 'number' && target === documentRef.activeElement) {
      target.blur();
    }
  };

  documentRef.addEventListener('wheel', handleWheel, { capture: true, passive: true });
  return () => documentRef.removeEventListener('wheel', handleWheel, true);
}
