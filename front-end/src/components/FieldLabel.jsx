import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './FieldLabel.css';

const plainText = children => Children.toArray(children).map(child => isValidElement(child) ? plainText(child.props.children) : String(child)).join(' ');

export default function FieldLabel({ children, hint, hintId }) {
  const generatedId = useId();
  const descriptionId = hintId || `${generatedId}-help`;
  const rootRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const hasHint = Boolean(hint);

  useEffect(() => {
    if (!hasHint) return;
    const label = rootRef.current.closest('label');
    const scope = label?.querySelector('input, select, textarea') ? label : label?.parentElement;
    const controls = Array.from(scope?.querySelectorAll('input, select, textarea') || []).filter(control => !control.classList.contains('searchable-select-native') && control.type !== 'hidden');
    const mobile = window.matchMedia('(max-width: 767px)');
    let focused = null;

    const position = () => {
      if (!mobile.matches || !focused) { setTooltip(null); return; }
      const rect = focused.getBoundingClientRect();
      const viewportTop = window.visualViewport?.offsetTop || 0;
      const viewportBottom = viewportTop + (window.visualViewport?.height || window.innerHeight);
      const width = Math.min(340, window.innerWidth - 24);
      const above = rect.top - viewportTop > 160;
      setTooltip({
        host: focused.closest('dialog[open]') || document.body,
        above,
        style: { width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: above ? rect.top - 8 : rect.bottom + 8,
          maxHeight: Math.max(48, Math.min(160, above ? rect.top - viewportTop - 20 : viewportBottom - rect.bottom - 20)) },
      });
    };
    const focus = event => { focused = event.target; position(); };
    const blur = () => { focused = null; setTooltip(null); };
    const escape = event => { if (event.key === 'Escape') blur(); };

    controls.forEach(control => {
      const ids = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(descriptionId);
      control.setAttribute('aria-describedby', Array.from(ids).join(' '));
      control.addEventListener('focus', focus);
      control.addEventListener('blur', blur);
      control.addEventListener('keydown', escape);
    });
    const frame = requestAnimationFrame(() => { if (controls.includes(document.activeElement)) { focused = document.activeElement; position(); } });
    mobile.addEventListener('change', position);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      cancelAnimationFrame(frame);
      controls.forEach(control => {
        control.removeEventListener('focus', focus);
        control.removeEventListener('blur', blur);
        control.removeEventListener('keydown', escape);
        const remaining = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== descriptionId).join(' ');
        if (remaining) control.setAttribute('aria-describedby', remaining);
        else control.removeAttribute('aria-describedby');
      });
      mobile.removeEventListener('change', position);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [hasHint, descriptionId]);

  return <span ref={rootRef} className="field-label-line">
    <span className="field-label-caption">{children}</span>
    {hasHint && <span id={descriptionId} className="field-hint-inline" title={plainText(hint)}>{hint}</span>}
    {hasHint && tooltip && createPortal(<span role="tooltip" className="field-help-tooltip" data-placement={tooltip.above ? 'above' : 'below'} style={tooltip.style}>{hint}</span>, tooltip.host)}
  </span>;
}
