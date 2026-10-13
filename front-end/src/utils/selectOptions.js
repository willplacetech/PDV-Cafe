import { Children, isValidElement, Fragment } from 'react';

const text = (children) => Children.toArray(children).map(child =>
  isValidElement(child) ? text(child.props.children) : String(child)
).join('');

export function selectOptions(children, group = '', groupDisabled = false) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) return selectOptions(child.props.children, group, groupDisabled);
    if (child.type === 'optgroup') return selectOptions(child.props.children, child.props.label, groupDisabled || Boolean(child.props.disabled));
    if (child.type !== 'option') return [];
    const label = text(child.props.children);
    return [{ value: String(child.props.value ?? label), label, disabled: groupDisabled || Boolean(child.props.disabled), group }];
  });
}

const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export function filterOptions(options, query) {
  const search = normalize(query);
  return options.filter(option => normalize(option.label).includes(search));
}
