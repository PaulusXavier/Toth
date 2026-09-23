// ============================================================
// Service Worker do Caderno de Campo
//
// Estratégia:
// - HTML / CSS / JS (o "código" do app): rede primeiro, com fallback
//   para o cache quando estiver offline. Assim, toda vez que o app for
//   aberto com internet, ele já busca a versão mais recente publicada
//   no GitHub — sem precisar limpar cache manualmente.
// - Imagens/ícones: cache primeiro (carregam rápido e mudam pouco),
//   mas são atualizadas em segundo plano a cada acesso
//   (stale-while-revalidate), então uma troca de imagem também se
//   propaga sozinha, só que sem atrasar a primeira exibição.
// ============================================================

const CACHE_NAME = 'caderno-psi-v30';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './branding-toth.css',
  './app.js',
  './icone-psi-toth-192-tech-mini.png',
  './icone-psi-toth-512-tech-mini.png'
];

const EXTENSOES_CODIGO = ['.html', '.css', '.js'];

function ehArquivoDeCodigo(url) {
  if (url.pathname.endsWith('/')) return true; // navegação para a raiz
  return EXTENSOES_CODIGO.some((ext) => url.pathname.endsWith(ext));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        ASSETS.map((asset) => cache.add(asset).catch(() => undefined))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : undefined)
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  if (ehArquivoDeCodigo(url)) {
    // Rede primeiro: sempre tenta buscar a versão mais nova.
    // Só usa o cache se estiver offline ou a rede falhar.
    event.respondWith(
      fetch(event.request)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return resposta;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Demais arquivos (imagens, ícones): cache primeiro, com
  // atualização em segundo plano (stale-while-revalidate).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const buscaRede = fetch(event.request)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return resposta;
        })
        .catch(() => cached);
      return cached || buscaRede;
    })
  );
});
