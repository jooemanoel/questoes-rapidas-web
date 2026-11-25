<script setup>
// Componente raiz: liga o estado (composable) aos componentes de tela.
import { computed, onMounted, onUnmounted } from "vue";
import { useQuestionario } from "./composables/useQuestionario.js";
import EscolhaDisciplina from "./components/EscolhaDisciplina.vue";
import PlacarSessao from "./components/PlacarSessao.vue";
import QuestaoItem from "./components/QuestaoItem.vue";
import CriticaQuestao from "./components/CriticaQuestao.vue";

const {
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
} = useQuestionario();

// O placar só faz sentido durante uma sessão (e no resultado final).
const emSessao = computed(() =>
  ["respondendo", "corrigida", "fim"].includes(etapa.value)
);

// Atalhos de teclado: C = Certo, E = Errado, Enter = próxima.
function aoPressionarTecla(evento) {
  const tecla = evento.key.toLowerCase();

  if (etapa.value === "respondendo" && tecla === "c") responder("C");
  else if (etapa.value === "respondendo" && tecla === "e") responder("E");
  else if (etapa.value === "corrigida" && tecla === "enter") {
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
    <header class="cabecalho">
      <h1>Questões</h1>
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
      <button type="button" class="botao-principal" @click="carregar">Tentar de novo</button>
    </section>

    <EscolhaDisciplina
      v-else-if="etapa === 'escolhendo'"
      :grupos="opcoesDeEstudo"
      :total-geral="todasQuestoes.length"
      :total-respondidas="totalRespondidas"
      @escolher="iniciar"
      @apagar-historico="apagarHistorico"
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
