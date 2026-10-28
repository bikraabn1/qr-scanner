<script lang="ts">
  import { appState } from '../store.svelte';
  import { requestGoogleAccessToken, logoutGoogle } from '../google-auth';
  import { Moon, Sun, SlidersHorizontal, Terminal, LogIn, LogOut, CheckCircle2 } from '@lucide/svelte';

  let { currentView = $bindable() }: {
    currentView: 'testing' | 'settings';
  } = $props();

  let isLoggingIn = $state(false);
  let authError = $state<string | null>(null);

  async function handleGoogleLogin() {
    isLoggingIn = true;
    authError = null;
    try {
      await requestGoogleAccessToken();
    } catch (err: unknown) {
      authError = err instanceof Error ? err.message : String(err);
      alert('Login Gagal: ' + authError);
    } finally {
      isLoggingIn = false;
    }
  }
</script>

<header class="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-30 transition-colors">
  <div class="max-w-[1240px] mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
    <!-- Brand & Spreadsheet Target ID -->
    <div class="flex items-center gap-2 sm:gap-3 min-w-0">
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="w-2 h-2 rounded-xs bg-zinc-900 dark:bg-zinc-100"></span>
        <span class="text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-100 font-mono-data">
          QR Book Tester
        </span>
      </div>

      <span class="text-zinc-300 dark:text-zinc-700 hidden sm:inline">|</span>

      <!-- Spreadsheet connection status badge -->
      {#if appState.config.spreadsheetId}
        <span
          class="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono-data font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 rounded-sm border border-emerald-500/20 truncate"
          title={`Target Spreadsheet: ${appState.config.spreadsheetId} (${appState.config.sheetName || 'Pilih Tab'})`}
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
          <span class="hidden sm:inline">Sheets: {appState.config.spreadsheetId.slice(0, 8)}... ({appState.config.sheetName || 'Tab belum dipilih'})</span>
          <span class="sm:hidden">Sheets</span>
        </span>
      {:else}
        <span
          class="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono-data font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 sm:px-2 py-0.5 rounded-sm border border-amber-500/20 truncate"
          title="Spreadsheet belum diisi. Masukkan di tab Config."
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
          <span>Spreadsheet Not Set</span>
        </span>
      {/if}
    </div>

    <!-- Right Controls: Google OAuth Profile, Navigation & Theme -->
    <div class="flex items-center gap-2">
      <!-- Google Auth Button / User Profile -->
      {#if appState.user && appState.accessToken}
        <div class="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800">
          {#if appState.user.picture}
            <img
              src={appState.user.picture}
              alt={appState.user.name}
              referrerpolicy="no-referrer"
              class="w-5 h-5 rounded-full object-cover shrink-0 border border-zinc-200 dark:border-zinc-700"
            />
          {:else}
            <div class="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
              {appState.user.name?.[0]?.toUpperCase() || 'U'}
            </div>
          {/if}
          <span class="text-[11px] font-medium text-zinc-800 dark:text-zinc-200 hidden md:inline max-w-[140px] truncate" title={appState.user.email}>
            {appState.user.name}
          </span>
          <button
            type="button"
            class="p-0.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-0.5"
            title={`Sign out (${appState.user.email})`}
            onclick={logoutGoogle}
          >
            <LogOut class="w-3.5 h-3.5" />
          </button>
        </div>
      {:else}
        <button
          type="button"
          disabled={isLoggingIn}
          class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs disabled:opacity-50"
          onclick={handleGoogleLogin}
        >
          <LogIn class="w-3.5 h-3.5" />
          <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google'}</span>
        </button>
      {/if}

      <!-- View Navigation -->
      <nav class="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-800" aria-label="Views">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm transition-colors {currentView === 'testing' ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
          onclick={() => currentView = 'testing'}
        >
          <Terminal class="w-3.5 h-3.5" />
          Console
          <kbd class="hidden sm:inline-block text-[10px] opacity-40 font-mono-data">^1</kbd>
        </button>
        <button
          type="button"
          aria-label="Config & Mapping"
          class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm transition-colors {currentView === 'settings' ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
          onclick={() => currentView = 'settings'}
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          Config
          <kbd class="hidden sm:inline-block text-[10px] opacity-40 font-mono-data">^2</kbd>
        </button>
      </nav>

      <!-- Theme Switcher -->
      <button
        type="button"
        class="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        aria-label="Toggle dark/light theme"
        onclick={() => appState.toggleTheme()}
      >
        {#if appState.theme === 'dark'}
          <Sun class="w-3.5 h-3.5" />
        {:else}
          <Moon class="w-3.5 h-3.5" />
        {/if}
      </button>
    </div>
  </div>
</header>
