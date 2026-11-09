from pathlib import Path

path = Path(r"c:\Users\user\Documents\PDV-Cafe\front-end\src\pages\Products.jsx")
text = path.read_text(encoding="utf-8")

replacements = [
    ("ÔÜá´©Å", "Atenção:"),
    ("Ô×ò", "Novo"),
    ("ÔÇö", "é"),
    ("ÔØî", "Não"),
    ("Ô£à", "✓"),
    ("Ô£ô", "✓"),
    ("ÔåÆ", "→"),
    ("ƒôª", "Cadastro"),
    ("ƒÆ░", "⚠"),
    ("ƒÅÀ´©Å", "⚙"),
    ("ƒÄ»", "✓"),
    ("ƒôï", "📦"),
    ("ƒöÆ", "✓"),
    ("ƒôè", "📄"),
    ("ԣŴ©Å", "Editar"),
    ("´╝ï", "▾"),
    ("", "▴"),
    ("", "✓"),
    ("N├úo", "Não"),
    ("poss├¡vel", "possível"),
    ("├®", "é"),
    ("├│", "ó"),
    ("├¡", "í"),
    ("├º", "ç"),
    ("├ú", "ã"),
    ("├á", "à"),
    ("├ç", "ç"),
    ("├ë", "ê"),
    ("├║", "n"),
    ("┬À", "à"),
    ("├Ü", "ü"),
    ("┼", ""),
    ("C├│digo", "Código"),
    ("C├│digo j├í cadastrado", "Código já cadastrado"),
    ("pre├ºo", "preço"),
    ("m├¡nimo", "mínimo"),
    ("conte├║do", "conteúdo"),
    ("informa├º├Áes", "informações"),
    ("aquisi├º├úo", "aquisição"),
    ("pre├ºos", "preços"),
    ("fa├ºa", "faixa"),
    ("t├®cnica", "técnica"),
    ("┬À", "à"),
    ("├å", "å"),
    ("├ò", "ò"),
    ("├ù", "ù"),
    ("├£", "£"),
    ("├ã", "ã"),
]

for old, new in replacements:
    text = text.replace(old, new)

# Additional human-readable corrections for specific phrases.
text = text.replace("Atenção:O", "Atenção: O")
text = text.replace("Produto cadastrado!", "Produto cadastrado!")
text = text.replace("Novo Novo Produto", "Novo Produto")
text = text.replace("EDITAR PRODUTO", "Editar Produto")
text = text.replace("COMPRA E FICHA TÉCNICA", "COMPRA E FICHA TÉCNICA")
text = text.replace("DESCONTOS E PROMOÇÕES", "DESCONTOS E PROMOÇÕES")
text = text.replace("CONFIGURAÇÕES AVANÇADAS", "CONFIGURAÇÕES AVANÇADAS")
text = text.replace("RESUMO AUTOMÁTICO", "RESUMO AUTOMÁTICO")
text = text.replace("Gerenciar ficha técnica →", "Gerenciar ficha técnica →")
text = text.replace("Editar ficha técnica →", "Editar ficha técnica →")
text = text.replace("Criar ficha técnica →", "Criar ficha técnica →")

path.write_text(text, encoding="utf-8")
print(f"Patched {path}")
