import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { filterOptions, selectOptions } from '../utils/selectOptions.js';
import './SearchableSelect.css';

// Keep a native select for form data, validation and the existing change handlers.
export default function SearchableSelect({ children, ref, onChange, onInvalid, className = '', style, id, disabled, value, defaultValue, ...props }) {
  const inputRef = useRef(null);
  const selectRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({});
  const [localValue, setLocalValue] = useState(defaultValue);
  const [invalid, setInvalid] = useState(false);
  const options = selectOptions(children);
  const selectedValue = value ?? localValue ?? options.find(option => !option.disabled)?.value ?? '';
  const selected = options.find(option => option.value === String(selectedValue));
  const matches = filterOptions(options, query);
  const expanded = open && !disabled;
  const showInvalid = !disabled && (props['aria-invalid'] === true || props['aria-invalid'] === 'true' || (invalid && props.required && !selectedValue));

  useImperativeHandle(ref, () => inputRef.current);

  const updatePosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const rect = input.getBoundingClientRect();
    const left = rect.left - viewportLeft;
    const top = rect.top - viewportTop;
    const below = viewportHeight - top - rect.height - 8;
    const above = top - 8;
    const upwards = below < 180 && above > below;

    setPosition({
      left: Math.max(4, Math.min(left, viewportWidth - rect.width - 4)),
      width: Math.min(rect.width, viewportWidth - 8),
      maxHeight: Math.max(80, Math.min(280, upwards ? above : below)),
      ...(upwards
        ? { bottom: viewportHeight - top + 4 }
        : { top: top + rect.height + 4 }),
    });
  }, []);

  const showOptions = () => {
    if (disabled) return;
    updatePosition();
    setQuery('');
    setActive(-1);
    setOpen(true);
  };

  const choose = (option) => {
    if (!option || option.disabled) return;
    const select = selectRef.current;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!expanded) return;
    const close = (event) => {
      if (!listRef.current?.contains(event.target) && event.target !== inputRef.current) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [expanded, updatePosition]);

  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded, listId]);

  const keyDown = (event) => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) { showOptions(); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      let next = active < 0 ? (step > 0 ? 0 : matches.length - 1) : active + step;
      while (next >= 0 && next < matches.length && matches[next].disabled) next += step;
      if (next >= 0 && next < matches.length) setActive(next);
    } else if (event.key === 'Enter' && expanded) {
      event.preventDefault();
      if (!event.nativeEvent.isComposing) choose(active >= 0 ? matches[active] : matches.find(option => !option.disabled));
    }
  };

  return <>
    <input
      ref={inputRef} id={id} type="text" role="combobox" disabled={disabled}
      className={`searchable-select-input ${className}`} style={style}
      value={expanded ? query : selected?.label || ''}
      placeholder={expanded ? 'Digite para buscar...' : selected?.label || 'Digite para buscar...'}
      autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
      inputMode="search" enterKeyHint="search"
      aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']} aria-required={props.required || undefined}
      aria-invalid={showInvalid || undefined}
      aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-autocomplete="list"
      aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
      title={props.title || 'Digite para buscar uma opção'} tabIndex={props.tabIndex}
      onFocus={showOptions} onClick={() => { if (!expanded) showOptions(); }}
      onBlur={() => setOpen(false)} onKeyDown={keyDown}
      onChange={event => { setQuery(event.target.value); setActive(-1); }}
    />
    <select {...props} ref={selectRef} disabled={disabled} value={value} defaultValue={defaultValue}
      className="searchable-select-native" tabIndex={-1} aria-hidden="true"
      onChange={event => { setLocalValue(event.target.value); setInvalid(false); onChange?.(event); }}
      onInvalid={event => { event.preventDefault(); setInvalid(true); inputRef.current?.focus(); onInvalid?.(event); }}>
      {children}
    </select>
    {expanded && createPortal(<div ref={listRef} id={listId} role="listbox" className="searchable-select-list" style={position}
      aria-label={props['aria-label'] || 'Opções'} onPointerDown={event => event.preventDefault()}>
      {matches.length === 0 && <div className="searchable-select-empty" role="status">Nenhuma opção encontrada</div>}
      {matches.map((option, index) => <div key={`${option.value}-${index}`} id={`${listId}-${index}`} role="option"
        aria-selected={option.value === String(selectedValue)} aria-disabled={option.disabled || undefined}
        className={`searchable-select-option${index === active ? ' is-active' : ''}`}
        onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(option)}>
        {option.group && <small>{option.group} · </small>}{option.label}
      </div>)}
    </div>, document.body)}
  </>;
}
