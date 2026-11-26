// Histórico das questões já respondidas, salvo só neste navegador, um por concurso.
// Chave: "historico:<idDoConcurso>". Formato: { "<idQuestao>": { vezes, acertos, ultima } }
//   vezes   -> quantas vezes a questão foi respondida
//   acertos -> quantas dessas foram certas
//   ultima  -> data/hora (ms) da última resposta

import { lerLocal, gravarLocal, removerLocal } from "./armazenamento.js";

const chave = (idConcurso) => `historico:${idConcurso}`;

// Antes de existirem vários concursos, havia um histórico só, todo da CGU.
const CHAVE_ANTIGA = "historico";
const CONCURSO_ANTIGO = "cgu-2026";

/**
 * Leva o histórico da época de um concurso só para a chave da CGU.
 * Roda a cada abertura, mas só faz algo quando a chave antiga existe. Os ids das
 * questões não mudaram, então nenhum acerto ou erro se perde. Se as duas chaves
 * existirem (ex.: uma aba com a versão antiga do app ainda aberta), junta as duas,
 * ficando, para cada questão, com o registro respondido por último.
 * Também apaga a cópia antiga das questões.
 */
export function migrarDadosAntigos() {
  const antigo = lerLocal(CHAVE_ANTIGA);
  if (antigo && typeof antigo === "object") {
    const mesclado = { ...antigo };
    for (const [id, registro] of Object.entries(lerHistorico(CONCURSO_ANTIGO))) {
      if ((registro.ultima ?? 0) >= (mesclado[id]?.ultima ?? 0)) mesclado[id] = registro;
    }
    // Só apaga a chave antiga se a nova foi gravada (ex.: cota cheia).
    if (gravarLocal(chave(CONCURSO_ANTIGO), mesclado)) removerLocal(CHAVE_ANTIGA);
  }
  removerLocal("questoes-v1");
}

export function lerHistorico(idConcurso) {
  const historico = lerLocal(chave(idConcurso));
  return historico && typeof historico === "object" ? historico : {};
}

/** Registra uma resposta e devolve o histórico atualizado. */
export function registrarResposta(idConcurso, historico, idQuestao, acertou) {
  const anterior = historico[idQuestao] || { vezes: 0, acertos: 0 };
  const novo = {
    ...historico,
    [idQuestao]: {
      vezes: anterior.vezes + 1,
      acertos: anterior.acertos + (acertou ? 1 : 0),
      ultima: Date.now(),
    },
  };
  gravarLocal(chave(idConcurso), novo);
  return novo;
}

export function limparHistorico(idConcurso) {
  removerLocal(chave(idConcurso));
  return {};
}
