import { useEffect, useState } from 'react';
import api from '../services/api.jsx';
import {
  getBranding,
  saveBrandingOverride,
  clearBrandingOverride,
  setServerBranding,
  fetchServerBranding,
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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await fetchServerBranding(api);
        if (!active) return;
        setForm({
          name: next.name,
          shortName: next.shortName,
          tagline: next.tagline,
          logoUrl: next.logoUrl,
          themeColor: next.themeColor,
          backgroundColor: next.backgroundColor,
        });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const onChange = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const salvar = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/configuracoes/branding', form);
      const server = data?.branding || form;
      setServerBranding(server);
      // Alinha cache local ao servidor (fonte da verdade multi-dispositivo)
      clearBrandingOverride();
      setServerBranding(server);
      const next = getBranding();
      setForm(next);
      showToast('Aparência salva no servidor (todos os dispositivos).', 'success');
    } catch (error) {
      try {
        saveBrandingOverride(form);
        showToast(
          (error.response?.data?.msg || 'Servidor indisponível') + ' — salvo só neste dispositivo.',
          'warning',
        );
      } catch (localError) {
        showToast(localError.message || error.response?.data?.msg || 'Não foi possível salvar.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const restaurar = async () => {
    setSaving(true);
    try {
      await api.put('/configuracoes/branding', {
        name: '',
        shortName: '',
        tagline: '',
        logoUrl: '',
        themeColor: '',
        backgroundColor: '',
      });
      clearBrandingOverride();
      setServerBranding({});
      const next = getBranding();
      setForm(next);
      showToast('Voltou aos padrões do build (VITE_APP_* / PDV).', 'info');
    } catch (error) {
      clearBrandingOverride();
      const next = getBranding();
      setForm(next);
      showToast(
        (error.response?.data?.msg || 'Servidor indisponível') + ' — limpou só o cache local.',
        'warning',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="page" style={{ maxWidth: 640 }}>
        <p role="status">Carregando aparência…</p>
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <header className="page-header">
        <div className="page-header__title">
          <p className="eyebrow">White-label</p>
          <h1 className="page-title">Aparência</h1>
          <p className="page-subtitle">
            Nome, logo e cor do estabelecimento. Salvos no servidor e aplicados em todos os dispositivos.
            Fallback: variáveis VITE_APP_* no build.
          </p>
        </div>
      </header>

      <form className="card" onSubmit={salvar} style={{ gap: 16 }}>
        <label className="field">
          <span className="label">Nome</span>
          <input value={form.name} onChange={onChange('name')} required maxLength={40} disabled={saving} />
        </label>
        <label className="field">
          <span className="label">Nome curto (PWA)</span>
          <input value={form.shortName} onChange={onChange('shortName')} required maxLength={12} disabled={saving} />
        </label>
        <label className="field">
          <span className="label">Tagline</span>
          <input value={form.tagline} onChange={onChange('tagline')} maxLength={80} disabled={saving} />
        </label>
        <label className="field">
          <span className="label">URL do logo</span>
          <input value={form.logoUrl} onChange={onChange('logoUrl')} placeholder="/logo.svg" disabled={saving} />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="label">Cor primária</span>
            <input type="color" value={form.themeColor || '#4f9d6a'} onChange={onChange('themeColor')} style={{ height: 40, padding: 4 }} disabled={saving} />
          </label>
          <label className="field">
            <span className="label">Fundo (meta / splash)</span>
            <input type="color" value={form.backgroundColor || '#f3f6f1'} onChange={onChange('backgroundColor')} style={{ height: 40, padding: 4 }} disabled={saving} />
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
          <button type="button" className="btn-secondary" onClick={restaurar} disabled={saving}>Restaurar padrão</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar no servidor'}
          </button>
        </div>
      </form>
    </main>
  );
}
