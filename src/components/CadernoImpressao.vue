<script setup>
// Caderno para imprimir (ou salvar em PDF pelo navegador): as questões numeradas e agrupadas
// por disciplina e, a partir de uma página nova, o gabarito e os comentários.
//
// A tela mostra o caderno como prévia. Na impressão, o CSS (@media print, em estilo.css)
// esconde os controles e deixa só o caderno. Os textos entram por interpolação do Vue,
// que escapa "<" e ">": "List<Integer>" sai como está, sem virar uma tag.
import { computed, onUnmounted, watchEffect } from "vue";
import { letra } from "../services/api.js";
import { agruparPorDisciplina } from "../services/selecao.js";

const props = defineProps({
  concurso: { type: Object, required: true },
  // { idTopico, simulado, quantidade, disponiveis, questoes, faltas, geradoEm }
  caderno: { type: Object, required: true },
  topicos: { type: Array, required: true },
  topicosPorId: { type: Map, required: true },
  rotulo: { type: String, required: true },
  maximo: { type: Number, required: true },
});

const emit = defineEmits(["sortear", "voltar"]);

const multiplaEscolha = computed(() => props.concurso.formato === "multipla-escolha");
const grupos = computed(() => agruparPorDisciplina(props.caderno.questoes, props.topicos));
const numeradas = computed(() => grupos.value.flatMap((g) => g.questoes));
const dataGeracao = computed(() => props.caderno.geradoEm.toLocaleDateString("pt-BR"));
const naoRevisadas = computed(() => props.caderno.questoes.filter((q) => !q.revisada).length);

/** Quantidades oferecidas: até o total disponível e até o máximo do caderno. */
const quantidades = computed(() => {
  const limite = Math.min(props.caderno.disponiveis, props.maximo);
  const opcoes = [5, 10, 20, 30, 40, 60, 80, 100].filter((n) => n < limite);
  return [...opcoes, limite];
});

const avisoDeFalta = computed(() =>
  props.caderno.faltas
    .map((f) => `${props.topicosPorId.get(f.disciplina)?.titulo ?? f.disciplina}: ${f.disponiveis} de ${f.pedidas}`)
    .join("; ")
);

function rotuloGabarito(gabarito) {
  if (multiplaEscolha.value) return gabarito;
  return gabarito === "C" ? "Certo" : "Errado";
}

/**
 * O comentário começa com "Gabarito: X." ou "Certo."/"Errado.", que o título da entrada
 * já mostra. Tira esse começo só quando ele confere com o gabarito.
 */
function comentarioSemGabarito(questao) {
  const texto = questao.comentario || "";
  const prefixo = multiplaEscolha.value
    ? new RegExp(`^Gabarito:\\s*${questao.gabarito}\\.\\s*`)
    : questao.gabarito === "C" ? /^Certo\.\s*/ : /^Errado\.\s*/;
  return texto.replace(prefixo, "") || "Sem comentário.";
}

function tituloDoTopico(topicoId) {
  return props.topicosPorId.get(topicoId)?.titulo ?? "";
}

function intervalo(grupo) {
  return grupo.primeira === grupo.ultima
    ? `Questão ${grupo.primeira}`
    : `Questões ${grupo.primeira} a ${grupo.ultima}`;
}

// O Chrome e o Edge sugerem o título da página como nome do PDF.
const tituloOriginal = document.title;
watchEffect(() => {
  const qual = props.caderno.simulado ? "Simulado" : (props.caderno.idTopico ?? "Todas");
  const data = props.caderno.geradoEm.toISOString().slice(0, 10);
  document.title = `Caderno - ${props.concurso.nome} - ${qual} - ${data}`;
});
onUnmounted(() => {
  document.title = tituloOriginal;
});

function imprimir() {
  window.print();
}
</script>

<template>
  <section class="impressao">
    <div class="painel-impressao nao-imprimir">
      <div class="titulo-escolha">
        <h2>Caderno para imprimir</h2>
        <button type="button" class="botao-link" @click="emit('voltar')">Voltar</button>
      </div>
      <p class="detalhe">{{ rotulo }}</p>

      <div class="controles-impressao">
        <label v-if="!caderno.simulado">
          Questões
          <select
            :value="caderno.quantidade"
            @change="emit('sortear', Number($event.target.value))"
          >
            <option v-for="n in quantidades" :key="n" :value="n">
              {{ n === caderno.disponiveis ? `todas (${n})` : n }}
            </option>
          </select>
        </label>
        <button type="button" class="botao-secundario" @click="emit('sortear', caderno.quantidade)">
          Sortear outras
        </button>
        <button type="button" class="botao-principal" @click="imprimir">
          Imprimir ou salvar em PDF
        </button>
      </div>

      <p class="detalhe">
        As questões ainda não respondidas no app têm prioridade no sorteio. Responder no papel não
        entra no histórico. Para salvar o arquivo, escolha "Salvar como PDF" no lugar da impressora.
      </p>
      <p v-if="caderno.disponiveis > maximo && !caderno.simulado" class="detalhe">
        O caderno vai até {{ maximo }} questões ({{ caderno.disponiveis }} disponíveis).
      </p>
      <p v-if="avisoDeFalta" class="aviso erro">
        Algumas disciplinas não têm questões suficientes para o simulado: {{ avisoDeFalta }}.
      </p>
    </div>

    <article class="caderno">
      <header class="caderno-cabecalho">
        <p class="caderno-concurso">{{ concurso.nome }}</p>
        <h1>{{ caderno.simulado ? "Simulado da prova" : rotulo }}</h1>
        <p class="caderno-dados">
          {{ caderno.quantidade }} {{ caderno.quantidade === 1 ? "questão" : "questões" }} ·
          {{ multiplaEscolha ? "múltipla escolha" : "Certo ou Errado" }} · gerado em {{ dataGeracao }}
        </p>
        <p class="caderno-instrucao">
          {{
            multiplaEscolha
              ? "Em cada questão, assinale a única alternativa correta."
              : "Julgue cada item como certo (C) ou errado (E)."
          }}
          O gabarito e os comentários estão no final do caderno.
        </p>
        <p class="caderno-aviso">
          Material de estudo, não é prova oficial<template v-if="concurso.banca"> da banca {{ concurso.banca }}</template>.
          <template v-if="naoRevisadas === caderno.quantidade">
            As questões foram geradas por IA e ainda não foram revisadas.
          </template>
          <template v-else-if="naoRevisadas > 0">
            {{ naoRevisadas }} das questões foram geradas por IA e ainda não foram revisadas.
          </template>
        </p>
      </header>

      <section v-for="grupo in grupos" :key="grupo.id" class="caderno-disciplina">
        <h2>
          {{ grupo.titulo }}
          <span class="caderno-intervalo">{{ intervalo(grupo) }}</span>
        </h2>

        <div v-for="{ numero, questao } in grupo.questoes" :key="questao.id" class="caderno-questao">
          <p class="caderno-numero">{{ numero }}</p>
          <div class="caderno-corpo">
            <blockquote v-if="questao.textoBase" class="caderno-texto-base">{{ questao.textoBase }}</blockquote>
            <pre v-if="questao.codigo" class="caderno-codigo"><code>{{ questao.codigo }}</code></pre>
            <p class="caderno-enunciado">{{ questao.enunciado }}</p>

            <ol v-if="questao.alternativas.length" class="caderno-alternativas">
              <li v-for="(texto, i) in questao.alternativas" :key="i">
                <span class="caderno-letra">({{ letra(i) }})</span>
                <span>{{ texto }}</span>
              </li>
            </ol>
            <p v-else class="caderno-certo-errado">( &nbsp; ) Certo &nbsp;&nbsp;&nbsp; ( &nbsp; ) Errado</p>
          </div>
        </div>
      </section>

      <section class="caderno-gabarito">
        <h2>Gabarito</h2>
        <ol class="caderno-grade">
          <li v-for="{ numero, questao } in numeradas" :key="questao.id">
            <span class="caderno-grade-numero">{{ numero }}</span> {{ questao.gabarito }}
          </li>
        </ol>

        <h2>Comentários</h2>
        <div v-for="{ numero, questao } in numeradas" :key="questao.id" class="caderno-comentario">
          <p class="caderno-comentario-titulo">
            <strong>{{ numero }}. Gabarito: {{ rotuloGabarito(questao.gabarito) }}</strong>
            <span class="caderno-referencia">
              {{ questao.id }}<template v-if="tituloDoTopico(questao.topicoId)"> · {{ tituloDoTopico(questao.topicoId) }}</template>
            </span>
          </p>
          <p class="caderno-comentario-texto">{{ comentarioSemGabarito(questao) }}</p>
        </div>
      </section>
    </article>
  </section>
</template>
