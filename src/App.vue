<script setup>
// Componente raiz: liga o estado (composable) aos componentes de tela.
import { computed, onMounted, onUnmounted, ref } from "vue";
import { MAXIMO_NO_CADERNO, useQuestionario } from "./composables/useQuestionario.js";
import { letra } from "./services/api.js";
import EscolhaConcurso from "./components/EscolhaConcurso.vue";
import EscolhaDisciplina from "./components/EscolhaDisciplina.vue";
import PlacarSessao from "./components/PlacarSessao.vue";
import QuestaoItem from "./components/QuestaoItem.vue";
import CriticaQuestao from "./components/CriticaQuestao.vue";
import CadernoImpressao from "./components/CadernoImpressao.vue";

const {
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
} = useQuestionario();

// Tela inicial do concurso: "responder" na tela ou "imprimir" um caderno.
// Fica aqui para não voltar a "responder" a cada caderno impresso.
const modoEscolha = ref("responder");

// O placar só faz sentido durante uma sessão (e no resultado final).
const emSessao = computed(() =>
  ["respondendo", "corrigida", "fim"].includes(etapa.value)
);

const multiplaEscolha = computed(() => (questaoAtual.value?.alternativas?.length ?? 0) > 0);

// Atalhos de teclado: C = Certo e E = Errado (ou A, B, C... = alternativa), Enter = próxima.
function aoPressionarTecla(evento) {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return; // não atrapalha atalhos do navegador
  const tecla = evento.key.toLowerCase();

  if (etapa.value === "respondendo") {
    if (multiplaEscolha.value) {
      const indice = tecla.length === 1 ? tecla.charCodeAt(0) - 97 : -1; // "a" = 0
      if (indice >= 0 && indice < questaoAtual.value.alternativas.length) responder(letra(indice));
    } else if (tecla === "c") responder("C");
    else if (tecla === "e") responder("E");
  } else if (etapa.value === "corrigida" && tecla === "enter") {
    evento.preventDefault(); // evita "clicar" de novo no botão em foco
    proxima();
  }
}

onMounted(() => {
  carregar();
  window.addEventListener("keydown", aoPressionarTecla);
});

// Sempre remova os ouvintes globais ao desmontar o componente.
onUnmounted(() => {
  window.removeEventListener("keydown", aoPressionarTecla);
});
</script>

<template>
  <main class="pagina">
    <header class="cabecalho" :class="{ 'nao-imprimir': etapa === 'imprimindo' }">
      <div>
        <h1>Questões</h1>
        <p v-if="concurso && etapa !== 'escolhendo-concurso'" class="detalhe nome-concurso">
          {{ concurso.nome }}
        </p>
      </div>
      <PlacarSessao
        v-if="emSessao"
        :acertos="acertos"
        :erros="erros"
      />
    </header>

    <!-- Cada bloco abaixo corresponde a uma etapa do questionário -->

    <p v-if="etapa === 'carregando'" class="aviso">Carregando questões…</p>

    <section v-else-if="etapa === 'erro'" class="aviso erro">
      <p>Não foi possível carregar as questões.</p>
      <p class="detalhe">{{ mensagemErro }}</p>
      <div class="acoes">
        <button type="button" class="botao-principal" @click="carregar">Tentar de novo</button>
        <button
          v-if="podeTrocarConcurso"
          type="button"
          class="botao-secundario"
          @click="trocarConcurso"
        >
          Trocar concurso
        </button>
      </div>
    </section>

    <EscolhaConcurso
      v-else-if="etapa === 'escolhendo-concurso'"
      :concursos="concursos"
      :id-atual="concurso?.id ?? null"
      @escolher="abrirConcurso"
    />

    <EscolhaDisciplina
      v-else-if="etapa === 'escolhendo'"
      :pode-trocar-concurso="podeTrocarConcurso"
      :grupos="opcoesDeEstudo"
      :total-geral="todasQuestoes.length"
      :total-respondidas="totalRespondidas"
      :total-simulado="totalSimulado"
      v-model:modo="modoEscolha"
      @escolher="iniciar"
      @imprimir="abrirImpressao"
      @apagar-historico="apagarHistorico"
      @trocar-concurso="trocarConcurso"
    />

    <CadernoImpressao
      v-else-if="etapa === 'imprimindo' && caderno"
      :concurso="concurso"
      :caderno="caderno"
      :topicos="topicos"
      :topicos-por-id="topicosPorId"
      :rotulo="rotuloDe(caderno.idTopico)"
      :maximo="MAXIMO_NO_CADERNO"
      @sortear="sortearCaderno"
      @voltar="trocarDisciplina"
    />

    <section v-else-if="etapa === 'vazio'" class="aviso">
      <p>Nenhuma questão cadastrada para {{ rotuloFiltro }}.</p>
      <button type="button" class="botao-principal" @click="trocarDisciplina">
        Escolher outra disciplina
      </button>
    </section>

    <template v-else-if="etapa === 'respondendo' || etapa === 'corrigida'">
      <div class="barra-sessao">
        <p class="progresso">
          Questão {{ indiceAtual + 1 }} de {{ questoes.length }} · {{ rotuloFiltro }}
        </p>
        <button type="button" class="botao-link" @click="trocarDisciplina">
          Trocar disciplina
        </button>
      </div>

      <p v-if="respondidasNaSessao > 0" class="detalhe historico">
        Você já respondeu {{ respondidasNaSessao }} de {{ questoes.length }} questões.
        {{
          respondidasNaSessao < questoes.length
            ? "As ainda não respondidas aparecem primeiro."
            : "As respondidas menos vezes aparecem primeiro."
        }}
      </p>

      <QuestaoItem
        :questao="questaoAtual"
        :topico="topicoAtual"
        :historico="historicoQuestaoAtual"
        :resposta-dada="respostaDada"
        :bloqueada="etapa === 'corrigida'"
        @responder="responder"
      />

      <CriticaQuestao
        v-if="etapa === 'corrigida'"
        :acertou="acertou"
        :gabarito="questaoAtual.gabarito"
        :multipla-escolha="multiplaEscolha"
        :comentario="questaoAtual.comentario"
        :eh-ultima-questao="ehUltimaQuestao"
        @proxima="proxima"
      />
    </template>

    <section v-else-if="etapa === 'fim'" class="aviso fim">
      <h2>Sessão concluída</h2>
      <p class="detalhe">{{ rotuloFiltro }}</p>
      <p>
        Você respondeu {{ questoes.length }} questões:
        {{ acertos }} acertos e {{ erros }} erros.
      </p>
      <div class="acoes">
        <button type="button" class="botao-principal" @click="recomecar">Recomeçar</button>
        <button type="button" class="botao-secundario" @click="trocarDisciplina">
          Trocar disciplina
        </button>
      </div>
    </section>
  </main>
</template>
