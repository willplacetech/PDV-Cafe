import { useState } from 'react';
import {
  getBranding,
  saveBrandingOverride,
  clearBrandingOverride,
} from '../config/branding.js';
import { useToast } from '../components/useToast.js';

export default function Aparencia() {
  const { showToast } = useToast();
  const initial = getBranding();
  const [form, setForm] = useState({
    name: initial.name,
    shortName: initial.shortName,
    tagline: initial.tagline,
    logoUrl: initial.logoUrl,
    themeColor: initial.themeColor,
    backgroundColor: initial.backgroundColor,
  });

  const onChange = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const salvar = (event) => {
    event.preventDefault();
    try {
      const next = saveBrandingOverride(form);
      setForm(next);
      showToast('Aparência atualizada neste dispositivo.', 'success');
    } catch (error) {
      showToast(error.message || 'Não foi possível salvar.', 'error');
    }
  };

  const restaurar = () => {
    const next = clearBrandingOverride();
    setForm(next);
    showToast('Voltou aos padrões do build (VITE_APP_* / PDV).', 'info');
  };

  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <header className="page-header">
        <div className="page-header__title">
          <p className="eyebrow">White-label</p>
          <h1 className="page-title">Aparência</h1>
          <p className="page-subtitle">
            Nome, logo e cor neste navegador (localStorage). Para fixar no deploy, use variáveis VITE_APP_* no Render.
          </p>
        </div>
      </header>

      <form className="card" onSubmit={salvar} style={{ gap: 16 }}>
        <label className="field">
          <span className="label">Nome</span>
          <input value={form.name} onChange={onChange('name')} required maxLength={40} />
        </label>
        <label className="field">
          <span className="label">Nome curto (PWA)</span>
          <input value={form.shortName} onChange={onChange('shortName')} required maxLength={12} />
        </label>
        <label className="field">
          <span className="label">Tagline</span>
          <input value={form.tagline} onChange={onChange('tagline')} maxLength={80} />
        </label>
        <label className="field">
          <span className="label">URL do logo</span>
          <input value={form.logoUrl} onChange={onChange('logoUrl')} placeholder="/logo.svg" />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="label">Cor primária</span>
            <input type="color" value={form.themeColor} onChange={onChange('themeColor')} style={{ height: 40, padding: 4 }} />
          </label>
          <label className="field">
            <span className="label">Fundo (meta / splash)</span>
            <input type="color" value={form.backgroundColor} onChange={onChange('backgroundColor')} style={{ height: 40, padding: 4 }} />
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <img
            src={form.logoUrl || '/logo.svg'}
            alt="Prévia do logo"
            width={56}
            height={56}
            style={{ objectFit: 'contain', borderRadius: 12, border: '1px solid var(--color-border)' }}
            onError={(e) => { e.currentTarget.src = '/logo.svg'; }}
          />
          <span className="hint">Prévia — se a URL falhar, usa /logo.svg</span>
        </div>

        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={restaurar}>Restaurar padrão</button>
          <button type="submit" className="btn-primary">Salvar neste dispositivo</button>
        </div>
      </form>
    </main>
  );
}
