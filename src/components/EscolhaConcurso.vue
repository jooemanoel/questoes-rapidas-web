<script setup>
// Lista os concursos da API para escolher qual estudar.
// Só exibe as opções e emite "escolher" com o id do concurso.
defineProps({
  // [{ id, nome, banca, formato, dataProva, ... }]
  concursos: { type: Array, required: true },
  idAtual: { type: String, default: null },
});

const emit = defineEmits(["escolher"]);

const FORMATOS = { "certo-errado": "Certo ou Errado", "multipla-escolha": "Múltipla escolha" };

/** "2027-01-17" vira "17/01/2027" (sem passar por fuso horário). */
function dataPorExtenso(iso) {
  const [ano, mes, dia] = String(iso).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

function detalhes(c) {
  return [c.banca, FORMATOS[c.formato] ?? c.formato, c.dataProva && `prova em ${dataPorExtenso(c.dataProva)}`]
    .filter(Boolean)
    .join(" · ");
}
</script>

<template>
  <section class="escolha">
    <h2>Qual concurso você quer estudar?</h2>

    <button
      v-for="c in concursos"
      :key="c.id"
      type="button"
      class="opcao-estudo opcao-concurso"
      :class="{ atual: c.id === idAtual }"
      @click="emit('escolher', c.id)"
    >
      <span>
        <strong>{{ c.nome }}</strong>
        <span class="detalhe">{{ detalhes(c) }}</span>
      </span>
      <span v-if="c.id === idAtual" class="contagem">atual</span>
    </button>
  </section>
</template>
