// Composable: reúne o estado e as regras da sessão de estudo.
// Os componentes só exibem dados e avisam o que o usuário fez;
// quem decide o que acontece em seguida é este arquivo.

import { ref, computed } from "vue";
import { carregarQuestoes, buscarConteudo } from "../services/api.js";
import { lerHistorico, registrarResposta, limparHistorico } from "../services/historico.js";

/**
 * A tela está sempre em UMA destas etapas:
 *   "carregando"  -> buscando dados na API
 *   "erro"        -> a busca falhou
 *   "escolhendo"  -> tela inicial: escolha da disciplina
 *   "vazio"       -> a disciplina escolhida não tem questões
 *   "respondendo" -> questão na tela, aguardando Certo/Errado
 *   "corrigida"   -> resposta dada, crítica visível
 *   "fim"         -> todas as questões da sessão respondidas
 */
export function useQuestionario() {
  // ---------- Estado ----------
  const etapa = ref("carregando");
  const mensagemErro = ref("");

  const todasQuestoes = ref([]); // tudo o que veio da API
  const questoes = ref([]); // só as da disciplina escolhida, embaralhadas
  const filtroAtual = ref(null); // id do tópico escolhido (null = todas)

  const indiceAtual = ref(0);
  const respostaDada = ref(null); // "C", "E" ou null

  const acertos = ref(0);
  const erros = ref(0);

  const topicos = ref([]); // lista plana do conteudo.json
  const topicosPorId = ref(new Map());

  // Questões já respondidas neste navegador: { id: { vezes, acertos, ultima } }
  const historico = ref(lerHistorico());

  // Quantas questões da sessão já tinham sido respondidas quando ela começou.
  const respondidasNaSessao = ref(0);

  // Histórico da questão atual como estava ANTES de respondê-la agora
  // (null = nunca respondida). É guardado ao exibir a questão, para que a
  // resposta dada nesta sessão não altere o aviso.
  const historicoQuestaoAtual = ref(null);

  // ---------- Valores derivados (computed) ----------
  const questaoAtual = computed(() => questoes.value[indiceAtual.value]);

  const acertou = computed(
    () => respostaDada.value === questaoAtual.value?.gabarito
  );

  const ehUltimaQuestao = computed(
    () => indiceAtual.value === questoes.value.length - 1
  );

  /** Quantas das questões existentes já foram respondidas ao menos uma vez. */
  const totalRespondidas = computed(
    () => todasQuestoes.value.filter((q) => historico.value[q.id]).length
  );

  /**
   * Opções da tela inicial: cada item do edital (nível 1) com suas
   * disciplinas (nível 2) e a quantidade de questões de cada um.
   * Itens sem nenhuma questão não aparecem.
   */
  const opcoesDeEstudo = computed(() =>
    topicos.value
      .filter((t) => t.nivel === 1)
      .map((grupo) => ({
        id: grupo.id,
        titulo: grupo.titulo,
        total: contarQuestoes(grupo.id),
        disciplinas: topicos.value
          .filter((t) => t.parentId === grupo.id)
          .map((d) => ({ id: d.id, titulo: d.titulo, total: contarQuestoes(d.id) }))
          .filter((d) => d.total > 0),
      }))
      .filter((grupo) => grupo.total > 0)
  );

  /** Nome do filtro em uso, exibido durante a sessão. */
  const rotuloFiltro = computed(() => {
    if (!filtroAtual.value) return "Todas as disciplinas";
    const topico = topicosPorId.value.get(filtroAtual.value);
    return topico ? `${topico.id} ${topico.titulo}` : filtroAtual.value;
  });

  /** Disciplina (nível 2) e tópico da questão atual, para dar contexto. */
  const topicoAtual = computed(() => {
    const id = questaoAtual.value?.topicoId;
    const topico = id && topicosPorId.value.get(id);
    if (!topico) return null;

    const idDisciplina = id.split(".").slice(0, 2).join(".");
    const disciplina = topicosPorId.value.get(idDisciplina);

    return {
      id: topico.id,
      titulo: topico.titulo,
      disciplina: disciplina && disciplina !== topico ? disciplina.titulo : "",
    };
  });

  // ---------- Ações ----------
  async function carregar() {
    etapa.value = "carregando";
    mensagemErro.value = "";

    try {
      // As duas buscas são independentes, então rodam em paralelo.
      const [{ questoes: listaQuestoes }, conteudo] = await Promise.all([
        carregarQuestoes(), // usa a cópia do navegador se a lista não mudou
        buscarConteudo(),
      ]);

      topicos.value = conteudo;
      topicosPorId.value = new Map(conteudo.map((t) => [t.id, t]));
      todasQuestoes.value = listaQuestoes;
      historico.value = lerHistorico();

      etapa.value = "escolhendo";
    } catch (erro) {
      mensagemErro.value = erro.message;
      etapa.value = "erro";
    }
  }

  /** Inicia uma sessão com as questões do tópico escolhido (null = todas). */
  function iniciar(idTopico) {
    filtroAtual.value = idTopico;
    questoes.value = priorizarNaoRespondidas(
      todasQuestoes.value.filter((q) => pertenceAo(q, idTopico)),
      historico.value
    );
    respondidasNaSessao.value = questoes.value.filter((q) => historico.value[q.id]).length;
    reiniciarPlacar();
    lembrarHistoricoDaQuestao();
    etapa.value = questoes.value.length > 0 ? "respondendo" : "vazio";
  }

  function responder(opcao) {
    if (etapa.value !== "respondendo") return; // evita responder duas vezes

    respostaDada.value = opcao;
    if (acertou.value) acertos.value++;
    else erros.value++;

    historico.value = registrarResposta(historico.value, questaoAtual.value.id, acertou.value);

    etapa.value = "corrigida";
  }

  function proxima() {
    if (etapa.value !== "corrigida") return;

    if (ehUltimaQuestao.value) {
      etapa.value = "fim";
      return;
    }

    indiceAtual.value++;
    respostaDada.value = null;
    lembrarHistoricoDaQuestao();
    etapa.value = "respondendo";
  }

  /** Repete a mesma disciplina, em nova ordem. */
  function recomecar() {
    iniciar(filtroAtual.value);
  }

  /** Volta para a tela inicial de escolha. */
  function trocarDisciplina() {
    etapa.value = "escolhendo";
  }

  /** Esquece quais questões já foram respondidas neste navegador. */
  function apagarHistorico() {
    historico.value = limparHistorico();
  }

  function reiniciarPlacar() {
    indiceAtual.value = 0;
    respostaDada.value = null;
    acertos.value = 0;
    erros.value = 0;
  }

  function lembrarHistoricoDaQuestao() {
    const id = questaoAtual.value?.id;
    historicoQuestaoAtual.value = (id && historico.value[id]) || null;
  }

  // ---------- Funções auxiliares ----------

  /** A questão pertence ao tópico se o topicoId é ele ou um descendente (ex.: "3.2" inclui "3.2.1.4"). */
  function pertenceAo(questao, idTopico) {
    if (!idTopico) return true;
    const id = questao.topicoId || "";
    return id === idTopico || id.startsWith(`${idTopico}.`);
  }

  function contarQuestoes(idTopico) {
    return todasQuestoes.value.filter((q) => pertenceAo(q, idTopico)).length;
  }

  // Tudo o que o componente pode usar:
  return {
    etapa,
    mensagemErro,
    todasQuestoes,
    questoes,
    indiceAtual,
    questaoAtual,
    respostaDada,
    acertou,
    ehUltimaQuestao,
    acertos,
    erros,
    totalRespondidas,
    respondidasNaSessao,
    historicoQuestaoAtual,
    topicoAtual,
    opcoesDeEstudo,
    rotuloFiltro,
    carregar,
    iniciar,
    responder,
    proxima,
    recomecar,
    trocarDisciplina,
    apagarHistorico,
  };
}

/**
 * Ordena a sessão: primeiro as questões nunca respondidas (em ordem aleatória),
 * depois as já respondidas, das que foram vistas menos vezes para as mais vistas.
 * Empates ficam em ordem aleatória (embaralha antes; o sort do JS é estável).
 */
function priorizarNaoRespondidas(lista, historico) {
  const vezes = (q) => historico[q.id]?.vezes ?? 0;
  return embaralhar(lista).sort((a, b) => vezes(a) - vezes(b));
}

/** Embaralhamento de Fisher-Yates: devolve uma cópia em ordem aleatória. */
function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
