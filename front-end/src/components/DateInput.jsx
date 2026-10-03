import { useState } from 'react';

const displayDate = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const isoDate = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) return '';
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return '';
  return `${year}-${month}-${day}`;
};

export default function DateInput({ value, onChange, style, ...props }) {
  const [text, setText] = useState(displayDate(value));

  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    setText(displayDate(value));
  }

  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
    const formatted = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
    setText(formatted);
    onChange(isoDate(formatted));
  };

  const handleBlur = () => {
    setText(displayDate(value));
  };

  return <input {...props} type="text" inputMode="numeric" maxLength={10} placeholder="dd/mm/aaaa" value={text} onChange={handleChange} onBlur={handleBlur} style={style} />;
}
