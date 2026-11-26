// Camada de acesso à API.
// Os componentes não chamam fetch diretamente: pedem os dados a estas funções.
// Assim, se a API mudar, só este arquivo precisa ser alterado.

import { lerLocal, gravarLocal } from "./armazenamento.js";

// Troque o sufixo se o formato salvo das questões mudar: força um novo download.
// A cópia de cada concurso fica em "<prefixo>:<idDoConcurso>".
const PREFIXO_QUESTOES = "questoes-v2";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function buscarJson(caminho) {
  const resposta = await fetch(`${API_URL}${caminho}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar ${caminho} (HTTP ${resposta.status})`);
  }
  return resposta.json();
}

/** "A", "B", "C"... para a alternativa de índice i. */
export function letra(i) {
  return String.fromCharCode(65 + i);
}

/**
 * Converte o gabarito para uma das respostas válidas (só a primeira letra conta).
 * Certo ou Errado: aceita "c", "Certo", "ERRADO". Múltipla escolha: "b", "B".
 */
function normalizarGabarito(valor, validas) {
  const resposta = String(valor ?? "").trim().toUpperCase().charAt(0);
  return validas.includes(resposta) ? resposta : null;
}

/** Catálogo: [{ id, nome, banca, formato: "certo-errado" | "multipla-escolha", ... }] */
export async function buscarConcursos() {
  return buscarJson("/concursos");
}

/**
 * Formato de questão esperado (concursos/{id}/questoes no Firestore, via API):
 * {
 *   enunciado:    "Texto do item",                      (obrigatório)
 *   gabarito:     "C"/"E" ou, na múltipla escolha, "A"…  (obrigatório)
 *   alternativas: ["…", "…", "…", "…", "…"]             (só na múltipla escolha)
 *   comentario:   "Crítica/justificativa do gabarito",  (opcional)
 *   textoBase:    "Texto de apoio do item",             (opcional)
 *   codigo:       "Trecho de código do item",           (opcional, fonte monoespaçada)
 *   topicoId:     "1.3.3.2",                            (opcional, id do conteudo.json)
 *   revisada:     false                                 (opcional, false = ainda não conferida)
 * }
 */
export async function buscarQuestoes(concurso) {
  const multipla = concurso.formato === "multipla-escolha";
  const questoes = await buscarJson(`/concursos/${concurso.id}/questoes`);

  return questoes
    .map((q) => {
      const alternativas = multipla && Array.isArray(q.alternativas)
        ? q.alternativas.map((a) => String(a ?? "").trim())
        : [];
      const validas = multipla ? alternativas.map((_, i) => letra(i)) : ["C", "E"];
      return {
        id: q.id,
        enunciado: q.enunciado,
        textoBase: q.textoBase || "",
        codigo: q.codigo || "",
        alternativas, // [] = Certo ou Errado
        gabarito: normalizarGabarito(q.gabarito, validas),
        comentario: q.comentario || "",
        topicoId: q.topicoId || null,
        revisada: q.revisada !== false, // só é "não revisada" se marcada explicitamente
      };
    })
    // Descarta registros incompletos para não quebrar a tela.
    .filter((q) => q.enunciado && q.gabarito && (!multipla || q.alternativas.length >= 2));
}

/**
 * Devolve as questões do concurso usando a cópia salva no navegador sempre que possível.
 *
 * 1. Pergunta à API quando a lista foi alterada pela última vez (1 leitura no Firebase).
 * 2. Se a cópia local tem a mesma data, usa a cópia: nenhuma questão é baixada.
 * 3. Senão, baixa a lista completa e salva junto com a data.
 *
 * Sem rede, usa a cópia local (se existir), mesmo sem conseguir conferir a data.
 * Retorna { questoes, origem: "cache" | "rede" }.
 */
export async function carregarQuestoes(concurso) {
  const chave = `${PREFIXO_QUESTOES}:${concurso.id}`;
  const salvo = lerLocal(chave); // { atualizadoEm, questoes } ou null
  const temCopia = Array.isArray(salvo?.questoes);

  let atualizadoEm = null;
  try {
    ({ atualizadoEm = null } = await buscarJson(`/concursos/${concurso.id}/questoes/versao`));
  } catch (erro) {
    // Sem rede: a cópia salva é a melhor opção.
    if (temCopia) return { questoes: salvo.questoes, origem: "cache" };
    // Sem cópia: tenta baixar a lista mesmo assim.
    console.warn("Não foi possível conferir a versão das questões:", erro);
  }

  // atualizadoEm === null: a data é desconhecida; não dá para confiar na
  // cópia, então baixa a lista (e não salva).
  if (temCopia && atualizadoEm !== null && salvo.atualizadoEm === atualizadoEm) {
    return { questoes: salvo.questoes, origem: "cache" };
  }

  try {
    const questoes = await buscarQuestoes(concurso);
    // A data foi lida ANTES da lista: se algo mudou no meio, a data salva
    // fica mais antiga que a real e a próxima abertura baixa de novo (seguro).
    if (atualizadoEm !== null) gravarLocal(chave, { atualizadoEm, questoes });
    return { questoes, origem: "rede" };
  } catch (erro) {
    if (temCopia) return { questoes: salvo.questoes, origem: "cache" };
    throw erro;
  }
}

/** Lista plana de tópicos do edital do concurso (ver data/concursos/<id>/conteudo.json na API). */
export async function buscarConteudo(idConcurso) {
  return buscarJson(`/concursos/${idConcurso}/conteudo`);
}
