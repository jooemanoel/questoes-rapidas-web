<script setup>
// Tela inicial do concurso: lista os itens do edital e suas disciplinas para escolher o que estudar.
// Só exibe as opções. Conforme o modo, emite "escolher" (responder na tela) ou "imprimir"
// (montar o caderno) com o id do tópico (null = todas, "simulado" = simulado da prova).
import { computed } from "vue";

const props = defineProps({
  podeTrocarConcurso: { type: Boolean, default: false },
  // [{ id, titulo, total, disciplinas: [{ id, titulo, total, naProva }] }]
  grupos: { type: Array, required: true },
  totalGeral: { type: Number, required: true },
  totalRespondidas: { type: Number, default: 0 },
  // Questões do simulado da prova (0 = o concurso não tem a distribuição cadastrada)
  totalSimulado: { type: Number, default: 0 },
  // "responder" ou "imprimir" (v-model:modo)
  modo: { type: String, default: "responder" },
});

const emit = defineEmits(["escolher", "imprimir", "apagar-historico", "trocar-concurso", "update:modo"]);

const imprimindo = computed(() => props.modo === "imprimir");

/** Disciplinas que entram no simulado, com quantas questões cada: "5 de Língua Portuguesa". */
const partesDoSimulado = computed(() =>
  props.grupos
    .flatMap((g) => g.disciplinas)
    .filter((d) => d.naProva)
    .map((d) => `${d.naProva} de ${tituloLegivel(d.titulo)}`)
    .join(", ")
);

/** Responde na tela ou abre o caderno, conforme o modo escolhido. */
function escolher(idTopico) {
  emit(imprimindo.value ? "imprimir" : "escolher", idTopico);
}

function confirmarApagarHistorico() {
  if (confirm("Esquecer todas as questões já respondidas deste concurso neste navegador?")) {
    emit("apagar-historico");
  }
}

/** "CONHECIMENTOS ESPECÍFICOS - CARGO 4: ..." vira "CONHECIMENTOS ESPECÍFICOS". */
function tituloCurto(titulo) {
  return titulo.split(" - ")[0];
}

/** "LÍNGUA PORTUGUESA" vira "Língua Portuguesa" (títulos de edital costumam vir em maiúsculas). */
function tituloLegivel(titulo) {
  if (titulo !== titulo.toUpperCase()) return titulo;
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "na", "no"]);
  return titulo
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((p, i) => {
      if (i > 0 && minusculas.has(p)) return p;
      // Palavras de até 3 letras fora da lista acima costumam ser siglas: "SUS", "TI".
      if (p.length <= 3) return p.toLocaleUpperCase("pt-BR");
      return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
    })
    .join(" ");
}
</script>

<template>
  <section class="escolha">
    <!-- O nome do concurso fica no cabeçalho da página (App.vue). -->
    <div class="titulo-escolha">
      <h2>O que você quer estudar?</h2>
      <button
        v-if="podeTrocarConcurso"
        type="button"
        class="botao-link"
        @click="emit('trocar-concurso')"
      >
        Trocar concurso
      </button>
    </div>

    <p v-if="totalGeral === 0" class="aviso">Este concurso ainda não tem questões cadastradas.</p>

    <template v-else>
      <div class="modo" role="radiogroup" aria-label="O que fazer com as questões">
        <button
          type="button"
          role="radio"
          :aria-checked="!imprimindo"
          :class="{ ativo: !imprimindo }"
          @click="emit('update:modo', 'responder')"
        >
          Responder na tela
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="imprimindo"
          :class="{ ativo: imprimindo }"
          @click="emit('update:modo', 'imprimir')"
        >
          Imprimir caderno
        </button>
      </div>
      <p v-if="imprimindo" class="detalhe">
        Escolha o que vai no caderno. O gabarito e os comentários ficam no final, depois de todas
        as questões.
      </p>

      <p v-if="totalRespondidas > 0" class="detalhe historico">
        Você já respondeu {{ totalRespondidas }} de {{ totalGeral }} questões.
        As ainda não respondidas aparecem primeiro.
        <button type="button" class="botao-link" @click="confirmarApagarHistorico">
          Limpar histórico
        </button>
      </p>

      <button
        v-if="totalSimulado > 0"
        type="button"
        class="opcao-estudo simulado"
        @click="escolher('simulado')"
      >
        <span>
          Simulado da prova
          <span class="na-prova">{{ partesDoSimulado }}</span>
        </span>
        <span class="contagem">{{ totalSimulado }}</span>
      </button>

      <button type="button" class="opcao-estudo todas" @click="escolher(null)">
        <span>Todas as disciplinas</span>
        <span class="contagem">{{ totalGeral }}</span>
      </button>

      <div v-for="grupo in grupos" :key="grupo.id" class="grupo">
        <button type="button" class="opcao-estudo grupo-titulo" @click="escolher(grupo.id)">
          <span>{{ grupo.id }} {{ tituloCurto(grupo.titulo) }}</span>
          <span class="contagem">{{ grupo.total }}</span>
        </button>

        <ul>
          <li v-for="disciplina in grupo.disciplinas" :key="disciplina.id">
            <button type="button" class="opcao-estudo" @click="escolher(disciplina.id)">
              <span>
                <strong>{{ disciplina.id }}</strong> {{ disciplina.titulo }}
                <span v-if="disciplina.naProva" class="na-prova">
                  {{ disciplina.naProva }} {{ disciplina.naProva === 1 ? "questão" : "questões" }} na prova
                </span>
              </span>
              <span class="contagem">{{ disciplina.total }}</span>
            </button>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
