<script lang="ts">
  import { appState } from '../store.svelte';
  import { Minus, Plus, Lock, Layers } from '@lucide/svelte';

  function increment(amount: number) {
    appState.setPageNumber(appState.currentPage + amount);
  }

  function handleInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val > 0) {
      appState.setPageNumber(val);
    }
  }

  let totalCount = $derived(appState.records.length);
</script>

<div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-colors">
  <!-- Left: Page controls & lock icon -->
  <div class="flex items-center gap-3">
    <div class="flex items-center gap-1.5" title="Nomor halaman buku terkunci dan tetap sama untuk scan berikutnya">
      <Lock class="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
      <span class="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Book Page Tracker</span>
    </div>

    <!-- Stepper -->
    <div class="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-950 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        class="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-30 cursor-pointer"
        disabled={appState.currentPage <= 1}
        onclick={() => increment(-1)}
        aria-label="Previous page"
      >
        <Minus class="w-3.5 h-3.5" />
      </button>

      <div class="relative flex items-center px-1">
        <input
          type="number"
          min="1"
          step="1"
          value={appState.currentPage}
          oninput={handleInput}
          aria-label="Book page number input"
          class="w-16 text-center font-mono-data text-lg font-bold bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
        />
      </div>

      <button
        type="button"
        class="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
        onclick={() => increment(1)}
        aria-label="Next page"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>

      <div class="w-px h-3.5 bg-zinc-200 dark:border-zinc-800 mx-0.5"></div>

      <button
        type="button"
        class="px-2 py-1 text-[11px] font-mono-data font-medium rounded-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        onclick={() => increment(5)}
      >
        +5
      </button>
      <button
        type="button"
        class="px-2 py-1 text-[11px] font-mono-data font-medium rounded-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        onclick={() => increment(10)}
      >
        +10
      </button>
    </div>
  </div>

  <!-- Right: Session records submitted counter -->
  <div class="flex items-center gap-2 text-xs font-mono-data text-zinc-500 dark:text-zinc-400">
    <Layers class="w-3.5 h-3.5 text-zinc-400" />
    <span>
      <strong class="font-bold text-zinc-900 dark:text-zinc-100">{totalCount}</strong> baris terkirim sesi ini
    </span>
  </div>
</div>
