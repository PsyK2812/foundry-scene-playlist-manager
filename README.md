# Scene Playlist Manager

A Foundry VTT module (v13–v14) that gives the GM one window listing every scene, where you can set each scene's playlist and optional track, with a filter to see which scenes already have one.

## Features

- All scenes in one list with thumbnail, name and folder path, sorted by folder then name
- Playlist dropdown and optional track dropdown per scene (no track = whole playlist, like the scene's Ambience setting)
- Changes save instantly; ✕ clears a scene's playlist; click a thumbnail to view the scene
- Filter: All / With playlist / Without playlist
- Folder filter (includes subfolders) and search across scene, folder, playlist and track names
- Counter of scenes with/without a playlist; scenes with one get a green marker
- Bulk edit: tick scenes (or "Select all shown"), pick a playlist, Apply — or Clear selected
- Updates live when scenes, folders, playlists or tracks change

## Install

In Foundry: **Add-on Modules → Install Module**, paste this manifest URL:

```
https://github.com/PsyK2812/foundry-scene-playlist-manager/releases/latest/download/module.json
```

## Usage

As GM, open the **Scenes** sidebar tab and click **Scene Playlists**.
From a macro: `game.modules.get("scene-playlist-manager").api.open()`

## License

MIT
