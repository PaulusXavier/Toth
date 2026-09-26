// toth-mascot.js — mascote do app Diário de Campo Toth: a mesma medalha do
// ícone (íbis, lua + disco solar) ganha vida num canto da tela, acena
// quando tocada e fala dicas rápidas sobre o app.
//
// Segue o mesmo padrão do anona-mascot.js: não depende de nada além do
// próprio navegador (sem bibliotecas externas). Basta incluir este arquivo
// com <script src="toth-mascot.js" defer></script> em algum ponto do
// <body> do index.html (depois do style.css e do branding-toth.css).
//
// API pública (window.TothMascot):
//   TothMascot.falar("mensagem", { duracao: 6000 })  -> mostra um balão de fala
//   TothMascot.acenar()                               -> só faz o aceno, sem falar
//   TothMascot.esconder() / TothMascot.mostrar()       -> some/aparece de vez
//
// O mascote fica sempre atrás de modais (z-index abaixo de .modal-backdrop)
// e só a área da própria medalha responde a toque — nunca atrapalha o
// resto da página.

(function () {
  "use strict";

  if (window.TothMascot) return; // evita duplicar se o script for incluído 2x

  var DICAS = [
    "Toque no 🎙️ do campo de observações para ditar por voz — é o recurso que mais uso no dia a dia.",
    "Use o 📍 para marcar sozinho o local do atendimento ou da visita pelo GPS.",
    "As abas da barra lateral filtram por tipo: atendimento, visita domiciliar, visita técnica ou grupo.",
    "Marque o status como 'Acompanhamento pendente' para não perder de vista um caso em aberto.",
    "Seus registros sincronizam pela nuvem — entre com a mesma conta em outro aparelho e tudo aparece lá.",
    "Precisa levar seus registros para outro lugar? Exporte em Word, PDF, CSV ou JSON pelo menu lateral."
  ];

  var LS_KEY = "tothMascotVisto";
  var raiz, balao, cartao, textoBalao, escondeTimer;

  function css() {
    return (
      "#tothMascotWrap{position:fixed;left:14px;bottom:14px;z-index:60;" +
      "display:flex;flex-direction:column;align-items:flex-start;gap:.5rem;" +
      "font-family:var(--font-body,inherit);}" +
      "#tothMascotWrap.toth-escondido{display:none;}" +
      "#tothMascotBotao{width:64px;height:64px;border:none;padding:0;cursor:pointer;" +
      "background:transparent;border-radius:50%;line-height:0;" +
      "filter:drop-shadow(0 6px 14px rgba(43,32,19,.35));transition:transform .15s ease;}" +
      "#tothMascotBotao:hover{transform:translateY(-2px);}" +
      "#tothMascotBotao:focus-visible{outline:2px solid var(--toth-blue,#0579f8);outline-offset:3px;}" +
      "#tothMascotBotao svg{display:block;width:64px;height:64px;}" +
      ".toth-personagem{animation:tothFlutuar 2.8s ease-in-out infinite;}" +
      ".toth-braco{transform-origin:120px 124px;}" +
      "#tothMascotWrap.toth-acenando .toth-braco{animation:tothAceno 1.4s ease-in-out 2;}" +
      ".toth-olho{animation:tothPiscar 4.5s ease-in-out infinite;}" +
      "@keyframes tothFlutuar{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}" +
      "@keyframes tothAceno{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}" +
      "@keyframes tothPiscar{0%,86%,100%{ry:4px}92%{ry:.6px}}" +
      "#tothMascotBalao{max-width:230px;background:var(--panel,#faf3e3);color:var(--text,#2b2013);" +
      "border:1px solid var(--border-strong,rgba(93,34,214,.36));border-radius:1rem;padding:.65rem .85rem;" +
      "font-size:.82rem;line-height:1.35;box-shadow:var(--shadow,0 12px 32px rgba(0,0,0,.35));" +
      "opacity:0;transform:translateY(6px);transition:opacity .15s ease,transform .15s ease;" +
      "pointer-events:none;}" +
      "#tothMascotBalao.toth-visivel{opacity:1;transform:translateY(0);pointer-events:auto;}" +
      "@media (prefers-reduced-motion: reduce){" +
      ".toth-personagem{animation:none;}.toth-olho{animation:none;}" +
      "#tothMascotWrap.toth-acenando .toth-braco{animation:none;}" +
      "#tothMascotBotao,#tothMascotBalao{transition:none;}}"
    );
  }

  var SVG_MEDALHA =
    '<svg viewBox="0 0 200 220" aria-hidden="true">' +
    '<defs>' +
    '<linearGradient id="tothGouro" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#e8c877"/><stop offset=".55" stop-color="#c99a3a"/><stop offset="1" stop-color="#8a6a2e"/>' +
    '</linearGradient>' +
    '<radialGradient id="tothPapiro" cx="35%" cy="28%" r="85%">' +
    '<stop offset="0" stop-color="#fdf6e3"/><stop offset="1" stop-color="#efe1c3"/>' +
    '</radialGradient>' +
    '<linearGradient id="tothBico" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#e2b563"/><stop offset="1" stop-color="#8a6a2e"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<circle cx="100" cy="112" r="88" fill="url(#tothPapiro)" stroke="url(#tothGouro)" stroke-width="10"/>' +
    '<circle cx="100" cy="112" r="78" fill="none" stroke="#8a6a2e" stroke-width="1.5" opacity=".35"/>' +
    '<g class="toth-personagem">' +
    '<circle cx="100" cy="38" r="18" fill="#c99a3a"/>' +
    '<circle cx="108" cy="34" r="15" fill="url(#tothPapiro)"/>' +
    '<circle cx="100" cy="28" r="7" fill="#e8c877" stroke="#8a6a2e" stroke-width="1"/>' +
    '<path class="toth-braco" d="M120,124 C132,120 142,108 145,88" stroke="#131b2e" stroke-width="14" stroke-linecap="round" fill="none"/>' +
    '<path d="M80,124 C68,120 58,108 55,88" stroke="#131b2e" stroke-width="14" stroke-linecap="round" fill="none"/>' +
    '<path d="M77,132 C77,150 82,165 85,185 L115,185 C118,165 123,150 123,132 C123,124 113,120 100,120 C87,120 77,124 77,132 Z" fill="#131b2e"/>' +
    '<circle cx="100" cy="193" r="5" fill="none" stroke="#131b2e" stroke-width="3"/>' +
    '<circle cx="100" cy="76" r="28" fill="#f7ecd3" stroke="#131b2e" stroke-width="3"/>' +
    '<path d="M79,63 q-6,-2 -6,-8" stroke="#131b2e" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '<path d="M121,63 q6,-2 6,-8" stroke="#131b2e" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '<path d="M97,76 Q88,102 94,126 Q100,130 104,124 Q112,100 103,76 Z" fill="url(#tothBico)" stroke="#131b2e" stroke-width="1.5"/>' +
    '<ellipse class="toth-olho" cx="90" cy="70" rx="4" ry="4" fill="#131b2e"/>' +
    '<ellipse class="toth-olho" cx="110" cy="70" rx="4" ry="4" fill="#131b2e"/>' +
    '</g>' +
    "</svg>";

  function montar() {
    if (raiz) return;

    var style = document.createElement("style");
    style.textContent = css();
    document.head.appendChild(style);

    raiz = document.createElement("div");
    raiz.id = "tothMascotWrap";

    balao = document.createElement("div");
    balao.id = "tothMascotBalao";
    balao.setAttribute("role", "status");
    balao.setAttribute("aria-live", "polite");
    textoBalao = document.createElement("span");
    balao.appendChild(textoBalao);

    cartao = document.createElement("button");
    cartao.type = "button";
    cartao.id = "tothMascotBotao";
    cartao.setAttribute("aria-label", "Toth, o mascote do app — toque para uma dica");
    cartao.innerHTML = SVG_MEDALHA;
    cartao.addEventListener("click", function () {
      var dica = DICAS[Math.floor(Math.random() * DICAS.length)];
      falar(dica);
    });

    raiz.appendChild(balao);
    raiz.appendChild(cartao);
    document.body.appendChild(raiz);
  }

  function acenar() {
    if (!raiz) montar();
    raiz.classList.remove("toth-acenando");
    // força reflow para poder reiniciar a animação mesmo se já tiver rodado
    void raiz.offsetWidth;
    raiz.classList.add("toth-acenando");
  }

  function falar(mensagem, opcoes) {
    if (!raiz) montar();
    opcoes = opcoes || {};
    var duracao = typeof opcoes.duracao === "number" ? opcoes.duracao : 6000;
    textoBalao.textContent = String(mensagem == null ? "" : mensagem);
    balao.classList.add("toth-visivel");
    acenar();
    clearTimeout(escondeTimer);
    if (duracao > 0) {
      escondeTimer = setTimeout(function () {
        balao.classList.remove("toth-visivel");
      }, duracao);
    }
  }

  function esconder() {
    if (raiz) raiz.classList.add("toth-escondido");
  }

  function mostrar() {
    if (!raiz) montar();
    raiz.classList.remove("toth-escondido");
  }

  window.TothMascot = { falar: falar, acenar: acenar, esconder: esconder, mostrar: mostrar };

  function iniciar() {
    montar();
    if (!localStorage.getItem(LS_KEY)) {
      setTimeout(function () {
        falar("Olá, eu sou o Toth! Toque em mim quando quiser uma dica rápida.");
        try { localStorage.setItem(LS_KEY, "1"); } catch (e) {}
      }, 1200);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
