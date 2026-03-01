import { createRouter, createWebHashHistory } from "vue-router"

import MultiplayerView from "../views/MultiplayerView.vue"
import SinglePlayerView from "../views/SinglePlayerView.vue"

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/game/single-player" },
    {
      path: "/game/single-player",
      name: "single",
      component: SinglePlayerView,
    },
    {
      path: "/game/multiplayer",
      name: "multiplayer",
      component: MultiplayerView,
    },
  ],
})

export default router
