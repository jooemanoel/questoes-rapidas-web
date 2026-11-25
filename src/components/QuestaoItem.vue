<script setup>
// Mostra a questão e os botões Certo/Errado.
// Não corrige nada: apenas emite o evento "responder" com a opção escolhida.
import { computed } from "vue";

const props = defineProps({
  questao: { type: Object, required: true },
  topico: { type: Object, default: null },
  // Histórico desta questão antes da resposta atual: { vezes, acertos, ultima } ou null
  historico: { type: Object, default: null },
  respostaDada: { type: String, default: null },
  bloqueada: { type: Boolean, default: false },
});

const emit = defineEmits(["responder"]);

/** Ex.: "Você já respondeu esta questão 2 vezes (1 acerto), a última em 20/11/2026." */
const avisoJaRespondida = computed(() => {
  const h = props.historico;
  if (!h?.vezes) return "";
  const vezes = h.vezes === 1 ? "1 vez" : `${h.vezes} vezes`;
  const acertos = h.acertos === 1 ? "1 acerto" : `${h.acertos} acertos`;
  const data = h.ultima ? `, a última em ${new Date(h.ultima).toLocaleDateString("pt-BR")}` : "";
  return `Você já respondeu esta questão ${vezes} (${acertos})${data}.`;
});
</script>

<template>
  <article class="questao">
    <p v-if="topico" class="topico">
      <span v-if="topico.disciplina">{{ topico.disciplina }} › </span>
      <strong>{{ topico.id }}</strong> {{ topico.titulo }}
    </p>

    <p v-if="avisoJaRespondida" class="ja-respondida">{{ avisoJaRespondida }}</p>

    <p v-if="!questao.revisada" class="nao-revisada">
      Questão gerada por IA, ainda não revisada. Confira a base citada no comentário.
    </p>

    <blockquote v-if="questao.textoBase" class="texto-base">
      {{ questao.textoBase }}
    </blockquote>

    <!-- <pre> preserva quebras de linha e indentação do código -->
    <pre v-if="questao.codigo" class="codigo"><code>{{ questao.codigo }}</code></pre>

    <p class="enunciado">{{ questao.enunciado }}</p>

    <div class="opcoes">
      <button
        type="button"
        class="opcao certo"
        :class="{ escolhida: respostaDada === 'C' }"
        :disabled="bloqueada"
        @click="emit('responder', 'C')"
      >
        Certo <kbd>C</kbd>
      </button>
      <button
        type="button"
        class="opcao errado"
        :class="{ escolhida: respostaDada === 'E' }"
        :disabled="bloqueada"
        @click="emit('responder', 'E')"
      >
        Errado <kbd>E</kbd>
      </button>
    </div>
  </article>
</template>
