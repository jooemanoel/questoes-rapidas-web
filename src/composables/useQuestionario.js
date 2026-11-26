// Composable: reúne o estado e as regras da sessão de estudo.
// Os componentes só exibem dados e avisam o que o usuário fez;
// quem decide o que acontece em seguida é este arquivo.

import { ref, computed } from "vue";
import { buscarConcursos, carregarQuestoes, buscarConteudo } from "../services/api.js";
import { lerLocal, gravarLocal } from "../services/armazenamento.js";
import {
  lerHistorico,
  registrarResposta,
  limparHistorico,
  migrarDadosAntigos,
} from "../services/historico.js";
import {
  montarSimulado,
  pertenceAo,
  priorizarNaoRespondidas,
  totalDoSimulado,
} from "../services/selecao.js";

const CHAVE_CONCURSO = "concurso-atual";

/** Filtro especial: o simulado com a composição da prova (concurso.distribuicao). */
export const ID_SIMULADO = "simulado";

/** Limite do caderno impresso (100 questões de múltipla escolha dão umas 30 páginas). */
export const MAXIMO_NO_CADERNO = 100;

/**
 * A tela está sempre em UMA destas etapas:
 *   "carregando"           -> buscando dados na API
 *   "erro"                 -> a busca falhou
 *   "escolhendo-concurso"  -> escolha do concurso (só quando há mais de um)
 *   "escolhendo"           -> tela inicial do concurso: escolha da disciplina
 *   "vazio"                -> a disciplina escolhida não tem questões
 *   "respondendo"          -> questão na tela, aguardando a resposta
 *   "corrigida"            -> resposta dada, crítica visível
 *   "fim"                  -> todas as questões da sessão respondidas
 *   "imprimindo"           -> prévia do caderno para imprimir ou salvar em PDF
 */
export function useQuestionario() {
  // ---------- Estado ----------
  const etapa = ref("carregando");
  const mensagemErro = ref("");

  const concursos = ref([]); // catálogo da API
  const concurso = ref(null); // concurso em estudo: { id, nome, formato, distribuicao, ... }

  const todasQuestoes = ref([]); // todas as questões do concurso
  const questoes = ref([]); // só as da disciplina escolhida, embaralhadas
  const filtroAtual = ref(null); // id do tópico escolhido (null = todas, ID_SIMULADO = simulado)

  const indiceAtual = ref(0);
  const respostaDada = ref(null); // "C"/"E", uma letra da alternativa ou null

  const acertos = ref(0);
  const erros = ref(0);

  const topicos = ref([]); // lista plana do conteudo.json do concurso
  const topicosPorId = ref(new Map());

  // Questões do concurso já respondidas neste navegador: { id: { vezes, acertos, ultima } }
  const historico = ref({});

  // Quantas questões da sessão já tinham sido respondidas quando ela começou.
  const respondidasNaSessao = ref(0);

  // Histórico da questão atual como estava ANTES de respondê-la agora
  // (null = nunca respondida). É guardado ao exibir a questão, para que a
  // resposta dada nesta sessão não altere o aviso.
  const historicoQuestaoAtual = ref(null);

  // Cada abertura de concurso recebe um número; uma resposta da API que chegue
  // depois de o usuário trocar de concurso é ignorada.
  let carregamentoAtual = 0;

  // Caderno para imprimir:
  // { idTopico, simulado, quantidade, disponiveis, questoes, faltas, geradoEm } ou null
  const caderno = ref(null);

  // ---------- Valores derivados (computed) ----------
  const questaoAtual = computed(() => questoes.value[indiceAtual.value]);

  const acertou = computed(
    () => respostaDada.value === questaoAtual.value?.gabarito
  );

  const ehUltimaQuestao = computed(
    () => indiceAtual.value === questoes.value.length - 1
  );

  const podeTrocarConcurso = computed(() => concursos.value.length > 1);

  /** Questões do simulado da prova (0 = o concurso não tem a distribuição cadastrada). */
  const totalSimulado = computed(() => totalDoSimulado(concurso.value?.distribuicao));

  /** Quantas das questões existentes já foram respondidas ao menos uma vez. */
  const totalRespondidas = computed(
    () => todasQuestoes.value.filter((q) => historico.value[q.id]).length
  );

  /**
   * Opções da tela inicial: cada item do edital (nível 1) com suas
   * disciplinas (nível 2) e a quantidade de questões de cada um.
   * Itens sem nenhuma questão não aparecem.
   */
  const opcoesDeEstudo = computed(() => {
    const naProva = concurso.value?.distribuicao || {};
    return topicos.value
      .filter((t) => t.nivel === 1)
      .map((grupo) => ({
        id: grupo.id,
        titulo: grupo.titulo,
        total: contarQuestoes(grupo.id),
        disciplinas: topicos.value
          .filter((t) => t.parentId === grupo.id)
          .map((d) => ({ id: d.id, titulo: d.titulo, total: contarQuestoes(d.id), naProva: naProva[d.id] ?? null }))
          .filter((d) => d.total > 0),
      }))
      .filter((grupo) => grupo.total > 0);
  });

  /** Nome do filtro em uso, exibido durante a sessão. */
  const rotuloFiltro = computed(() => rotuloDe(filtroAtual.value));

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

  /** Busca o catálogo e abre o último concurso estudado (ou pede para escolher). */
  async function carregar() {
    etapa.value = "carregando";
    mensagemErro.value = "";
    migrarDadosAntigos();

    try {
      concursos.value = await buscarConcursos();
    } catch (erro) {
      mostrarErro(erro);
      return;
    }

    const salvo = lerLocal(CHAVE_CONCURSO);
    const escolhido =
      concursos.value.find((c) => c.id === salvo) ??
      (concursos.value.length === 1 ? concursos.value[0] : null);

    if (escolhido) await abrirConcurso(escolhido.id);
    else etapa.value = "escolhendo-concurso";
  }

  /** Carrega as questões e o conteúdo do concurso e vai para a escolha da disciplina. */
  async function abrirConcurso(idConcurso) {
    const escolhido = concursos.value.find((c) => c.id === idConcurso);
    if (!escolhido) return;

    const meuCarregamento = ++carregamentoAtual;
    etapa.value = "carregando";
    mensagemErro.value = "";
    concurso.value = escolhido;
    gravarLocal(CHAVE_CONCURSO, escolhido.id);

    try {
      // As duas buscas são independentes, então rodam em paralelo.
      const [{ questoes: listaQuestoes }, conteudo] = await Promise.all([
        carregarQuestoes(escolhido), // usa a cópia do navegador se a lista não mudou
        buscarConteudo(escolhido.id),
      ]);
      if (meuCarregamento !== carregamentoAtual) return;

      topicos.value = conteudo;
      topicosPorId.value = new Map(conteudo.map((t) => [t.id, t]));
      todasQuestoes.value = listaQuestoes;
      historico.value = lerHistorico(escolhido.id);
      filtroAtual.value = null;

      etapa.value = "escolhendo";
    } catch (erro) {
      if (meuCarregamento === carregamentoAtual) mostrarErro(erro);
    }
  }

  /** Inicia uma sessão com as questões do tópico escolhido (null = todas, ID_SIMULADO = simulado). */
  function iniciar(idTopico) {
    filtroAtual.value = idTopico;
    questoes.value =
      idTopico === ID_SIMULADO
        ? montarSimulado(todasQuestoes.value, concurso.value.distribuicao, historico.value).questoes
        : priorizarNaoRespondidas(
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

    historico.value = registrarResposta(
      concurso.value.id,
      historico.value,
      questaoAtual.value.id,
      acertou.value
    );

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

  /**
   * Abre a prévia do caderno para imprimir com as questões do tópico (null = todas)
   * ou com um simulado (ID_SIMULADO). Responder no papel não entra no histórico.
   */
  function abrirImpressao(idTopico) {
    const simulado = idTopico === ID_SIMULADO;
    const disponiveis = simulado ? totalSimulado.value : contarQuestoes(idTopico);
    caderno.value = { idTopico, simulado, disponiveis, quantidade: 0, questoes: [], faltas: [] };
    sortearCaderno(Math.min(disponiveis, 20, MAXIMO_NO_CADERNO));
    etapa.value = "imprimindo";
  }

  /** Sorteia (de novo) as questões do caderno aberto; no simulado, a quantidade é a da prova. */
  function sortearCaderno(quantidade) {
    const atual = caderno.value;
    if (!atual) return;

    let selecionadas;
    let faltas = [];
    if (atual.simulado) {
      ({ questoes: selecionadas, faltas } = montarSimulado(
        todasQuestoes.value,
        concurso.value.distribuicao,
        historico.value
      ));
    } else {
      const limite = Math.max(1, Math.min(quantidade, atual.disponiveis, MAXIMO_NO_CADERNO));
      selecionadas = priorizarNaoRespondidas(
        todasQuestoes.value.filter((q) => pertenceAo(q, atual.idTopico)),
        historico.value
      ).slice(0, limite);
    }

    caderno.value = {
      ...atual,
      quantidade: selecionadas.length,
      questoes: selecionadas,
      faltas,
      geradoEm: new Date(),
    };
  }

  /** Repete a mesma disciplina, em nova ordem. */
  function recomecar() {
    iniciar(filtroAtual.value);
  }

  /** Volta para a tela inicial de escolha da disciplina. */
  function trocarDisciplina() {
    etapa.value = "escolhendo";
  }

  /** Volta para a escolha do concurso. */
  function trocarConcurso() {
    if (podeTrocarConcurso.value) etapa.value = "escolhendo-concurso";
  }

  /** Esquece quais questões do concurso já foram respondidas neste navegador. */
  function apagarHistorico() {
    historico.value = limparHistorico(concurso.value.id);
  }

  function mostrarErro(erro) {
    mensagemErro.value = erro.message;
    etapa.value = "erro";
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

  /** Nome de um filtro: "Todas as disciplinas", "Simulado da prova" ou "2.3 Título". */
  function rotuloDe(idTopico) {
    if (!idTopico) return "Todas as disciplinas";
    if (idTopico === ID_SIMULADO) return `Simulado da prova (${totalSimulado.value} questões)`;
    const topico = topicosPorId.value.get(idTopico);
    return topico ? `${topico.id} ${topico.titulo}` : idTopico;
  }

  function contarQuestoes(idTopico) {
    return todasQuestoes.value.filter((q) => pertenceAo(q, idTopico)).length;
  }

  // Tudo o que o componente pode usar:
  return {
    etapa,
    mensagemErro,
    concursos,
    concurso,
    podeTrocarConcurso,
    totalSimulado,
    caderno,
    topicos,
    topicosPorId,
    rotuloDe,
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
    abrirConcurso,
    iniciar,
    responder,
    proxima,
    recomecar,
    trocarDisciplina,
    trocarConcurso,
    apagarHistorico,
    abrirImpressao,
    sortearCaderno,
  };
}

