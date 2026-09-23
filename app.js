// ============================================================
// CADERNO DE CAMPO - Paulo Xavier
// app.js — agora com sincronização entre dispositivos via Firebase
// (Authentication + Cloud Firestore)
// ============================================================

// --------------------------------------------------------------
// 1) CONFIGURAÇÃO DO FIREBASE
// --------------------------------------------------------------
// Substitua os valores abaixo pelos do SEU projeto Firebase.
// Console: https://console.firebase.google.com
// Projeto > Configurações do projeto > "Seus apps" > Configuração do SDK
const firebaseConfig = {
  apiKey: "AIzaSyAkmsw0v0D6HDG4akeW7ZIhqPnCo5SssPY",
  authDomain: "toth-c35c3.firebaseapp.com",
  projectId: "toth-c35c3",
  storageBucket: "toth-c35c3.firebasestorage.app",
  messagingSenderId: "326262197372",
  appId: "1:326262197372:web:92b09e138bef5354e38df9",
  measurementId: "G-85LVLPZYFQ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
try { firebase.analytics(); } catch (e) { /* Analytics é opcional; ignora se bloqueado (ex.: ad-blocker) */ }

// Cache offline: permite abrir/editar registros sem internet.
// As alterações são enviadas automaticamente quando a conexão volta.
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn('Persistência offline não pôde ser ativada:', err.code);
});

// --------------------------------------------------------------
// Estado local
// --------------------------------------------------------------
let registros = [];
let filtroAtual = 'todos';
let termoBusca = '';
let currentUser = null;
let unsubscribeSnapshot = null;
let carregandoRegistros = false;
let modoAuth = 'entrar'; // 'entrar' | 'cadastro'

// Controle de alterações não salvas no modal de registro: evita perder
// observações (às vezes ditadas e longas) por um fechamento acidental.
let modalEntryKey = null;       // 'novo' ou o id do registro em edição, enquanto o modal está aberto
let modalSnapshotInicial = '';  // "foto" dos campos assim que o modal foi aberto, para detectar alterações
let draftTimeoutId = null;

function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function formatarData(d) {
    if (!d) return '';
    const p = d.split('-');
    if (p.length !== 3) return d;
    return `${p[2]}/${p[1]}/${p[0]}`;
}

// new Date().toISOString() usa UTC: perto da meia-noite em Roraima
// (UTC-4) isso podia preencher o campo "Data" do novo registro com o
// dia seguinte por engano. Esta função usa o fuso horário local do
// aparelho para gerar o "YYYY-MM-DD" de hoje corretamente.
function dataLocalHoje() {
    const agora = new Date();
    const semFusoUTC = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
    return semFusoUTC.toISOString().split('T')[0];
}

// Corrigido para bater com as opções do formulário e as abas do menu
// (antes havia "visita/pesquisa/atividade", que não existiam no HTML).
const LABELS_TIPO = {
    atendimento: 'Atendimento individual',
    visita: 'Visita domiciliar',
    visitatecnica: 'Visita técnica',
    grupo: 'Grupo / Oficina'
};
const LABELS_STATUS = { concluido: 'Concluído', acompanhamento: 'Acompanhamento pendente', planejado: 'Planejado' };

// ------------------------------------------------------------
// Autenticação
// ------------------------------------------------------------
function mostrarTelaAuth(mostrar) {
    document.getElementById('authScreen').style.display = mostrar ? 'flex' : 'none';
    document.getElementById('appRoot').style.display = mostrar ? 'none' : 'flex';
}

function traduzirErroAuth(codigo) {
    const mapa = {
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/user-not-found': 'Não existe conta com este e-mail. Use "Criar conta".',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar".',
        'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
        'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde um momento e tente novamente.',
    };
    return mapa[codigo] || 'Não foi possível concluir. Tente novamente.';
}

function atualizarStatusSync(estado) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    el.classList.remove('sync-ok', 'sync-erro', 'sync-offline');
    if (estado === 'sincronizado') {
        el.classList.add('sync-ok');
        el.textContent = '● Sincronizado';
    } else if (estado === 'offline') {
        el.classList.add('sync-offline');
        el.textContent = '● Offline — salvando localmente';
    } else {
        el.classList.add('sync-erro');
        el.textContent = '● Erro de sincronização';
    }
}

function iniciarSincronizacao(uid) {
    const colecao = db.collection('usuarios').doc(uid).collection('registros');
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    carregandoRegistros = true;
    renderizar();
    unsubscribeSnapshot = colecao.onSnapshot(
        (snapshot) => {
            carregandoRegistros = false;
            registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderizar();
            atualizarStatusSync(navigator.onLine ? 'sincronizado' : 'offline');
        },
        (err) => {
            carregandoRegistros = false;
            console.error('Erro na sincronização:', err);
            atualizarStatusSync('erro');
            renderizar();
        }
    );
}

function pararSincronizacao() {
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    registros = [];
    carregandoRegistros = false;
}

auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
        mostrarTelaAuth(false);
        document.getElementById('userEmailLabel').textContent = user.email || '';
        iniciarSincronizacao(user.uid);
    } else {
        pararSincronizacao();
        mostrarTelaAuth(true);
        renderizar();
    }
});

window.addEventListener('online', () => atualizarStatusSync('sincronizado'));
window.addEventListener('offline', () => atualizarStatusSync('offline'));

function configurarFormAuth() {
    const form = document.getElementById('authForm');
    const erroEl = document.getElementById('authError');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleBtn = document.getElementById('authToggleBtn');
    const tituloEl = document.getElementById('authTitle');

    function atualizarModo() {
        erroEl.textContent = '';
        if (modoAuth === 'cadastro') {
            tituloEl.textContent = 'Criar conta';
            submitBtn.textContent = 'Criar conta';
            toggleBtn.textContent = 'Já tenho uma conta — Entrar';
        } else {
            tituloEl.textContent = 'Entrar';
            submitBtn.textContent = 'Entrar';
            toggleBtn.textContent = 'Ainda não tenho conta — Criar conta';
        }
    }
    atualizarModo();

    toggleBtn.addEventListener('click', () => {
        modoAuth = modoAuth === 'cadastro' ? 'entrar' : 'cadastro';
        atualizarModo();
    });

    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const campoSenha = document.getElementById('authPassword');
            const estaVisivel = campoSenha.type === 'text';
            campoSenha.type = estaVisivel ? 'password' : 'text';
            const iconeAberto = togglePasswordBtn.querySelector('.icon-eye-open');
            const iconeFechado = togglePasswordBtn.querySelector('.icon-eye-off');
            if (iconeAberto) iconeAberto.hidden = estaVisivel ? false : true;
            if (iconeFechado) iconeFechado.hidden = estaVisivel ? true : false;
            const rotulo = estaVisivel ? 'Mostrar senha' : 'Ocultar senha';
            togglePasswordBtn.title = rotulo;
            togglePasswordBtn.setAttribute('aria-label', rotulo);
        });
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        erroEl.textContent = '';
        const email = document.getElementById('authEmail').value.trim();
        const senha = document.getElementById('authPassword').value;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Aguarde…';

        const acao = modoAuth === 'cadastro'
            ? auth.createUserWithEmailAndPassword(email, senha)
            : auth.signInWithEmailAndPassword(email, senha);

        acao
            .catch((err) => { erroEl.textContent = traduzirErroAuth(err.code); })
            .finally(() => {
                submitBtn.disabled = false;
                atualizarModo();
            });
    });

    document.getElementById('authResetBtn').addEventListener('click', () => {
        const email = document.getElementById('authEmail').value.trim();
        if (!email) { erroEl.textContent = 'Digite seu e-mail acima para receber o link de redefinição.'; return; }
        auth.sendPasswordResetEmail(email)
            .then(() => { erroEl.textContent = ''; alert('Enviamos um link de redefinição de senha para ' + email + '.'); })
            .catch((err) => { erroEl.textContent = traduzirErroAuth(err.code); });
    });
}

function sair() {
    const modalAberto = document.getElementById('modalBackdrop').style.display === 'flex';
    if (modalAberto && formularioTemAlteracoes()) {
        if (!confirm('Você tem um registro com alterações não salvas. Sair da conta agora vai descartá-las. Deseja continuar mesmo assim?')) return;
    } else if (!confirm('Sair da conta neste aparelho?')) {
        return;
    }
    if (modalAberto) fecharModal();
    auth.signOut();
}

// ------------------------------------------------------------
// Geolocalização
// ------------------------------------------------------------
function capturarLocalizacao() {
    const btn = document.getElementById('getLocationBtn');

    if (!navigator.geolocation) {
        alert('Seu navegador não suporta geolocalização.');
        return;
    }

    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            document.getElementById('entryLat').value = latitude;
            document.getElementById('entryLng').value = longitude;

            try {
                const controle = new AbortController();
                const timeoutId = setTimeout(() => controle.abort(), 8000);
                const resp = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=17&addressdetails=1`,
                    { signal: controle.signal }
                );
                clearTimeout(timeoutId);
                if (!resp.ok) throw new Error('Falha na resposta do serviço de endereço.');
                const dados = await resp.json();
                const campoLocal = document.getElementById('entryLocation');
                if (dados && dados.display_name) {
                    campoLocal.value = dados.display_name;
                } else if (!campoLocal.value) {
                    campoLocal.value = `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`;
                }
            } catch (err) {
                console.error('Erro ao buscar endereço a partir das coordenadas:', err);
                const campoLocal = document.getElementById('entryLocation');
                if (!campoLocal.value) {
                    campoLocal.value = `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = textoOriginal;
            }
        },
        (err) => {
            btn.disabled = false;
            btn.textContent = textoOriginal;
            let msg = 'Não foi possível obter sua localização.';
            if (err.code === err.PERMISSION_DENIED) msg = 'Permissão de localização negada. Habilite o acesso à localização nas configurações do navegador.';
            else if (err.code === err.TIMEOUT) msg = 'Tempo esgotado ao tentar obter a localização.';
            alert(msg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

// ------------------------------------------------------------
// Rascunho local + detecção de alterações não salvas
//
// Enquanto o modal de registro está aberto, cada alteração é salva
// (com debounce) no localStorage do aparelho. Se o app fechar
// inesperadamente (aba fechada sem querer, navegador travou, bateria
// acabou no meio de um ditado longo) o rascunho é oferecido de volta
// na próxima vez que esse mesmo registro (ou um novo) for aberto.
// Isso é só uma rede de segurança local — não substitui o Salvar.
// ------------------------------------------------------------
const PREFIXO_RASCUNHO = 'toth-rascunho-';

// Fonte única com os ids dos campos do formulário de registro. Antes esses
// mesmos 10 campos eram lidos/escritos "na mão" em quatro funções diferentes
// (rascunho, salvar, imprimir) — bastava adicionar um campo novo ao HTML
// para alguma dessas funções ficar desatualizada sem ninguém perceber.
// Agora só existe esta lista; lerCamposFormulario/preencherCamposFormulario
// e quem mais precisar dos campos usam ela.
const IDS_CAMPOS_FORMULARIO = [
    'entryType', 'entryDate', 'entryLocation', 'entryCode',
    'entrySummary', 'entryDetails', 'entryTags', 'entryStatus',
    'entryLat', 'entryLng',
];
const PADROES_CAMPOS_FORMULARIO = { entryType: 'atendimento', entryStatus: 'concluido' };

function lerCamposFormulario() {
    const campos = {};
    IDS_CAMPOS_FORMULARIO.forEach((id) => { campos[id] = document.getElementById(id).value; });
    return campos;
}

function preencherCamposFormulario(campos) {
    IDS_CAMPOS_FORMULARIO.forEach((id) => {
        const padrao = id === 'entryDate' ? dataLocalHoje() : (PADROES_CAMPOS_FORMULARIO[id] || '');
        document.getElementById(id).value = (campos && campos[id]) || padrao;
    });
}

function snapshotFormularioAtual() {
    return JSON.stringify(lerCamposFormulario());
}

// Compara o estado atual do formulário com a "foto" tirada quando o
// modal foi aberto. É a base tanto do aviso ao fechar quanto do
// aviso ao sair da página com o modal aberto.
function formularioTemAlteracoes() {
    if (!modalEntryKey) return false;
    return snapshotFormularioAtual() !== modalSnapshotInicial;
}

function salvarRascunhoLocal() {
    if (!modalEntryKey) return;
    try {
        localStorage.setItem(PREFIXO_RASCUNHO + modalEntryKey, JSON.stringify({
            campos: lerCamposFormulario(),
            quando: Date.now(),
        }));
    } catch (err) {
        // localStorage pode estar indisponível (modo privado, cota cheia etc.);
        // o rascunho é só uma rede de segurança extra, então apenas ignora.
    }
}

function lerRascunhoLocal(chave) {
    try {
        const bruto = localStorage.getItem(PREFIXO_RASCUNHO + chave);
        return bruto ? JSON.parse(bruto) : null;
    } catch (err) {
        return null;
    }
}

function limparRascunhoLocal(chave) {
    try { localStorage.removeItem(PREFIXO_RASCUNHO + chave); } catch (err) { /* ignora */ }
}

function formatarQuandoRascunho(ts) {
    const diffMin = Math.round((Date.now() - ts) / 60000);
    if (diffMin < 1) return 'agora há pouco';
    if (diffMin < 60) return `há ${diffMin} min`;
    return new Date(ts).toLocaleString('pt-BR');
}

// ------------------------------------------------------------
// Modal - abrir / fechar
// ------------------------------------------------------------
function abrirModal(id = null) {
    const modalBackdrop = document.getElementById('modalBackdrop');
    const entryForm = document.getElementById('entryForm');
    const deleteEntryBtn = document.getElementById('deleteEntryBtn');
    const printEntryBtn = document.getElementById('printEntryBtn');
    const modalTitle = document.getElementById('modalTitle');

    if (!modalBackdrop) return;
    if (window.pararDitadoPorVoz) window.pararDitadoPorVoz();
    modalBackdrop.style.display = 'flex';

    if (id) {
        const reg = registros.find(r => r.id === id);
        if (!reg) {
            modalBackdrop.style.display = 'none';
            mostrarToast('Este registro não foi encontrado (pode ter sido excluído em outro aparelho).', true);
            return;
        }
        modalTitle.textContent = 'Editar registro';
        document.getElementById('entryId').value = reg.id;
        document.getElementById('entryType').value = reg.entryType;
        document.getElementById('entryDate').value = reg.entryDate;
        document.getElementById('entryLocation').value = reg.entryLocation || '';
        document.getElementById('entryCode').value = reg.entryCode || '';
        document.getElementById('entrySummary').value = reg.entrySummary || '';
        document.getElementById('entryDetails').value = reg.entryDetails || '';
        document.getElementById('entryTags').value = reg.entryTags || '';
        document.getElementById('entryStatus').value = reg.entryStatus || 'concluido';
        document.getElementById('entryLat').value = reg.entryLat ?? '';
        document.getElementById('entryLng').value = reg.entryLng ?? '';
        deleteEntryBtn.style.display = 'inline-block';
        if (printEntryBtn) printEntryBtn.style.display = 'inline-block';
    } else {
        modalTitle.textContent = 'Novo registro';
        entryForm.reset();
        document.getElementById('entryId').value = '';
        document.getElementById('entryDate').value = dataLocalHoje();
        document.getElementById('entryLat').value = '';
        document.getElementById('entryLng').value = '';
        deleteEntryBtn.style.display = 'none';
        if (printEntryBtn) printEntryBtn.style.display = 'none';
    }

    // A partir daqui os campos refletem o registro salvo (ou um formulário
    // em branco). Essa é a "foto" usada para saber se algo foi alterado.
    modalEntryKey = id || 'novo';
    modalSnapshotInicial = snapshotFormularioAtual();

    // Se houver um rascunho salvo localmente para este mesmo registro (ou
    // para um novo registro), oferece recuperá-lo — cobre o caso de o app
    // ter sido fechado no meio de uma anotação antes de dar tempo de salvar.
    const rascunho = lerRascunhoLocal(modalEntryKey);
    if (rascunho && rascunho.campos) {
        const recuperar = confirm(
            `Encontramos um rascunho não salvo deste registro (${formatarQuandoRascunho(rascunho.quando)}).\n\nDeseja recuperá-lo?`
        );
        if (recuperar) {
            preencherCamposFormulario(rascunho.campos);
        } else {
            limparRascunhoLocal(modalEntryKey);
        }
    }
}

// Fecha o modal sem perguntar nada — usado internamente logo após um
// salvamento ou exclusão bem-sucedidos, quando não há mais nada a perder.
function fecharModal() {
    const modalBackdrop = document.getElementById('modalBackdrop');
    if (window.pararDitadoPorVoz) window.pararDitadoPorVoz();
    clearTimeout(draftTimeoutId);
    if (modalBackdrop) modalBackdrop.style.display = 'none';
    modalEntryKey = null;
    modalSnapshotInicial = '';
}

// Fecha o modal "pelo usuário" (X, Cancelar, clique fora, Esc): se houver
// alterações não salvas, confirma antes de descartar — para não perder
// uma observação longa (às vezes ditada) por um toque sem querer.
function tentarFecharModal() {
    if (formularioTemAlteracoes()) {
        const descartar = confirm('Você tem alterações não salvas neste registro. Deseja descartá-las?');
        if (!descartar) return;
        limparRascunhoLocal(modalEntryKey);
    } else if (modalEntryKey) {
        limparRascunhoLocal(modalEntryKey);
    }
    fecharModal();
}

// ------------------------------------------------------------
// Salvar / Excluir (agora gravam direto no Firestore)
// ------------------------------------------------------------
function salvarRegistro(e) {
    e.preventDefault();

    if (!currentUser) {
        alert('Sua sessão caiu. Faça login novamente para salvar este registro (o texto digitado não será perdido — apenas entre na conta e tente salvar de novo).');
        return;
    }

    // required do HTML não pega um resumo só com espaços; confere de novo aqui
    // para não salvar um registro sem título de verdade na lista.
    const campos = lerCamposFormulario();
    const resumo = campos.entrySummary.trim();
    if (!resumo) {
        alert('Preencha o resumo da atividade antes de salvar.');
        document.getElementById('entrySummary').focus();
        return;
    }

    const idAtual = document.getElementById('entryId').value;
    const id = idAtual || gerarId();
    const chaveRascunho = modalEntryKey;

    const reg = {
        entryType: campos.entryType,
        entryDate: campos.entryDate,
        entryLocation: campos.entryLocation.trim(),
        entryCode: campos.entryCode.trim(),
        entrySummary: resumo,
        entryDetails: campos.entryDetails,
        entryTags: campos.entryTags.trim(),
        entryStatus: campos.entryStatus,
        entryLat: campos.entryLat ? parseFloat(campos.entryLat) : null,
        entryLng: campos.entryLng ? parseFloat(campos.entryLng) : null,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const submitBtn = document.querySelector('#entryForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    db.collection('usuarios').doc(currentUser.uid).collection('registros').doc(id).set(reg, { merge: true })
        .then(() => {
            limparRascunhoLocal(chaveRascunho);
            fecharModal();
            mostrarToast('Registro salvo e sincronizado.');
        })
        .catch((err) => {
            console.error(err);
            // Não fecha o modal nem apaga o rascunho: se o erro não for de rede
            // (ex.: sem permissão), o usuário ainda pode copiar/tentar de novo
            // sem perder o que escreveu. Offline, o Firestore reenvia sozinho
            // quando a conexão voltar, mas só depois de o app conseguir
            // reabrir a mesma sessão — por segurança mantemos tudo na tela.
            alert('Não foi possível salvar agora: ' + (err.message || 'verifique sua conexão') + '\n\nO conteúdo continua aqui no formulário — tente salvar novamente.');
        })
        .finally(() => { if (submitBtn) submitBtn.disabled = false; });
}

function excluirRegistro() {
    if (!currentUser) {
        alert('Sua sessão caiu. Faça login novamente para excluir este registro.');
        return;
    }
    const id = document.getElementById('entryId').value;
    if (!id) return;
    if (!confirm('Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.')) return;

    const chaveRascunho = modalEntryKey;
    const btn = document.getElementById('deleteEntryBtn');
    if (btn) btn.disabled = true;

    db.collection('usuarios').doc(currentUser.uid).collection('registros').doc(id).delete()
        .then(() => {
            limparRascunhoLocal(chaveRascunho);
            fecharModal();
            mostrarToast('Registro excluído.');
        })
        .catch((err) => {
            console.error(err);
            alert('Não foi possível excluir agora: ' + err.message);
        })
        .finally(() => { if (btn) btn.disabled = false; });
}

// ------------------------------------------------------------
// Toast simples
// ------------------------------------------------------------
function mostrarToast(msg, erro = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.toggle('error', erro);
    toast.classList.add('show');
    clearTimeout(mostrarToast._t);
    mostrarToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ------------------------------------------------------------
// Listagem / filtro / busca / contadores
// ------------------------------------------------------------
function correspondeAoFiltro(reg) {
    if (filtroAtual === 'todos') return true;
    if (filtroAtual === 'pendente') return reg.entryStatus === 'acompanhamento';
    return reg.entryType === filtroAtual;
}

function atualizarContadores() {
    const contagens = { todos: registros.length, atendimento: 0, visita: 0, visitatecnica: 0, grupo: 0, pendente: 0 };
    registros.forEach(reg => {
        if (contagens[reg.entryType] !== undefined) contagens[reg.entryType]++;
        if (reg.entryStatus === 'acompanhamento') contagens.pendente++;
    });
    Object.keys(contagens).forEach(chave => {
        const el = document.getElementById(`count-${chave}`);
        if (el) el.textContent = contagens[chave];
    });
}

function renderizar() {
    const entryList = document.getElementById('entryList');
    const emptyState = document.getElementById('emptyState');
    if (!entryList) return;

    atualizarContadores();

    const busca = termoBusca.toLowerCase();
    const filtrados = registros.filter(reg => {
        // Usa "" como padrão para cada campo: sem isso, um registro sem
        // algum desses campos (ex.: mais antigo, salvo antes de o campo
        // existir) fazia o JavaScript escrever a palavra "undefined" no
        // texto buscável, poluindo a busca.
        const texto = `${reg.entryLocation || ''} ${reg.entryCode || ''} ${reg.entrySummary || ''} ${reg.entryTags || ''}`.toLowerCase();
        return correspondeAoFiltro(reg) && texto.includes(busca);
    });

    filtrados.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    entryList.style.display = filtrados.length ? 'grid' : 'none';

    if (emptyState) {
        emptyState.style.display = filtrados.length ? 'none' : 'flex';
        if (!filtrados.length) {
            const titulo = document.getElementById('emptyStateTitle');
            const texto = document.getElementById('emptyStateText');
            const botaoNovo = document.getElementById('emptyNewEntryBtn');
            const carimbo = document.getElementById('emptyStateStamp');
            if (carregandoRegistros && registros.length === 0) {
                if (titulo) titulo.textContent = 'Carregando seus registros…';
                if (texto) texto.textContent = 'Aguarde enquanto sincronizamos com sua conta.';
                if (botaoNovo) botaoNovo.style.display = 'none';
                if (carimbo) carimbo.classList.add('spinning');
            } else {
                if (titulo) titulo.textContent = 'Comece seu diário de campo';
                if (texto) texto.textContent = 'Registre atendimentos, visitas e grupos para acompanhar seu trabalho com mais clareza e cuidado.';
                if (botaoNovo) botaoNovo.style.display = '';
                if (carimbo) carimbo.classList.remove('spinning');
            }
        }
    }

    entryList.innerHTML = filtrados.map(reg => `
        <div class="entry-card" data-type="${escapeHtml(reg.entryType)}" data-status="${escapeHtml(reg.entryStatus)}" onclick="abrirModal('${reg.id}')">
            <div class="entry-card-head">
                <span class="entry-type-badge entry-type-${escapeHtml(reg.entryType)}">${escapeHtml(LABELS_TIPO[reg.entryType] || reg.entryType)}</span>
                <span class="entry-date">${formatarData(reg.entryDate)}</span>
            </div>
            <h3 class="entry-title">${escapeHtml(reg.entrySummary)}</h3>
            <p class="entry-meta">${escapeHtml(reg.entryLocation || '')}${reg.entryCode ? ' · ' + escapeHtml(reg.entryCode) : ''}</p>
            ${(reg.entryLat && reg.entryLng) ? `<a href="https://www.google.com/maps?q=${reg.entryLat},${reg.entryLng}" target="_blank" rel="noopener" class="entry-map-link" onclick="event.stopPropagation()">Ver no mapa ↗</a>` : ''}
            ${reg.entryStatus === 'acompanhamento' ? '<span class="entry-status-flag">Acompanhamento pendente</span>' : ''}
        </div>
    `).join('');
}

// ------------------------------------------------------------
// Imprimir um único registro (botão 🖨️ Imprimir no modal de edição)
// ------------------------------------------------------------
function imprimirRegistroAtual() {
    // Lê os valores atuais do formulário (não o registro salvo em
    // `registros`), para que qualquer edição feita na tela — mesmo sem
    // ter clicado em "Salvar" ainda — apareça corretamente na impressão.
    const campos = lerCamposFormulario();
    const reg = { ...campos, entryLat: campos.entryLat || null, entryLng: campos.entryLng || null };

    const win = window.open('', '_blank');
    if (!win) {
        alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.');
        return;
    }

    const html = `<html><head><meta charset="utf-8"><title>Registro — ${escapeHtml(reg.entrySummary || '')}</title><style>
        ${CSS_PAGINA_CADERNO}
    </style></head><body>${montarBlocoConteudoRegistro(reg)}</body></html>`;

    win.document.write(html);
    win.document.close();

    // Espera o conteúdo terminar de carregar antes de imprimir, em vez de
    // um tempo fixo — que podia cortar observações longas em aparelhos
    // mais lentos (mesmo ajuste já usado em exportarPDFViaImpressao).
    const acionarImpressao = () => { win.print(); win.close(); };
    if (win.document.readyState === 'complete') {
        setTimeout(acionarImpressao, 150);
    } else {
        win.addEventListener('load', () => setTimeout(acionarImpressao, 150));
    }
}

// ------------------------------------------------------------
// CSS compartilhado: folha de caderno estilo Toth (pauta horizontal +
// linha de margem dourada) usada nas páginas HTML impressas pelo
// navegador (registro avulso e alternativa de PDF via impressão).
// ------------------------------------------------------------
const CSS_PAGINA_CADERNO = `
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    html, body, .folha {
        /* Sem isso, a maioria dos navegadores some com cores/imagens de
           fundo ao imprimir (só imprimem o texto), então a folha pautada
           e a margem dourada podiam desaparecer justamente na 2ª folha
           em diante. Força o fundo a ser sempre impresso. */
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
    }
    body {
        font-family: Arial, sans-serif;
        padding: 20px 20px 20px 34px;
        color: #2b2013;
        overflow-wrap: break-word;
        word-break: break-word;
        background-color: #fdf6e3;
        background-image:
            linear-gradient(90deg, transparent 0 27px, rgba(201,154,58,.65) 27px, rgba(201,154,58,.65) 28.5px, transparent 28.5px),
            repeating-linear-gradient(to bottom, transparent 0, transparent 25px, rgba(93,34,214,.16) 26px);
        background-repeat: no-repeat, repeat;
        background-position: 0 0, 0 6px;
    }
    h1 { font-size: 18px; color: #5d22d6; page-break-after: avoid; }
    h2 { font-size: 15px; margin: 4px 0; page-break-after: avoid; }
    .meta { color: #6b5c40; font-size: 11px; page-break-after: avoid; }
    .campo { margin: 4px 0; page-break-after: avoid; }
    .obs { white-space: pre-wrap; margin-top: 10px; line-height: 26px; orphans: 3; widows: 3; }
    /* Um registro pode ter uma observação longa e precisar de mais de uma
       folha A4 — antes "page-break-inside: avoid" forçava o navegador a
       tentar manter cada registro inteiro numa única folha mesmo quando o
       texto não cabia, o que cortava/bugava o conteúdo que sobrava. Agora
       cada registro só começa numa folha nova (page-break-before) e, dali
       em diante, quebra livremente por quantas folhas forem necessárias. */
    .folha {
        padding: 0 0 18px;
        margin-bottom: 18px;
        border-bottom: 1px dashed rgba(201,154,58,.6);
        page-break-before: always;
        page-break-inside: auto;
        overflow-wrap: break-word;
        word-break: break-word;
        hyphens: auto;
    }
    .folha:first-child { page-break-before: avoid; }
    .folha:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
`;

// Bloco de HTML com o conteúdo de um único registro, usado tanto pela
// impressão de um registro avulso (imprimirRegistroAtual) quanto pela
// alternativa de PDF via impressão do navegador (exportarPDFViaImpressao).
// Antes esse mesmo bloco existia duplicado (e ligeiramente diferente) nas
// duas funções; agora tem uma única versão para as duas.
function montarBlocoConteudoRegistro(reg) {
    return `
        <h1>Caderno de Campo — Paulo Xavier</h1>
        <p class="meta">${formatarData(reg.entryDate)} — ${escapeHtml(LABELS_TIPO[reg.entryType] || reg.entryType)} — ${escapeHtml(LABELS_STATUS[reg.entryStatus] || reg.entryStatus)}</p>
        <h2>${escapeHtml(reg.entrySummary)}</h2>
        <p class="campo"><strong>Local/Instituição:</strong> ${escapeHtml(reg.entryLocation || '—')}</p>
        <p class="campo"><strong>Código do caso/sujeito:</strong> ${escapeHtml(reg.entryCode || '—')}</p>
        <p class="campo"><strong>Tags:</strong> ${escapeHtml(reg.entryTags || '—')}</p>
        ${(reg.entryLat && reg.entryLng) ? `<p class="campo"><strong>Coordenadas:</strong> ${reg.entryLat}, ${reg.entryLng}</p>` : ''}
        <p class="obs">${escapeHtml(reg.entryDetails || '')}</p>
    `;
}

// ------------------------------------------------------------
// Exportações (continuam operando sobre os dados já sincronizados)
// ------------------------------------------------------------
function baixarArquivo(conteudo, nomeArquivo, mimeType) {
    const blob = new Blob([conteudo], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportarJSON() {
    if (registros.length === 0) return alert('Nenhum registro para exportar.');
    baixarArquivo(JSON.stringify(registros, null, 2), `caderno-campo-backup-${dataLocalHoje()}.json`, 'application/json');
}

function exportarCSV() {
    if (registros.length === 0) return alert('Nenhum registro para exportar.');
    const colunas = ['entryDate', 'entryType', 'entryStatus', 'entryLocation', 'entryCode', 'entrySummary', 'entryTags', 'entryDetails'];
    const cabecalho = ['Data', 'Tipo', 'Status', 'Local', 'Código', 'Resumo', 'Tags', 'Observações'];

    const escapeCsv = (v) => {
        const s = String(v ?? '');
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const linhas = [cabecalho.join(';')];
    registros.forEach(reg => {
        linhas.push(colunas.map(c => escapeCsv(reg[c])).join(';'));
    });

    baixarArquivo('\uFEFF' + linhas.join('\n'), `caderno-campo-${dataLocalHoje()}.csv`, 'text/csv;charset=utf-8');
}

function exportarWord() {
    if (registros.length === 0) return alert('Nenhum registro para exportar.');

    const ordenados = [...registros].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    // Cada registro vira uma "folha de caderno": fundo pergaminho com pauta
    // horizontal (linhas repetidas) e uma linha de margem dourada à esquerda,
    // no mesmo espírito visual do restante do app (identidade Toth).
    const estiloPauta = "background-color:#fdf6e3; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 25px, rgba(93,34,214,.18) 26px);";

    let corpo = ordenados.map((reg, indice) => `
        <div style="margin:0 0 22px; padding:14px 16px 16px 22px; border-left:3px solid #c99a3a; border-radius:2px; word-wrap:break-word; ${indice > 0 ? 'page-break-before:always; mso-page-break-before:always;' : ''} ${estiloPauta}">
            <p style="font-size:11pt; color:#6b5c40; margin:0;">${formatarData(reg.entryDate)} — ${escapeHtml(LABELS_TIPO[reg.entryType] || reg.entryType)} — ${escapeHtml(LABELS_STATUS[reg.entryStatus] || reg.entryStatus)}</p>
            <h2 style="margin:4px 0; word-wrap:break-word; color:#5d22d6;">${escapeHtml(reg.entrySummary)}</h2>
            <p style="margin:2px 0;"><strong>Local/Instituição:</strong> ${escapeHtml(reg.entryLocation || '—')}</p>
            <p style="margin:2px 0;"><strong>Código do caso/sujeito:</strong> ${escapeHtml(reg.entryCode || '—')}</p>
            <p style="margin:2px 0;"><strong>Tags:</strong> ${escapeHtml(reg.entryTags || '—')}</p>
            ${(reg.entryLat && reg.entryLng) ? `<p style="margin:2px 0; font-size:9pt;"><strong>Coordenadas:</strong> ${reg.entryLat}, ${reg.entryLng}</p>` : ''}
            <p style="margin-top:8px; white-space:pre-wrap; word-wrap:break-word; line-height:26px;">${escapeHtml(reg.entryDetails || '')}</p>
        </div>
    `).join('');

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset="utf-8"><title>Caderno de Campo</title></head>
        <body style="font-family: Calibri, Arial, sans-serif; word-wrap:break-word; background-color:#efe1c3; padding:12px;">
            <h1 style="color:#5d22d6;">Caderno de Campo — Paulo Xavier</h1>
            ${corpo}
        </body></html>`;

    // O BOM (\uFEFF) no início ajuda o Word a reconhecer corretamente que o
    // conteúdo está em UTF-8 — sem ele, algumas versões do Word podem exibir
    // acentos e cedilhas corrompidos (ex.: "atenção" virando "atenÃ§Ã£o").
    baixarArquivo('\uFEFF' + html, `caderno-campo-${dataLocalHoje()}.doc`, 'application/msword');
}

// A versão anterior desta função abria uma aba nova e chamava a caixa de
// impressão do navegador, torcendo para o usuário escolher "Salvar como
// PDF". Isso é frágil: bloqueadores de pop-up podem barrar a aba, um
// tempo fixo de espera podia cortar o conteúdo antes de terminar de
// carregar, e — o mais importante — como o app roda como aplicativo
// instalado ("standalone") no celular, abrir aba + imprimir é justamente
// um dos cenários que mais falha no iPhone (a aba pode abrir em branco ou
// nem oferecer a opção de salvar como PDF).
// Por isso agora o PDF é gerado de verdade no próprio navegador (com a
// biblioteca jsPDF) e baixado direto, do mesmo jeito que o JSON/CSV/Word —
// sem depender de pop-up nem de caixa de impressão.
function exportarPDF() {
    if (registros.length === 0) return alert('Nenhum registro para exportar.');

    if (!(window.jspdf && window.jspdf.jsPDF)) {
        // Sem internet no primeiro carregamento a biblioteca de PDF pode não
        // ter chegado a baixar; nesse caso, cai para o método antigo
        // (imprimir/salvar como PDF) em vez de simplesmente não fazer nada.
        console.warn('jsPDF indisponível — usando o método de impressão como alternativa.');
        return exportarPDFViaImpressao();
    }

    try {
        gerarPDFComJsPDF();
    } catch (err) {
        // Se algo inesperado der errado gerando o PDF (registro com dado
        // fora do padrão, biblioteca instável etc.), cai para o método de
        // impressão em vez de deixar o botão simplesmente não fazer nada.
        console.error('Erro ao gerar PDF com jsPDF — usando o método de impressão como alternativa:', err);
        exportarPDFViaImpressao();
    }
}

function gerarPDFComJsPDF() {
    const ordenados = [...registros].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margem = 18;
    const larguraPagina = doc.internal.pageSize.getWidth();
    const larguraUtil = larguraPagina - margem * 2;
    const alturaPagina = doc.internal.pageSize.getHeight();
    let y = margem;

    // Desenha o fundo de "folha de caderno" na página atual: cor
    // pergaminho, moldura como os cartões da tela, pauta horizontal e uma
    // linha de margem dourada à esquerda — para o PDF ter a mesma
    // identidade visual do resto do app (antes as linhas eram finas e
    // claras demais e a folha acabava saindo praticamente em branco).
    function desenharFundoCaderno() {
        doc.setFillColor(253, 246, 227);
        doc.rect(0, 0, larguraPagina, alturaPagina, 'F');

        // Selo circular discreto no canto, ecoando o emblema redondo e
        // dourado do ícone do app — só um detalhe de fundo, bem claro,
        // não deve competir com o texto.
        doc.setDrawColor(230, 214, 180);
        doc.setLineWidth(2.2);
        doc.circle(larguraPagina - 24, 24, 13, 'S');
        doc.setDrawColor(222, 205, 240);
        doc.setLineWidth(1.2);
        doc.circle(larguraPagina - 24, 24, 17, 'S');

        // Faixa de cor da marca (violeta > azul > dourado) entre a borda
        // da página e a moldura, como um cabeçalho de caderno.
        const alturaFaixa = 2.2;
        const terco = (larguraPagina - 16) / 3;
        doc.setFillColor(93, 34, 214);
        doc.rect(8, 4, terco, alturaFaixa, 'F');
        doc.setFillColor(5, 121, 248);
        doc.rect(8 + terco, 4, terco, alturaFaixa, 'F');
        doc.setFillColor(201, 154, 58);
        doc.rect(8 + terco * 2, 4, terco, alturaFaixa, 'F');

        // Moldura da folha, como os cartões (.entry-card / .auth-card) na tela
        doc.setDrawColor(201, 154, 58);
        doc.setLineWidth(0.5);
        doc.roundedRect(8, 8, larguraPagina - 16, alturaPagina - 16, 3, 3, 'S');

        // Pauta horizontal — mais grossa e mais escura que antes para
        // realmente aparecer na tela e na impressão, não só de perto.
        doc.setDrawColor(205, 182, 230);
        doc.setLineWidth(0.3);
        for (let linhaY = margem + 6; linhaY < alturaPagina - margem + 4; linhaY += 6) {
            doc.line(margem - 2, linhaY, larguraPagina - margem + 2, linhaY);
        }

        // Linha de margem dourada, como um caderno pautado de verdade
        doc.setDrawColor(201, 154, 58);
        doc.setLineWidth(0.7);
        doc.line(margem - 6, 12, margem - 6, alturaPagina - 12);
    }

    function novaPagina() {
        doc.addPage();
        desenharFundoCaderno();
        y = margem;
    }

    desenharFundoCaderno();

    // Escreve um bloco de texto, quebrando linhas pela largura da página e
    // pulando de página automaticamente quando o conteúdo não couber —
    // é essa parte que o método antigo (baseado só em CSS de impressão)
    // não garantia de forma confiável.
    function escreverParagrafo(texto, opcoes = {}) {
        const { tamanho = 10, estilo = 'normal', cor = [20, 20, 20], espacamentoAntes = 0, entrelinha = 5 } = opcoes;
        if (!texto) return;
        y += espacamentoAntes;
        doc.setFont('helvetica', estilo);
        doc.setFontSize(tamanho);
        doc.setTextColor(cor[0], cor[1], cor[2]);
        const linhas = doc.splitTextToSize(String(texto), larguraUtil);
        linhas.forEach((linha) => {
            if (y + entrelinha > alturaPagina - margem) novaPagina();
            doc.text(linha, margem, y);
            y += entrelinha;
        });
    }

    ordenados.forEach((reg, indice) => {
        if (indice > 0) novaPagina();

        escreverParagrafo('Caderno de Campo — Paulo Xavier', { tamanho: 13, estilo: 'bold', entrelinha: 6 });
        escreverParagrafo(
            `${formatarData(reg.entryDate)} — ${LABELS_TIPO[reg.entryType] || reg.entryType} — ${LABELS_STATUS[reg.entryStatus] || reg.entryStatus}`,
            { tamanho: 9, cor: [90, 90, 90], espacamentoAntes: 1, entrelinha: 4.5 }
        );
        escreverParagrafo(reg.entrySummary || '', { tamanho: 12, estilo: 'bold', espacamentoAntes: 3, entrelinha: 6 });
        escreverParagrafo(`Local/Instituição: ${reg.entryLocation || '—'}`, { espacamentoAntes: 3, entrelinha: 6 });
        escreverParagrafo(`Código do caso/sujeito: ${reg.entryCode || '—'}`, { entrelinha: 6 });
        escreverParagrafo(`Tags: ${reg.entryTags || '—'}`, { entrelinha: 6 });
        if (reg.entryLat && reg.entryLng) {
            escreverParagrafo(`Coordenadas: ${reg.entryLat}, ${reg.entryLng}`, { tamanho: 9, cor: [90, 90, 90], entrelinha: 6 });
        }
        escreverParagrafo(reg.entryDetails || '', { espacamentoAntes: 4, entrelinha: 6 });
    });

    doc.save(`caderno-campo-${dataLocalHoje()}.pdf`);
}

// Alternativa de reserva (mesma técnica da versão anterior): usada só se a
// biblioteca de gerar PDF não estiver disponível por algum motivo.
function exportarPDFViaImpressao() {
    const win = window.open('', '_blank');
    if (!win) {
        alert('Não foi possível gerar o PDF agora (biblioteca indisponível) nem abrir a janela de impressão como alternativa. Verifique sua conexão e tente novamente.');
        return;
    }

    const ordenados = [...registros].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    let html = `<html><head><meta charset="utf-8"><style>
        ${CSS_PAGINA_CADERNO}
    </style></head><body>`;

    ordenados.forEach(reg => {
        html += `<div class="folha">${montarBlocoConteudoRegistro(reg)}</div>`;
    });

    html += `</body></html>`;
    win.document.write(html);
    win.document.close();

    // Espera o conteúdo terminar de carregar (em vez de um tempo fixo) antes
    // de mandar imprimir, para não cortar registros longos pela metade.
    const acionarImpressao = () => { win.print(); win.close(); };
    if (win.document.readyState === 'complete') {
        setTimeout(acionarImpressao, 150);
    } else {
        win.addEventListener('load', () => setTimeout(acionarImpressao, 150));
    }
}

// ------------------------------------------------------------
// Importar backup (JSON) — agora envia para o Firestore em lote
// ------------------------------------------------------------
function importarBackup(file) {
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        let dados;
        try {
            dados = JSON.parse(e.target.result);
        } catch (err) {
            alert('Arquivo inválido. Selecione um backup .json exportado por este aplicativo.');
            return;
        }
        if (!Array.isArray(dados)) {
            alert('Formato de backup não reconhecido.');
            return;
        }

        const substituirTudo = !confirm(
            `Encontrados ${dados.length} registro(s) no backup.\n\nClique "OK" para MESCLAR com os registros já sincronizados.\nClique "Cancelar" para SUBSTITUIR todos os registros atuais por este backup.`
        );
        // (confirm invertido: OK -> mesclar (não substitui), Cancelar -> substitui)
        const substituir = substituirTudo;

        const colecao = db.collection('usuarios').doc(currentUser.uid).collection('registros');

        const executarImportacao = async () => {
            if (substituir) {
                const existentes = await colecao.get();
                const batchDel = db.batch();
                existentes.forEach(doc => batchDel.delete(doc.ref));
                await batchDel.commit();
            }

            const lotes = [];
            let batchAtual = db.batch();
            let contador = 0;
            dados.forEach((reg) => {
                const id = (reg && reg.id) || gerarId();
                const { id: _omit, ...dadosSemId } = reg || {};
                batchAtual.set(colecao.doc(id), dadosSemId, { merge: true });
                contador++;
                if (contador % 400 === 0) { lotes.push(batchAtual); batchAtual = db.batch(); }
            });
            lotes.push(batchAtual);
            for (const lote of lotes) { await lote.commit(); }
        };

        executarImportacao()
            .then(() => alert('Backup importado e sincronizado com sucesso.'))
            .catch((err) => {
                console.error(err);
                alert('Ocorreu um erro ao importar o backup: ' + err.message);
            });
    };
    reader.onerror = () => alert('Não foi possível ler o arquivo selecionado.');
    reader.readAsText(file);
}

// ------------------------------------------------------------
// Ditado por voz — transcreve a fala em tempo real direto no
// campo de Observações Técnicas/Psicossociais (Web Speech API).
// Não grava nem guarda o áudio: tudo vira texto na hora.
//
// Revisado para uso intenso (é o recurso mais usado no dia a dia):
// - Insere o texto ditado na posição do cursor, preservando o que
//   já existir depois dele (antes, ditar sempre jogava tudo no fim).
// - Mostra o tempo de gravação em andamento.
// - Uma falha de permissão/rede/microfone não é mais apagada pela
//   mensagem genérica "Transcrição concluída." que vinha logo depois.
// - Para de tentar reiniciar sozinho após falhas repetidas seguidas,
//   em vez de entrar num loop de reinícios (ex.: microfone ocupado).
// - Pode ser interrompido de fora (ex.: ao fechar o modal) para nunca
//   deixar o microfone escutando em segundo plano.
// ------------------------------------------------------------
function configurarDitadoPorVoz() {
    const botao = document.getElementById('dictateBtn');
    const statusEl = document.getElementById('dictateStatus');
    const textarea = document.getElementById('entryDetails');
    if (!botao || !textarea) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
        botao.disabled = true;
        botao.title = 'Ditado por voz não é compatível com este navegador (use o Chrome no Android ou no computador).';
        statusEl.textContent = 'Ditado por voz indisponível neste navegador.';
        return;
    }

    const reconhecimento = new SpeechRecognitionAPI();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = true;
    reconhecimento.interimResults = true;

    let gravando = false;
    let iniciando = false;    // evita cliques duplicados entre o pedido de start() e o onstart
    let paradaManual = false;
    let textoAntes = '';      // texto já existente antes do cursor, preservado
    let textoDepois = '';     // texto já existente depois do cursor, preservado
    let transcricaoFinal = ''; // trechos confirmados na sessão de ditado atual
    let mensagemFinal = '';   // mensagem de erro a manter visível quando a gravação encerrar
    let falhasSeguidas = 0;   // conta reinícios automáticos sem sucesso, evita loop
    let inicioGravacao = 0;
    let timerId = null;

    function juntarTexto(base, adicional) {
        if (!adicional) return base;
        // O Chrome costuma devolver os trechos de continuação já com um
        // espaço no início (" palavra"). Sem remover esse espaço aqui,
        // o espaço que a gente mesmo adiciona abaixo vira espaço duplo
        // ("frase  outra") — por isso limpa antes de juntar.
        const limpo = adicional.replace(/^\s+/, '');
        if (!limpo) return base;
        if (!base) return limpo;
        return /\s$/.test(base) ? base + limpo : base + ' ' + limpo;
    }

    function formatarDuracao(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function atualizarTimer() {
        statusEl.textContent = `🔴 Gravando... ${formatarDuracao(Date.now() - inicioGravacao)}`;
    }

    function ligarUI() {
        botao.classList.add('recording');
        botao.textContent = '⏹️';
        botao.title = 'Parar ditado';
        botao.setAttribute('aria-label', 'Parar ditado');
        statusEl.classList.add('active');
        // Só zera o cronômetro quando é de fato o início de uma sessão
        // nova de ditado (timerId ainda null). Quando o reconhecimento
        // reinicia sozinho no meio do ditado (silêncio, limite de tempo
        // do navegador etc.), este mesmo onstart é chamado de novo — sem
        // essa checagem o tempo mostrado voltava para 0:00 a cada
        // reinício, em vez de mostrar o tempo total do ditado.
        if (!timerId) {
            inicioGravacao = Date.now();
            atualizarTimer();
            timerId = setInterval(atualizarTimer, 1000);
        }
    }

    function desligarUI(mensagem) {
        botao.classList.remove('recording');
        botao.textContent = '🎙️';
        botao.title = 'Ditar por voz';
        botao.setAttribute('aria-label', 'Ditar por voz');
        statusEl.classList.remove('active');
        clearInterval(timerId);
        timerId = null;
        statusEl.textContent = mensagem || '';
    }

    // Captura onde o ditado deve entrar: na posição do cursor (ou da
    // seleção, que é substituída), guardando o que vem antes e depois.
    function prepararInsercao() {
        const inicio = textarea.selectionStart ?? textarea.value.length;
        const fim = textarea.selectionEnd ?? textarea.value.length;
        textoAntes = textarea.value.slice(0, inicio);
        textoDepois = textarea.value.slice(fim);
        transcricaoFinal = '';
    }

    function pararDitado() {
        if (!gravando) return;
        paradaManual = true;
        try { reconhecimento.stop(); } catch (err) { /* já parado, ignora */ }
    }
    // Exposto para o resto do app conseguir interromper o ditado por
    // fora (ex.: ao fechar/trocar o modal), sem deixar o mic ligado.
    window.pararDitadoPorVoz = pararDitado;

    botao.addEventListener('click', () => {
        if (iniciando) return;
        if (gravando) { pararDitado(); return; }
        try {
            iniciando = true;
            paradaManual = false;
            mensagemFinal = '';
            falhasSeguidas = 0;
            prepararInsercao();
            reconhecimento.start();
        } catch (err) {
            iniciando = false;
            console.error('Erro ao iniciar o ditado:', err);
        }
    });

    reconhecimento.onstart = () => {
        iniciando = false;
        gravando = true;
        ligarUI();
    };

    reconhecimento.onresult = (event) => {
        // Zera o contador de falhas aqui, não no onstart: "iniciar" não
        // significa que está funcionando. Se o reconhecimento começa e
        // falha de novo em seguida, sem nunca chegar a reconhecer nada,
        // isso já é um problema real — zerar no onstart escondia essas
        // falhas e o ditado ficava reiniciando escuta pra sempre sem
        // nunca avisar o usuário.
        falhasSeguidas = 0;
        let interino = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const trecho = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                transcricaoFinal = juntarTexto(transcricaoFinal, trecho);
            } else {
                // Também usa juntarTexto aqui: em alguns navegadores mais
                // de um trecho "provisório" pode chegar no mesmo evento,
                // e concatenar direto (interino += trecho) grudava as
                // palavras sem espaço entre elas.
                interino = juntarTexto(interino, trecho);
            }
        }
        const meio = juntarTexto(transcricaoFinal, interino);
        const precisaEspaco = meio && textoDepois && !/[\s\n]$/.test(meio) && !/^[\s\n]/.test(textoDepois);
        textarea.value = textoAntes + meio + (precisaEspaco ? ' ' : '') + textoDepois;
        const posicaoCursor = (textoAntes + meio).length;
        textarea.setSelectionRange(posicaoCursor, posicaoCursor);
    };

    reconhecimento.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            mensagemFinal = 'Permissão de microfone negada. Habilite o acesso ao microfone nas configurações do navegador.';
            paradaManual = true;
        } else if (event.error === 'audio-capture') {
            mensagemFinal = 'Nenhum microfone encontrado. Verifique se há um microfone conectado e liberado para o navegador.';
            paradaManual = true;
        } else if (event.error === 'network') {
            mensagemFinal = 'Sem conexão para transcrever agora. Verifique a internet e tente novamente.';
            paradaManual = true;
        } else if (event.error === 'no-speech') {
            // Silêncio momentâneo, é normal durante o ditado: o onend decide se reinicia.
        } else if (event.error === 'aborted') {
            // Se foi o próprio usuário quem parou (paradaManual já true), não faz nada.
            // Se foi inesperado, conta como falha para não entrar num loop de reinícios.
            if (!paradaManual) falhasSeguidas++;
        } else {
            console.warn('Erro no ditado por voz:', event.error);
            falhasSeguidas++;
        }
        // Depois de falhas repetidas sem conseguir gravar, desiste de
        // reiniciar sozinho para não travar tentando de novo sem parar.
        if (falhasSeguidas >= 3 && !paradaManual) {
            mensagemFinal = mensagemFinal || 'Não foi possível continuar o ditado. Toque no microfone para tentar de novo.';
            paradaManual = true;
        }
    };

    reconhecimento.onend = () => {
        gravando = false;
        iniciando = false;
        // O reconhecimento do navegador se encerra sozinho após um tempo
        // ou um trecho de silêncio; se o usuário não pediu para parar e
        // não houve erro que precise de atenção, reinicia automaticamente
        // para continuar ditando sem esforço — preservando tudo o que já
        // foi escrito e a posição em que o texto está entrando.
        if (!paradaManual) {
            textoAntes = textarea.value.slice(0, textarea.value.length - textoDepois.length);
            transcricaoFinal = '';
            try {
                iniciando = true;
                reconhecimento.start();
            } catch (err) {
                iniciando = false;
                desligarUI(mensagemFinal || 'O ditado foi interrompido. Toque no microfone para continuar.');
            }
        } else {
            desligarUI(mensagemFinal || 'Transcrição concluída.');
            if (!mensagemFinal) {
                setTimeout(() => { if (!gravando) statusEl.textContent = ''; }, 3000);
            }
        }
    };
}

// ------------------------------------------------------------
// Inicialização de eventos
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    configurarFormAuth();
    configurarDitadoPorVoz();
    renderizar();

    document.getElementById('logoutBtn').addEventListener('click', sair);

    // Formulário
    document.getElementById('entryForm').addEventListener('submit', salvarRegistro);
    document.getElementById('deleteEntryBtn').addEventListener('click', excluirRegistro);
    document.getElementById('printEntryBtn').addEventListener('click', imprimirRegistroAtual);
    document.getElementById('getLocationBtn').addEventListener('click', capturarLocalizacao);
    document.getElementById('closeModalBtn').addEventListener('click', tentarFecharModal);
    document.getElementById('cancelModalBtn').addEventListener('click', tentarFecharModal);

    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
        if (e.target.id === 'modalBackdrop') tentarFecharModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('modalBackdrop').style.display === 'flex') {
            tentarFecharModal();
        }
    });

    // Salva um rascunho local (debounced) a cada alteração no formulário,
    // enquanto o modal estiver aberto — ver "Rascunho local" acima.
    ['input', 'change'].forEach((evento) => {
        document.getElementById('entryForm').addEventListener(evento, () => {
            clearTimeout(draftTimeoutId);
            draftTimeoutId = setTimeout(salvarRascunhoLocal, 600);
        });
    });

    // Se o usuário fechar a aba/atualizar a página com o modal aberto e
    // alterações não salvas, o navegador pergunta antes de sair (o texto
    // exato é controlado pelo próprio navegador, não pelo app). O rascunho
    // já foi salvo pelo listener acima, então mesmo se ele sair mesmo assim
    // o conteúdo pode ser recuperado da próxima vez que abrir este registro.
    window.addEventListener('beforeunload', (e) => {
        if (window.pararDitadoPorVoz) window.pararDitadoPorVoz();
        if (document.getElementById('modalBackdrop').style.display === 'flex' && formularioTemAlteracoes()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    document.getElementById('newEntryBtn').addEventListener('click', () => abrirModal());
    document.getElementById('emptyNewEntryBtn').addEventListener('click', () => abrirModal());

    let debounceBusca = null;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const valor = e.target.value;
        clearTimeout(debounceBusca);
        debounceBusca = setTimeout(() => {
            termoBusca = valor;
            renderizar();
        }, 200);
    });

    document.querySelectorAll('#filterTabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#filterTabs .tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-pressed', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-pressed', 'true');
            filtroAtual = tab.dataset.filter;
            renderizar();
        });
    });

    document.getElementById('exportJsonBtn').addEventListener('click', exportarJSON);
    document.getElementById('exportCsvBtn').addEventListener('click', exportarCSV);
    document.getElementById('exportWordBtn').addEventListener('click', exportarWord);
    document.getElementById('exportPdfBtn').addEventListener('click', exportarPDF);

    document.getElementById('importFile').addEventListener('change', (e) => {
        importarBackup(e.target.files[0]);
        e.target.value = '';
    });
});
