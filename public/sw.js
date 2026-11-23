// Service worker: permite instalar o app e abri-lo mesmo sem internet.
//
// Estratégias de cache:
//   - Páginas (navegação) e dados da API: REDE PRIMEIRO, com o cache como reserva.
//     Online, você sempre vê a versão e as questões mais recentes;
//     offline, vê a última versão salva.
//   - Arquivos do app (JS, CSS, ícones): CACHE PRIMEIRO.
//     O Vite coloca um hash no nome (index-Bx12.js), então um arquivo
//     com o mesmo nome nunca muda e pode ser reaproveitado sem consultar a rede.
//
// Ao mudar este arquivo de forma relevante, troque a VERSAO: o cache antigo é apagado.

const VERSAO = "questoes-v2";

// Arquivos salvos já na instalação, para o app abrir offline desde o início.
const ARQUIVOS_INICIAIS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icones/icone-192.png",
  "./icones/icone-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS_INICIAIS))
  );
  self.skipWaiting(); // ativa a nova versão sem esperar fechar as abas
});

self.addEventListener("activate", (evento) => {
  // Remove caches de versões anteriores.
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((nome) => nome !== VERSAO).map((nome) => caches.delete(nome)))
    )
  );
  self.clients.claim(); // passa a controlar as abas já abertas
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return; // só leituras passam pelo cache

  const mesmaOrigem = new URL(requisicao.url).origin === self.location.origin;

  if (requisicao.mode === "navigate") {
    evento.respondWith(redePrimeiro(requisicao, "./index.html"));
  } else if (mesmaOrigem) {
    evento.respondWith(cachePrimeiro(requisicao));
  } else {
    evento.respondWith(redePrimeiro(requisicao)); // API na Vercel
  }
});

async function redePrimeiro(requisicao, reserva) {
  const cache = await caches.open(VERSAO);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok) cache.put(requisicao, resposta.clone());
    return resposta;
  } catch (erro) {
    // Sem rede: usa a cópia salva (ou a página inicial, para navegação).
    const salva = (await cache.match(requisicao)) || (reserva && (await cache.match(reserva)));
    if (salva) return salva;
    throw erro;
  }
}

async function cachePrimeiro(requisicao) {
  const cache = await caches.open(VERSAO);
  const salva = await cache.match(requisicao);
  if (salva) return salva;

  const resposta = await fetch(requisicao);
  if (resposta.ok) cache.put(requisicao, resposta.clone());
  return resposta;
}
