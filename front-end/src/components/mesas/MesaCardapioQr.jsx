import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const identificadorMesa = (mesa) => `mesa-${String(mesa.id ?? mesa.numero).replace(/[^A-Za-z0-9_-]/g, '')}`;

export default function MesaCardapioQr({ mesa }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [erro, setErro] = useState('');
  const linkCardapio = `${window.location.origin}/cardapio/${encodeURIComponent(mesa.token)}`;
  const idImpressao = identificadorMesa(mesa);

  useEffect(() => {
    let ativo = true;
    QRCode.toDataURL(linkCardapio, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then((dataUrl) => {
        if (ativo) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível gerar o QR code nesta tela.');
      });
    return () => { ativo = false; };
  }, [linkCardapio]);

  const imprimir = () => {
    document.body.dataset.mesaQrImpressao = idImpressao;
    try {
      window.print();
    } catch {
      setErro('Não foi possível abrir a impressão. Verifique as permissões do navegador.');
    } finally {
      delete document.body.dataset.mesaQrImpressao;
    }
  };

  return (
    <section className="mesa-cardapio-qr" data-mesa-qr-id={idImpressao}>
      <style>{`
        @media print {
          body[data-mesa-qr-impressao="${idImpressao}"] * { visibility: hidden !important; }
          body[data-mesa-qr-impressao="${idImpressao}"] [data-mesa-qr-id="${idImpressao}"],
          body[data-mesa-qr-impressao="${idImpressao}"] [data-mesa-qr-id="${idImpressao}"] * { visibility: visible !important; }
          body[data-mesa-qr-impressao="${idImpressao}"] [data-mesa-qr-id="${idImpressao}"] { position: absolute !important; inset: 0 auto auto 0; width: 100%; }
          body[data-mesa-qr-impressao="${idImpressao}"] [data-mesa-qr-id="${idImpressao}"] [data-print-hidden="true"] { display: none !important; }
        }
      `}</style>
      {erro && <small role="alert">{erro}</small>}
      {qrDataUrl
        ? <img src={qrDataUrl} alt={`QR code da Mesa ${mesa.numero}`} width="120" height="120" />
        : <span role="status">Gerando QR code...</span>}
      <a href={linkCardapio} target="_blank" rel="noreferrer">
        Abrir cardápio da mesa {mesa.numero}
      </a>
      <button type="button" data-print-hidden="true" onClick={imprimir}>
        Imprimir QR da Mesa {mesa.numero}
      </button>
    </section>
  );
}
