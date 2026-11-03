<script lang="ts">
  import { appState } from '../store.svelte';
  import { requestGoogleAccessToken, logoutGoogle } from '../google-auth';
  import { Moon, Sun, SlidersHorizontal, ClipboardCheck, LogIn, LogOut } from '@lucide/svelte';

  let { currentView = $bindable() }: {
    currentView: 'testing' | 'settings';
  } = $props();

  let isLoggingIn = $state(false);

  async function handleGoogleLogin() {
    isLoggingIn = true;
    try {
      await requestGoogleAccessToken();
    } catch (err: unknown) {
      alert('Login gagal: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      isLoggingIn = false;
    }
  }
</script>

<header class="border-b border-[var(--border-subtle)] bg-[var(--surface-panel)] sticky top-0 z-30">
  <div class="max-w-[1240px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
    <!-- Brand + which sheet this session writes to -->
    <div class="flex items-baseline gap-3 min-w-0">
      <span class="text-[13px] font-semibold tracking-tight text-[var(--text-primary)] shrink-0">
        QR Book Tester
      </span>

      {#if appState.config.spreadsheetId}
        <a
          href={`https://docs.google.com/spreadsheets/d/${appState.config.spreadsheetId}/edit`}
          target="_blank"
          rel="noopener"
          class="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors truncate"
          title={`Buka spreadsheet ${appState.config.spreadsheetId}`}
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0"></span>
          <span class="truncate">
            {appState.config.sheetName || 'Tab belum dipilih'} · {appState.config.spreadsheetId.slice(0, 8)}…
          </span>
        </a>
      {:else}
        <button
          type="button"
          class="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[#7a5a12] hover:underline"
          onclick={() => (currentView = 'settings')}
          title="Spreadsheet belum diatur"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#c9a44a] shrink-0"></span>
          Atur spreadsheet dulu
        </button>
      {/if}
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <!-- Nav: two destinations, named after what the operator does there -->
      <nav
        class="flex items-center gap-0.5 p-0.5 rounded-[4px] bg-[var(--surface-raised)] border border-[var(--border-subtle)]"
        aria-label="Tampilan"
      >
        <button
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-[3px] transition-colors cursor-pointer {currentView ===
          'testing'
            ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
          onclick={() => (currentView = 'testing')}
        >
          <ClipboardCheck class="w-3.5 h-3.5" />
          Input
          <kbd class="hidden md:inline font-mono-data text-[10px] opacity-40">⌘1</kbd>
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-[3px] transition-colors cursor-pointer {currentView ===
          'settings'
            ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
          onclick={() => (currentView = 'settings')}
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          Pengaturan
          <kbd class="hidden md:inline font-mono-data text-[10px] opacity-40">⌘2</kbd>
        </button>
      </nav>

      {#if appState.user && appState.accessToken}
        <div class="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-[4px] border border-[var(--border-subtle)]">
          {#if appState.user.picture}
            <img
              src={appState.user.picture}
              alt=""
              referrerpolicy="no-referrer"
              class="w-5 h-5 rounded-full object-cover shrink-0"
            />
          {:else}
            <div
              class="w-5 h-5 rounded-full bg-[var(--accent)] text-[var(--surface-panel)] text-[10px] font-bold flex items-center justify-center"
            >
              {appState.user.name?.[0]?.toUpperCase() || 'U'}
            </div>
          {/if}
          <span
            class="text-[11px] text-[var(--text-secondary)] hidden lg:inline max-w-[120px] truncate"
            title={appState.user.email}
          >
            {appState.user.name}
          </span>
          <button
            type="button"
            class="p-0.5 text-[var(--text-tertiary)] hover:text-[#b3261e] transition-colors cursor-pointer"
            title={`Keluar (${appState.user.email})`}
            onclick={logoutGoogle}
          >
            <LogOut class="w-3.5 h-3.5" />
          </button>
        </div>
      {:else}
        <button
          type="button"
          disabled={isLoggingIn}
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          onclick={handleGoogleLogin}
        >
          <LogIn class="w-3.5 h-3.5" />
          {isLoggingIn ? 'Menghubungkan…' : 'Masuk Google'}
        </button>
      {/if}

      <button
        type="button"
        class="p-1.5 rounded-[4px] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
        aria-label="Ganti tema terang/gelap"
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
