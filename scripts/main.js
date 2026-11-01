const MODULE_ID = "scene-playlist-manager";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

function sortedPlaylists() {
  return game.playlists.contents.slice().sort(byName);
}

function sortedSounds(playlist) {
  return playlist.sounds.contents.slice().sort((a, b) => (a.sort - b.sort) || byName(a, b));
}

/** Ancestor chain of a folder (root first). */
function folderChain(folder) {
  const chain = [];
  let f = folder;
  while (f) { chain.unshift(f); f = f.folder; }
  return chain;
}

function folderPath(folder) {
  return folderChain(folder).map(f => f.name).join(" / ");
}

/* -------------------------------------------- */
/*  Application                                 */
/* -------------------------------------------- */

class ScenePlaylistManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance;

  static open() {
    if (!game.user.isGM) return;
    this.#instance ??= new ScenePlaylistManager();
    this.#instance.render({ force: true });
    return this.#instance;
  }

  static get instance() { return this.#instance; }

  /** UI state kept between renders. */
  state = { search: "", filter: "all", folder: "" };

  static DEFAULT_OPTIONS = {
    id: "scene-playlist-manager",
    classes: ["scene-playlist-manager"],
    tag: "div",
    window: {
      title: "SPM.Title",
      icon: "fa-solid fa-music",
      resizable: true
    },
    position: { width: 820, height: 720 },
    actions: {
      viewScene: ScenePlaylistManager.#onViewScene,
      clearScene: ScenePlaylistManager.#onClearScene,
      bulkApply: ScenePlaylistManager.#onBulkApply,
      bulkClear: ScenePlaylistManager.#onBulkClear
    }
  };

  static PARTS = {
    toolbar: { template: `modules/${MODULE_ID}/templates/toolbar.hbs` },
    list: { template: `modules/${MODULE_ID}/templates/list.hbs`, scrollable: [".spm-list"] }
  };

  /* ---------- Context ---------- */

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "toolbar") return this.#prepareToolbar(context);
    if (partId === "list") return this.#prepareList(context);
    return context;
  }

  #prepareToolbar(context) {
    const folders = game.folders.filter(f => f.type === "Scene")
      .map(f => ({ id: f.id, name: folderPath(f), selected: f.id === this.state.folder }))
      .sort(byName);
    folders.push({ id: "__none__", name: game.i18n.localize("SPM.NoFolder"), selected: this.state.folder === "__none__" });
    return Object.assign(context, {
      search: this.state.search,
      filter: this.state.filter,
      folders,
      playlists: sortedPlaylists().map(p => ({ id: p.id, name: p.name }))
    });
  }

  #prepareList(context) {
    const playlists = sortedPlaylists();
    const noneLabel = game.i18n.localize("SPM.None");
    const wholeLabel = game.i18n.localize("SPM.WholePlaylist");

    const scenes = game.scenes.contents.map(scene => {
      const playlist = scene.playlist ?? null;          // resolves to null if the playlist was deleted
      const sound = playlist ? (scene.playlistSound ?? null) : null;
      const chain = folderChain(scene.folder);
      const path = chain.map(f => f.name).join(" / ");
      return {
        id: scene.id,
        name: scene.name,
        thumb: scene.thumb || "icons/svg/mystery-man.svg",
        active: scene.active,
        folderName: path,
        folderId: chain.length ? chain.map(f => f.id).join(" ") : "__none__",
        sortKey: `${path}\u0000${scene.name}`,
        hasPlaylist: !!playlist,
        searchText: `${scene.name} ${path} ${playlist?.name ?? ""} ${sound?.name ?? ""}`.toLowerCase(),
        playlistOptions: [
          { id: "", name: noneLabel, selected: !playlist },
          ...playlists.map(p => ({ id: p.id, name: p.name, selected: p === playlist }))
        ],
        soundOptions: playlist ? [
          { id: "", name: wholeLabel, selected: !sound },
          ...sortedSounds(playlist).map(s => ({ id: s.id, name: s.name, selected: s === sound }))
        ] : [{ id: "", name: "—", selected: true }]
      };
    });
    scenes.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true, sensitivity: "base" }));
    return Object.assign(context, { scenes });
  }

  /* ---------- Rendering & events ---------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // Delegated listeners on the root element survive partial re-renders.
    this.element.addEventListener("input", ev => {
      if (ev.target.matches(".spm-search")) {
        this.state.search = ev.target.value;
        this.#applyFilter();
      }
    });
    this.element.addEventListener("change", ev => this.#onChange(ev));
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyFilter();
  }

  async #onChange(ev) {
    const t = ev.target;
    if (t.matches(".spm-filter")) { this.state.filter = t.value; return this.#applyFilter(); }
    if (t.matches(".spm-folder")) { this.state.folder = t.value; return this.#applyFilter(); }
    if (t.matches(".spm-check-all")) {
      for (const row of this.#visibleRows()) row.querySelector(".spm-check").checked = t.checked;
      return;
    }
    const row = t.closest(".spm-scene");
    const scene = row && game.scenes.get(row.dataset.sceneId);
    if (!scene) return;
    if (t.matches(".spm-playlist")) {
      await scene.update({ playlist: t.value || null, playlistSound: null });
    } else if (t.matches(".spm-sound")) {
      await scene.update({ playlistSound: t.value || null });
    }
  }

  #rows() {
    return Array.from(this.element?.querySelectorAll(".spm-scene") ?? []);
  }

  #visibleRows() {
    return this.#rows().filter(r => !r.classList.contains("spm-hidden"));
  }

  #applyFilter() {
    if (!this.element) return;
    const { search, filter, folder } = this.state;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0, withCount = 0, withoutCount = 0;

    for (const row of this.#rows()) {
      const has = row.dataset.hasPlaylist === "1";
      if (has) withCount++; else withoutCount++;
      let visible = true;
      if (filter === "with" && !has) visible = false;
      if (filter === "without" && has) visible = false;
      if (folder && !row.dataset.folderId.split(" ").includes(folder)) visible = false;
      if (terms.length && !terms.every(term => row.dataset.search.includes(term))) visible = false;
      row.classList.toggle("spm-hidden", !visible);
      if (visible) shown++;
    }

    const counts = this.element.querySelector(".spm-counts");
    if (counts) counts.textContent = game.i18n.format("SPM.Counts", { shown, with: withCount, without: withoutCount });
    this.element.querySelector(".spm-empty")?.classList.toggle("spm-hidden", shown > 0);
    const all = this.element.querySelector(".spm-check-all");
    if (all) all.checked = false;
  }

  #selectedIds() {
    return this.#visibleRows()
      .filter(r => r.querySelector(".spm-check").checked)
      .map(r => r.dataset.sceneId);
  }

  /* ---------- Actions ---------- */

  static async #onViewScene(event, target) {
    const id = target.closest(".spm-scene")?.dataset.sceneId;
    await game.scenes.get(id)?.view();
  }

  static async #onClearScene(event, target) {
    const id = target.closest(".spm-scene")?.dataset.sceneId;
    await game.scenes.get(id)?.update({ playlist: null, playlistSound: null });
  }

  static async #onBulkApply() {
    const ids = this.#selectedIds();
    if (!ids.length) return ui.notifications.warn(game.i18n.localize("SPM.NoneSelected"));
    const playlist = this.element.querySelector(".spm-bulk-playlist")?.value || null;
    if (!playlist) return;
    await Scene.updateDocuments(ids.map(_id => ({ _id, playlist, playlistSound: null })));
    ui.notifications.info(game.i18n.format("SPM.BulkDone", { count: ids.length }));
  }

  static async #onBulkClear() {
    const ids = this.#selectedIds();
    if (!ids.length) return ui.notifications.warn(game.i18n.localize("SPM.NoneSelected"));
    await Scene.updateDocuments(ids.map(_id => ({ _id, playlist: null, playlistSound: null })));
    ui.notifications.info(game.i18n.format("SPM.BulkDone", { count: ids.length }));
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = { open: () => ScenePlaylistManager.open() };
});

// Button in the Scenes sidebar tab (GM only).
Hooks.on("renderSceneDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".spm-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "spm-open";
  btn.innerHTML = `<i class="fa-solid fa-music"></i> ${game.i18n.localize("SPM.OpenButton")}`;
  btn.addEventListener("click", () => ScenePlaylistManager.open());
  const container = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
  container?.append(btn);
});

// Keep the window in sync with changes made anywhere.
const refresh = foundry.utils.debounce((parts) => {
  const app = ScenePlaylistManager.instance;
  if (app?.rendered) app.render({ parts });
}, 100);

const SCENE_KEYS = ["name", "folder", "thumb", "active", "playlist", "playlistSound", "sort"];
const touches = (changes, keys) => keys.some(k => k in changes);

Hooks.on("createScene", () => refresh(["list"]));
Hooks.on("deleteScene", () => refresh(["list"]));
Hooks.on("updateScene", (doc, changes) => { if (touches(changes, SCENE_KEYS)) refresh(["list"]); });

for (const hook of ["createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hook, (folder) => { if (folder.type === "Scene") refresh(["toolbar", "list"]); });
}

// Playlists: ignore play/stop state changes, only react to structural changes.
Hooks.on("createPlaylist", () => refresh(["toolbar", "list"]));
Hooks.on("deletePlaylist", () => refresh(["toolbar", "list"]));
Hooks.on("updatePlaylist", (doc, changes) => { if (touches(changes, ["name"])) refresh(["toolbar", "list"]); });
Hooks.on("createPlaylistSound", () => refresh(["list"]));
Hooks.on("deletePlaylistSound", () => refresh(["list"]));
Hooks.on("updatePlaylistSound", (doc, changes) => { if (touches(changes, ["name", "sort"])) refresh(["list"]); });
