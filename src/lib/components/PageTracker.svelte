<script lang="ts">
  import { appState } from '../store.svelte';
  import { Minus, Plus, Layers } from '@lucide/svelte';

  function increment(amount: number) {
    appState.setPageNumber(appState.currentPage + amount);
  }

  function handleInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val > 0) appState.setPageNumber(val);
  }

  let totalCount = $derived(appState.records.length);
</script>

<div
  class="bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
>
  <!-- What this number means, in the operator's own words -->
  <div class="flex items-center gap-3">
    <span class="text-xs text-[var(--text-secondary)]">Halaman buku</span>

    <div class="flex items-center gap-0.5 rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-0.5">
      <button
        type="button"
        class="inline-flex items-center justify-center w-6 h-6 rounded-[2px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-panel)] active:scale-95 transition-all disabled:opacity-30 cursor-pointer"
        disabled={appState.currentPage <= 1}
        onclick={() => increment(-1)}
        aria-label="Halaman sebelumnya"
      >
        <Minus class="w-3.5 h-3.5" />
      </button>

      <input
        type="number"
        min="1"
        step="1"
        value={appState.currentPage}
        oninput={handleInput}
        onchange={handleInput}
        aria-label="Nomor halaman"
        class="w-12 text-center font-mono-data text-sm font-semibold bg-transparent text-[var(--text-primary)] focus:outline-none"
      />

      <button
        type="button"
        class="inline-flex items-center justify-center w-6 h-6 rounded-[2px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-panel)] active:scale-95 transition-all cursor-pointer"
        onclick={() => increment(1)}
        aria-label="Halaman berikutnya"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </div>

    <button
      type="button"
      class="px-1.5 py-0.5 text-[11px] font-mono-data text-[var(--text-tertiary)] rounded-[2px] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
      onclick={() => increment(5)}
    >+5</button>
    <button
      type="button"
      class="px-1.5 py-0.5 text-[11px] font-mono-data text-[var(--text-tertiary)] rounded-[2px] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
      onclick={() => increment(10)}
    >+10</button>
  </div>

  <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
    <Layers class="w-3.5 h-3.5" />
    <span class="font-mono-data font-semibold text-[var(--text-primary)]">{totalCount}</span>
    <span>baris terkirim sesi ini</span>
  </div>
</div>
