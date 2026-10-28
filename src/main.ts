import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { appState } from './lib/store.svelte'

// Expose appState on window for E2E testing
if (typeof window !== 'undefined') {
  (window as any).__appState = appState;
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
