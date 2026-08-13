# Central de Marcação Laser — versão modular

## Estrutura
- `index.html` — interface
- `styles.css` — tema e responsividade
- `js/main.js` — entrada da aplicação
- `js/editor.js` — canvas, propriedades, histórico, interações e UI
- `js/qr.js` — gerador de QR Code
- `js/barcode.js` — Code 128 / Code 39
- `js/image-tools.js` — imagens e remoção de fundo
- `js/storage.js` — modelos e preferências
- `js/export.js` — PNG e SVG

## Como executar
Use um servidor local (Live Server, `python -m http.server`) ou publique na Vercel/Hostinger/GitHub Pages. Por usar ES Modules, abrir diretamente por `file://` pode ser bloqueado em alguns navegadores.
