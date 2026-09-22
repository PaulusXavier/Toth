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
  apiKey: "AIzaSyA7poux4vbiIymLOH0x50V7BLGHDAFCIjM",
  authDomain: "caderno-de-campo-px.firebaseapp.com",
  projectId: "caderno-de-campo-px",
  storageBucket: "caderno-de-campo-px.firebasestorage.app",
  messagingSenderId: "1098711611929",
  appId: "1:1098711611929:web:27ec24d655943ee0894888",
  measurementId: "G-2WKZ2GJQ2V"
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
let modoAuth = 'entrar'; // 'entrar' | 'cadastro'

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
    unsubscribeSnapshot = colecao.onSnapshot(
        (snapshot) => {
            registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderizar();
            atualizarStatusSync(navigator.onLine ? 'sincronizado' : 'offline');
        },
        (err) => {
            console.error('Erro na sincronização:', err);
            atualizarStatusSync('erro');
        }
    );
}

function pararSincronizacao() {
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    registros = [];
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
            toggleBtn.textContent = 'Já tenho conta — Entrar';
        } else {
            tituloEl.textContent = 'Entrar';
            submitBtn.textContent = 'Entrar';
            toggleBtn.textContent = 'Não tenho conta — Criar conta';
        }
    }
    atualizarModo();

    toggleBtn.addEventListener('click', () => {
        modoAuth = modoAuth === 'cadastro' ? 'entrar' : 'cadastro';
        atualizarModo();
    });

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
    if (!confirm('Sair da conta neste aparelho?')) return;
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
                const resp = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=17&addressdetails=1`
                );
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
// Modal - abrir / fechar
// ------------------------------------------------------------
function abrirModal(id = null) {
    const modalBackdrop = document.getElementById('modalBackdrop');
    const entryForm = document.getElementById('entryForm');
    const deleteEntryBtn = document.getElementById('deleteEntryBtn');
    const modalTitle = document.getElementById('modalTitle');

    if (!modalBackdrop) return;
    modalBackdrop.style.display = 'flex';

    if (id) {
        const reg = registros.find(r => r.id === id);
        if (!reg) return;
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
    } else {
        modalTitle.textContent = 'Novo registro';
        entryForm.reset();
        document.getElementById('entryId').value = '';
        document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('entryLat').value = '';
        document.getElementById('entryLng').value = '';
        deleteEntryBtn.style.display = 'none';
    }
}

function fecharModal() {
    const modalBackdrop = document.getElementById('modalBackdrop');
    if (modalBackdrop) modalBackdrop.style.display = 'none';
}

// ------------------------------------------------------------
// Salvar / Excluir (agora gravam direto no Firestore)
// ------------------------------------------------------------
function salvarRegistro(e) {
    e.preventDefault();
    if (!currentUser) return;

    const idAtual = document.getElementById('entryId').value;
    const id = idAtual || gerarId();

    const reg = {
        entryType: document.getElementById('entryType').value,
        entryDate: document.getElementById('entryDate').value,
        entryLocation: document.getElementById('entryLocation').value.trim(),
        entryCode: document.getElementById('entryCode').value.trim(),
        entrySummary: document.getElementById('entrySummary').value.trim(),
        entryDetails: document.getElementById('entryDetails').value,
        entryTags: document.getElementById('entryTags').value.trim(),
        entryStatus: document.getElementById('entryStatus').value,
        entryLat: document.getElementById('entryLat').value ? parseFloat(document.getElementById('entryLat').value) : null,
        entryLng: document.getElementById('entryLng').value ? parseFloat(document.getElementById('entryLng').value) : null,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const submitBtn = document.querySelector('#entryForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    db.collection('usuarios').doc(currentUser.uid).collection('registros').doc(id).set(reg, { merge: true })
        .then(() => {
            fecharModal();
            mostrarToast('Registro salvo e sincronizado.');
        })
        .catch((err) => {
            console.error(err);
            alert('Não foi possível salvar agora. Se estiver offline, o registro será enviado assim que a conexão voltar.');
            fecharModal();
        })
        .finally(() => { if (submitBtn) submitBtn.disabled = false; });
}

function excluirRegistro() {
    if (!currentUser) return;
    const id = document.getElementById('entryId').value;
    if (!id) return;
    if (!confirm('Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.')) return;

    db.collection('usuarios').doc(currentUser.uid).collection('registros').doc(id).delete()
        .then(() => {
            fecharModal();
            mostrarToast('Registro excluído.');
        })
        .catch((err) => {
            console.error(err);
            alert('Não foi possível excluir agora: ' + err.message);
        });
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
        const texto = `${reg.entryLocation} ${reg.entryCode} ${reg.entrySummary} ${reg.entryTags}`.toLowerCase();
        return correspondeAoFiltro(reg) && texto.includes(busca);
    });

    filtrados.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    entryList.style.display = filtrados.length ? 'grid' : 'none';
    if (emptyState) emptyState.style.display = filtrados.length ? 'none' : 'flex';

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
    baixarArquivo(JSON.stringify(registros, null, 2), `caderno-campo-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
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

    baixarArquivo('\uFEFF' + linhas.join('\n'), `caderno-campo-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
}

function exportarWord() {
    if (registros.length === 0) return alert('Nenhum registro para exportar.');

    const ordenados = [...registros].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    let corpo = ordenados.map(reg => `
        <div style="margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid #ccc; word-wrap:break-word;">
            <p style="font-size:11pt; color:#555; margin:0;">${formatarData(reg.entryDate)} — ${escapeHtml(LABELS_TIPO[reg.entryType] || reg.entryType)} — ${escapeHtml(LABELS_STATUS[reg.entryStatus] || reg.entryStatus)}</p>
            <h2 style="margin:4px 0; word-wrap:break-word;">${escapeHtml(reg.entrySummary)}</h2>
            <p style="margin:2px 0;"><strong>Local/Instituição:</strong> ${escapeHtml(reg.entryLocation || '—')}</p>
            <p style="margin:2px 0;"><strong>Código do caso/sujeito:</strong> ${escapeHtml(reg.entryCode || '—')}</p>
            <p style="margin:2px 0;"><strong>Tags:</strong> ${escapeHtml(reg.entryTags || '—')}</p>
            ${(reg.entryLat && reg.entryLng) ? `<p style="margin:2px 0; font-size:9pt;"><strong>Coordenadas:</strong> ${reg.entryLat}, ${reg.entryLng}</p>` : ''}
            <p style="margin-top:8px; white-space:pre-wrap; word-wrap:break-word;">${escapeHtml(reg.entryDetails || '')}</p>
        </div>
    `).join('');

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset="utf-8"><title>Caderno de Campo</title></head>
        <body style="font-family: Calibri, Arial, sans-serif; word-wrap:break-word;">
            <h1>Caderno de Campo — Paulo Xavier</h1>
            ${corpo}
        </body></html>`;

    baixarArquivo(html, `caderno-campo-${new Date().toISOString().split('T')[0]}.doc`, 'application/msword');
}

function exportarPDF() {
    if (registros.length === 0) return alert('Nenhum registro para exportar.');

    const win = window.open('', '_blank');
    if (!win) {
        alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.');
        return;
    }

    const ordenados = [...registros].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    let html = `<html><head><meta charset="utf-8"><style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; max-width: 100%; }
        body { font-family: Arial, sans-serif; padding: 20px; color: #000; overflow-wrap: break-word; word-break: break-word; }
        .folha { border: 1px solid #000; padding: 16px; margin-bottom: 20px; width: 100%; max-width: 100%; page-break-after: always; page-break-inside: avoid; overflow-wrap: break-word; word-break: break-word; hyphens: auto; }
        .folha:last-child { page-break-after: auto; }
        h1 { font-size: 18px; overflow-wrap: break-word; }
        h2 { font-size: 15px; margin: 4px 0; overflow-wrap: break-word; word-break: break-word; }
        .meta { color: #555; font-size: 11px; }
        .campo { margin: 4px 0; overflow-wrap: break-word; word-break: break-word; }
        .obs { white-space: pre-wrap; margin-top: 10px; overflow-wrap: break-word; word-break: break-word; line-height: 1.5; }
        .map-link { font-size: 11px; }
    </style></head><body>`;

    ordenados.forEach(reg => {
        html += `<div class="folha">
            <p class="meta">${formatarData(reg.entryDate)} — ${escapeHtml(LABELS_TIPO[reg.entryType] || reg.entryType)} — ${escapeHtml(LABELS_STATUS[reg.entryStatus] || reg.entryStatus)}</p>
            <h2>${escapeHtml(reg.entrySummary)}</h2>
            <p class="campo"><strong>Local/Instituição:</strong> ${escapeHtml(reg.entryLocation || '—')}</p>
            <p class="campo"><strong>Código:</strong> ${escapeHtml(reg.entryCode || '—')}</p>
            <p class="campo"><strong>Tags:</strong> ${escapeHtml(reg.entryTags || '—')}</p>
            ${(reg.entryLat && reg.entryLng) ? `<p class="campo map-link"><strong>Coordenadas:</strong> ${reg.entryLat}, ${reg.entryLng}</p>` : ''}
            <p class="obs">${escapeHtml(reg.entryDetails || '')}</p>
        </div>`;
    });

    html += `</body></html>`;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 500);
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
// Inicialização de eventos
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    configurarFormAuth();
    renderizar();

    document.getElementById('logoutBtn').addEventListener('click', sair);

    // Formulário
    document.getElementById('entryForm').addEventListener('submit', salvarRegistro);
    document.getElementById('deleteEntryBtn').addEventListener('click', excluirRegistro);
    document.getElementById('getLocationBtn').addEventListener('click', capturarLocalizacao);
    document.getElementById('closeModalBtn').addEventListener('click', fecharModal);
    document.getElementById('cancelModalBtn').addEventListener('click', fecharModal);

    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
        if (e.target.id === 'modalBackdrop') fecharModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fecharModal();
    });

    document.getElementById('newEntryBtn').addEventListener('click', () => abrirModal());
    document.getElementById('emptyNewEntryBtn').addEventListener('click', () => abrirModal());

    document.getElementById('searchInput').addEventListener('input', (e) => {
        termoBusca = e.target.value;
        renderizar();
    });

    document.querySelectorAll('#filterTabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#filterTabs .tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
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
