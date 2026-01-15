import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'mpa', // MPA = Multi-Page Application (not SPA)
  build: {
    rollupOptions: {
      input: {
        login: 'login.html',
        signup: 'signup.html',
        index: 'index.html',
        playerDashboard: 'player/player-dashboard.html',
        captainDashboard: 'captain/captain-dashboard.html',
        coachDashboard: 'coach/coach-dashboard.html'
      }
    }
  }
})
