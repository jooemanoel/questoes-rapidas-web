// Escolha e ordem das questões: sessões na tela, simulado da prova e caderno para imprimir.
// Funções puras: recebem as listas e devolvem listas novas, sem tocar no estado da tela.

/** Disciplina (nível 2) de um tópico: "2.3.1.2" → "2.3". */
export function disciplinaDe(topicoId) {
  return String(topicoId || "").split(".").slice(0, 2).join(".");
}

/** A questão pertence ao tópico se o topicoId é ele ou um descendente (ex.: "3.2" inclui "3.2.1.4"). */
export function pertenceAo(questao, idTopico) {
  if (!idTopico) return true;
  const id = questao.topicoId || "";
  return id === idTopico || id.startsWith(`${idTopico}.`);
}

/**
 * Ordena para estudar: primeiro as questões nunca respondidas (em ordem aleatória),
 * depois as já respondidas, das vistas menos vezes para as mais vistas.
 * Empates ficam em ordem aleatória (embaralha antes; o sort do JS é estável).
 */
export function priorizarNaoRespondidas(lista, historico) {
  const vezes = (q) => historico[q.id]?.vezes ?? 0;
  return embaralhar(lista).sort((a, b) => vezes(a) - vezes(b));
}

/** Embaralhamento de Fisher-Yates: devolve uma cópia em ordem aleatória. */
export function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Simulado com a composição da prova: para cada disciplina de `distribuicao`
 * ({ "1.1": 5, "2.1": 20 }), sorteia essa quantidade, dando prioridade às
 * questões ainda não respondidas. As disciplinas ficam na ordem da distribuição
 * (a do edital). Se uma disciplina não tiver questões suficientes, entram todas
 * as que houver, e a falta aparece em `faltas`.
 *
 * Devolve { questoes, faltas: [{ disciplina, pedidas, disponiveis }] }.
 */
export function montarSimulado(todas, distribuicao, historico) {
  const questoes = [];
  const faltas = [];
  for (const [disciplina, pedidas] of Object.entries(distribuicao || {})) {
    const disponiveis = todas.filter((q) => pertenceAo(q, disciplina));
    questoes.push(...priorizarNaoRespondidas(disponiveis, historico).slice(0, pedidas));
    if (disponiveis.length < pedidas) faltas.push({ disciplina, pedidas, disponiveis: disponiveis.length });
  }
  return { questoes, faltas };
}

/** Total de questões do simulado (soma da distribuição). */
export function totalDoSimulado(distribuicao) {
  return Object.values(distribuicao || {}).reduce((soma, n) => soma + n, 0);
}

/**
 * Agrupa as questões por disciplina, na ordem em que as disciplinas aparecem no
 * edital, mantendo a ordem sorteada dentro de cada uma. Numera as questões de 1 a N.
 *
 * Devolve [{ id, titulo, primeira, ultima, questoes: [{ numero, questao }] }].
 */
export function agruparPorDisciplina(questoes, topicos) {
  const ordemNoEdital = new Map(topicos.map((t, i) => [t.id, i]));
  const tituloDe = new Map(topicos.map((t) => [t.id, t.titulo]));
  const posicao = (q) => ordemNoEdital.get(disciplinaDe(q.topicoId)) ?? Infinity;

  // O sort é estável: dentro da mesma disciplina, fica a ordem sorteada.
  const ordenadas = [...questoes].sort((a, b) => posicao(a) - posicao(b));

  const grupos = [];
  ordenadas.forEach((questao, i) => {
    const id = disciplinaDe(questao.topicoId);
    let grupo = grupos.at(-1);
    if (!grupo || grupo.id !== id) {
      grupo = { id, titulo: tituloDe.get(id) ?? "Outras questões", primeira: i + 1, ultima: i + 1, questoes: [] };
      grupos.push(grupo);
    }
    grupo.ultima = i + 1;
    grupo.questoes.push({ numero: i + 1, questao });
  });
  return grupos;
}
