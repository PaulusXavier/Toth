# Integração da identidade visual Toth

Este pacote adapta a identidade visual **Diário de Campo Toth** ao aplicativo HTML/PWA enviado. A versão roxo-azul foi escolhida para a tela de login por combinar com o tema escuro existente e manter boa leitura; a composição vermelho-laranja fica disponível para divulgação e materiais institucionais.

## Arquivos incluídos

| Arquivo | Uso |
|---|---|
| `img/icone-psi-toth-192.png` | Favicon, atalho do celular e marca compacta no menu/login |
| `img/icone-toth-caderno-roxo-azul.png` | Fundo visual da tela de login |
| `img/icone-toth-caderno-fundo.png` | Arte institucional para divulgação ou futura tela de abertura |
| `img/*-fofinho.png` | Versões mais acolhedoras e suaves, usadas como padrão no aplicativo |
| `css/branding-toth.css` | Regras de aplicação da marca |
| `manifest.json` | Configuração PWA com nome, cores e ícone |
| `js/app.js` | Autenticação, Firestore, offline, filtros, geolocalização e exportações |
| `sw.js` | Cache offline do PWA, atualizado para os assets Toth |
| `index.html` | HTML atualizado para carregar o PNG, manifesto, CSS, app e service worker |

## Como aplicar no repositório existente

1. Copie `img/`, `css/branding-toth.css`, `manifest.json`, `js/app.js` e `sw.js` para a raiz do aplicativo, preservando a estrutura de pastas.
2. Substitua o `index.html` pelo arquivo deste pacote ou aplique as duas alterações abaixo:
   - trocar o favicon SVG por `img/icone-psi-toth-192.png`;
   - adicionar `<link rel="stylesheet" href="css/branding-toth.css">` depois de `css/style.css`.
3. O `js/app.js` incluído é a versão Firebase enviada nesta conversa. O CSS incluído é uma camada de marca e não substitui o `css/style.css` principal.
4. Faça o commit e envie para o GitHub:

```bash
git add index.html manifest.json css/branding-toth.css js/app.js sw.js img/
git commit -m "feat: integrar identidade visual e PWA Toth ao app"
git push
```

## Observação sobre o repositório

O conteúdo recebido nesta conversa não continha o `css/style.css` completo; ele continua sendo necessário no repositório final. O `js/app.js` usa a configuração Firebase fornecida pelo projeto. Antes de publicar, confirme as regras de segurança do Firestore e os provedores de autenticação no Firebase Console; a chave web não substitui essas regras.

As mensagens principais também foram revisadas para uma linguagem mais acolhedora: a tela vazia agora convida a pessoa a começar o diário, a busca ficou mais natural e a tela de acesso explica com clareza o benefício da sincronização.

## Verificação rápida

Abra o app por um servidor HTTP local — não por `file://` — para validar favicon, manifesto e imagem de fundo:

```bash
python3 -m http.server 8080
```

Em seguida, acesse `http://localhost:8080/` e confira a tela de login, o ícone do menu e a instalação como PWA.
