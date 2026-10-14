// paulus-toth.js — liga o Paulus (IA compartilhada) ao Diário de Campo Toth.
//
// O painel de conversa abre ao tocar no mascote, só com a conta logada.
// PRIVACIDADE (o diário guarda relatos de atendimento):
//   - NÃO lê registros, busca, filtros, campos do formulário nem o Firestore;
//   - NÃO passa "fichas" e NÃO registra buscas sobre os registros;
//   - pergunta com nome, documento, telefone ou endereço é bloqueada antes de qualquer rede
//     e a mensagem é ocultada na tela;
//   - as ações só navegam (abas, novo registro, exportação com confirmação); nada apaga ou importa.
// Ao sair da conta: Paulus.limpar() e o painel é removido.
(function () {
  "use strict";

  // Endereço do Worker do Paulus (o mesmo do Argo e do Anona). Vazio = IA desligada (só a base de normas offline).
  var ENDPOINT = "https://paulus-ia.paulo-ae18.workers.dev";
  var CONHECIMENTO = "conhecimento.json";

  if (window.PaulusToth) return;
  if (!window.Paulus) { console.warn("paulus-toth: paulus.v1.js não carregou; mascote segue só com dicas."); return; }

  var Paulus = window.Paulus;
  var painel = null, lista, campo, btnEnviar, btnParar, cab, fase;
  var controle = null, ocupado = false, ultimaPergunta = "", logado = !!window.__tothLogado;

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function clicar(id) { var b = document.getElementById(id); if (b) b.click(); }
  function aba(filtro) {
    var b = document.querySelector('#filterTabs .tab[data-filter="' + filtro + '"]');
    if (b) b.click();
  }
  function appVisivel() { var a = document.getElementById("appRoot"); return !!a && a.style.display !== "none"; }
  function aviso(msg) { if (window.TothMascot) window.TothMascot.falar(msg); }
  function precisaApp(fn) { return function () { if (!appVisivel()) { aviso("Entre na sua conta primeiro."); return; } fn(); }; }

  function nomeDaAba() {
    var ativa = document.querySelector("#filterTabs .tab.active .tab-label");
    return ativa ? ativa.textContent.trim().slice(0, 60) : "";
  }

  // ---------------------------------------------------------------- ações (só navegação)
  function registrarAcoes() {
    var rot = {
      todos: ["todos os registros", "registros", "inicio", "início", "lista"],
      atendimento: ["atendimentos", "atendimento", "atendimentos individuais", "paif"],
      visita: ["visitas domiciliares", "visita domiciliar", "visitas", "visita"],
      visitatecnica: ["visitas tecnicas", "visita tecnica", "visitas técnicas", "visita técnica"],
      grupo: ["grupos", "grupo", "oficinas", "oficina", "grupos oficinas"],
      pendente: ["acompanhamento", "acompanhamentos", "pendentes", "pendente"]
    };
    Object.keys(rot).forEach(function (f) {
      Paulus.registrarAcao({ id: "aba-" + f, rotulos: rot[f], executar: precisaApp(function () { aba(f); }) });
    });
    Paulus.registrarAcao({ id: "novo-registro", rotulos: ["novo registro", "novo", "criar registro"], executar: precisaApp(function () { clicar("newEntryBtn"); }) });
    // Exportar baixa os relatos para o aparelho: pede confirmação antes.
    [["json", "exportJsonBtn", "exportar json"], ["csv", "exportCsvBtn", "exportar csv"],
     ["word", "exportWordBtn", "exportar word"], ["pdf", "exportPdfBtn", "exportar pdf"]].forEach(function (x) {
      Paulus.registrarAcao({ id: "exportar-" + x[0], rotulos: [x[2], "baixar " + x[0]], confirmar: true, executar: precisaApp(function () { clicar(x[1]); }) });
    });
  }

  // ---------------------------------------------------------------- estilo
  function css() {
    return (
      "#tothPaulus{position:fixed;left:14px;bottom:90px;z-index:70;width:min(360px,calc(100vw - 28px));max-height:min(70vh,560px);" +
      "display:flex;flex-direction:column;background:var(--panel,#faf3e3);color:var(--text,#2b2013);" +
      "border:1px solid var(--border-strong,rgba(93,34,214,.36));border-radius:1rem;box-shadow:var(--shadow,0 12px 32px rgba(0,0,0,.35));" +
      "font-family:var(--font-body,inherit);font-size:.85rem;overflow:hidden;}" +
      "#tothPaulus[hidden]{display:none;}" +
      ".tp-cab{display:flex;align-items:center;gap:.5rem;padding:.6rem .75rem;border-bottom:1px solid var(--border,rgba(93,34,214,.16));}" +
      ".tp-cab strong{flex:1;font-size:.9rem;}.tp-fase{font-size:.72rem;color:var(--text-muted,#6b5c40);}" +
      ".tp-cab button{border:none;background:transparent;cursor:pointer;font-size:1rem;color:inherit;padding:.15rem .35rem;border-radius:.4rem;}" +
      ".tp-lista{flex:1;overflow-y:auto;padding:.7rem;display:flex;flex-direction:column;gap:.55rem;}" +
      ".tp-msg{padding:.5rem .7rem;border-radius:.8rem;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;max-width:92%;}" +
      ".tp-eu{align-self:flex-end;background:var(--toth-violet,#5d22d6);color:#fff;}" +
      ".tp-ia{align-self:flex-start;background:rgba(93,34,214,.08);border:1px solid var(--border,rgba(93,34,214,.16));}" +
      ".tp-crise{border-color:var(--toth-carnelian,#b1442e);background:rgba(177,68,46,.08);}" +
      ".tp-meta{font-size:.72rem;color:var(--text-muted,#6b5c40);margin-top:.35rem;white-space:normal;}" +
      ".tp-chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.4rem;}" +
      ".tp-chip,.tp-mini{border:1px solid var(--border-strong,rgba(93,34,214,.36));background:transparent;color:inherit;border-radius:999px;" +
      "padding:.25rem .6rem;font-size:.75rem;cursor:pointer;font-family:inherit;}" +
      ".tp-chip:hover,.tp-mini:hover{background:rgba(93,34,214,.1);}" +
      ".tp-form{display:flex;gap:.4rem;padding:.55rem;border-top:1px solid var(--border,rgba(93,34,214,.16));}" +
      ".tp-form input{flex:1;min-width:0;padding:.5rem .65rem;border-radius:.6rem;border:1px solid var(--border-strong,rgba(93,34,214,.36));" +
      "background:#fff;color:inherit;font:inherit;}" +
      ".tp-form button{border:none;border-radius:.6rem;padding:.5rem .8rem;background:var(--toth-violet,#5d22d6);color:#fff;cursor:pointer;font:inherit;}" +
      ".tp-form button[disabled]{opacity:.5;cursor:default;}" +
      ".tp-priv{font-size:.68rem;color:var(--text-faint,#948564);padding:0 .75rem .5rem;}" +
      "@media (max-width:640px){#tothPaulus{bottom:84px;}}"
    );
  }

  // ---------------------------------------------------------------- painel
  function montar() {
    if (painel) return;
    var st = document.createElement("style");
    st.textContent = css();
    document.head.appendChild(st);

    painel = el("section");
    painel.id = "tothPaulus";
    painel.hidden = true;
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-label", "Conversa com o Paulus");

    cab = el("div", "tp-cab");
    var tit = el("strong", null, "Paulus · Toth");
    fase = el("span", "tp-fase", "");
    var nova = el("button", null, "↺"); nova.type = "button"; nova.title = "Nova conversa"; nova.setAttribute("aria-label", "Nova conversa");
    nova.addEventListener("click", reiniciar);
    var fechar = el("button", null, "×"); fechar.type = "button"; fechar.title = "Fechar"; fechar.setAttribute("aria-label", "Fechar conversa");
    fechar.addEventListener("click", fecharPainel);
    cab.appendChild(tit); cab.appendChild(fase); cab.appendChild(nova); cab.appendChild(fechar);

    lista = el("div", "tp-lista");
    lista.setAttribute("aria-live", "polite");

    var form = el("form", "tp-form");
    campo = el("input"); campo.type = "text"; campo.maxLength = 1200; campo.autocomplete = "off";
    campo.placeholder = "Pergunte sobre o app ou o SUAS…"; campo.setAttribute("aria-label", "Pergunta ao Paulus");
    btnEnviar = el("button", null, "Enviar"); btnEnviar.type = "submit";
    btnParar = el("button", null, "Parar"); btnParar.type = "button"; btnParar.hidden = true;
    btnParar.addEventListener("click", function () { if (controle) controle.abort(); });
    form.appendChild(campo); form.appendChild(btnEnviar); form.appendChild(btnParar);
    form.addEventListener("submit", function (e) { e.preventDefault(); var t = campo.value.trim(); if (t) { campo.value = ""; enviar(t); } });

    var priv = el("div", "tp-priv", "Não vejo seus registros. Não escreva nomes, documentos, telefones ou endereços de ninguém.");

    painel.appendChild(cab); painel.appendChild(lista); painel.appendChild(form); painel.appendChild(priv);
    document.body.appendChild(painel);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && painel && !painel.hidden) fecharPainel(); });
    saudar();
  }

  function saudar() {
    var sk = Paulus.skin("toth") || {};
    lista.textContent = "";
    var b = el("div", "tp-msg tp-ia", sk.saudacao || "Oi! Eu sou o Paulus, aqui como Toth.");
    lista.appendChild(b);
    chips(b, sk.sugestoes || []);
  }

  function chips(pai, itens) {
    if (!itens || !itens.length) return;
    var box = el("div", "tp-chips");
    itens.forEach(function (t) {
      var c = el("button", "tp-chip", t); c.type = "button";
      c.addEventListener("click", function () { if (!ocupado) enviar(t); });
      box.appendChild(c);
    });
    pai.appendChild(box);
  }

  function rolar() { lista.scrollTop = lista.scrollHeight; }
  function abrirPainel() { montar(); painel.hidden = false; campo.focus(); }
  function fecharPainel() { if (controle) controle.abort(); if (painel) painel.hidden = true; }
  function reiniciar() { if (controle) controle.abort(); Paulus.limpar(); if (painel) { saudar(); } }
  function destruir() {
    if (controle) controle.abort();
    Paulus.limpar();
    if (painel) { painel.remove(); painel = null; }
    ocupado = false; ultimaPergunta = "";
  }

  function trabalhando(sim) {
    ocupado = sim;
    btnEnviar.disabled = sim; campo.disabled = sim; btnParar.hidden = !sim;
    if (!sim) { fase.textContent = ""; campo.focus(); }
  }

  // ---------------------------------------------------------------- resposta
  function lerFontes(fontes) {
    return (fontes || []).map(function (f) {
      return [f.documento, f.referencia, f.norma && f.ano ? f.norma + ", " + f.ano : f.norma].filter(Boolean).join(" · ");
    }).filter(Boolean);
  }

  function desenharMeta(bolha, r) {
    var fs = lerFontes(r.fontes);
    if (fs.length) {
      var det = el("details", "tp-meta");
      det.appendChild(el("summary", null, "Fontes (" + fs.length + ")"));
      fs.forEach(function (f) { det.appendChild(el("div", null, "• " + f)); });
      bolha.appendChild(det);
    }
    (r.avisos || []).forEach(function (a) { bolha.appendChild(el("div", "tp-meta", a)); });
    if (r.tipo === "crise" && r.telefones) {
      r.telefones.forEach(function (t) {
        var linha = el("div", "tp-meta");
        var a = el("a", null, t.numero + " — " + t.nome);
        a.href = "tel:" + String(t.numero).replace(/\D/g, "");
        linha.appendChild(a); bolha.appendChild(linha);
      });
    }
    if (r.tipo === "acao" && r.pedeConfirmacao) {
      var c = el("button", "tp-chip", "Confirmar"); c.type = "button";
      c.addEventListener("click", function () { c.disabled = true; try { r.confirmar(); } catch (e) {} c.textContent = "Feito"; });
      bolha.appendChild(el("div", "tp-chips")).appendChild(c);
    }
    if (r.tipo === "acao_desconhecida" && r.opcoes && r.opcoes.length) {
      chips(bolha, r.opcoes.slice(0, 8).map(function (o) { return "abrir " + o; }));
    }
    if (r.tipo === "ia" || r.tipo === "norma") {
      var acoes = el("div", "tp-chips");
      var copiar = el("button", "tp-mini", "Copiar"); copiar.type = "button";
      copiar.addEventListener("click", function () {
        try { navigator.clipboard.writeText(r.texto).then(function () { copiar.textContent = "Copiado"; }); } catch (e) {}
      });
      var curto = el("button", "tp-mini", "Mais curto"); curto.type = "button";
      curto.addEventListener("click", function () { if (!ocupado) enviar("Explique de novo, de forma mais curta: " + ultimaPergunta); });
      acoes.appendChild(copiar); acoes.appendChild(curto);
      bolha.appendChild(acoes);
    }
    if (r.tipo === "erro" || r.tipo === "sem_resposta") {
      if (!r.limite) {
        var t = el("button", "tp-mini", "↻ Tentar de novo"); t.type = "button";
        t.addEventListener("click", function () { if (!ocupado) enviar(ultimaPergunta); });
        bolha.appendChild(el("div", "tp-chips")).appendChild(t);
      }
    }
    chips(bolha, r.sugestoes);
  }

  async function enviar(texto) {
    if (ocupado) return;
    ultimaPergunta = texto;
    var minha = el("div", "tp-msg tp-eu", texto);
    lista.appendChild(minha);
    var bolha = el("div", "tp-msg tp-ia", "…");
    lista.appendChild(bolha);
    rolar();
    trabalhando(true);
    fase.textContent = "pensando…";
    controle = typeof AbortController === "function" ? new AbortController() : null;
    var r;
    try {
      r = await Paulus.perguntar(texto, {
        aba: nomeDaAba(),
        sinal: controle ? controle.signal : undefined,
        onToken: function (_p, tudo) { fase.textContent = "escrevendo…"; bolha.textContent = tudo; rolar(); }
      });
    } catch (e) {
      r = { tipo: "erro", texto: "Não consegui responder agora." };
    }
    controle = null;
    if (r.tipo === "bloqueio") minha.textContent = "(mensagem oculta: continha dado pessoal)";
    if (r.tipo === "crise") bolha.classList.add("tp-crise");
    if (r.tipo !== "ia" || !bolha.textContent || bolha.textContent === "…") bolha.textContent = (r.titulo ? r.titulo + "\n\n" : "") + (r.texto || "");
    else bolha.textContent = r.texto;
    desenharMeta(bolha, r);
    trabalhando(false);
    rolar();
  }

  // ---------------------------------------------------------------- ligação com o app
  Paulus.init({ app: "toth", endpoint: ENDPOINT, conhecimentoUrl: CONHECIMENTO });
  registrarAcoes();

  function aoMudarConta(e) {
    logado = !!(e && e.detail && e.detail.logado);
    if (!logado) destruir();
  }
  document.addEventListener("toth:auth", aoMudarConta);

  function ligarMascote() {
    if (!window.TothMascot || !window.TothMascot.aoClicar) return false;
    window.TothMascot.aoClicar(function () {
      if (!logado) return false;          // sem login: o mascote segue dando dicas
      if (painel && !painel.hidden) { fecharPainel(); return true; }
      abrirPainel();
      return true;
    });
    return true;
  }
  if (!ligarMascote()) window.addEventListener("load", ligarMascote);

  window.PaulusToth = { abrir: abrirPainel, fechar: fecharPainel };
})();
