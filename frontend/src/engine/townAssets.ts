import * as PIXI from 'pixi.js';

const TOWN_MANIFEST = {
  bundles: [
    {
      name: 'town-floor',
      assets: [
        { alias: 'town-floor-turf', src: '/assets/town/floor/turf.png' },
        { alias: 'town-floor-left-road', src: '/assets/town/floor/left-road.png' },
        { alias: 'town-floor-right-road', src: '/assets/town/floor/right-road.png' },
        { alias: 'town-floor-bottom-left-corner', src: '/assets/town/floor/bottom-left-corner.png' },
        { alias: 'town-floor-bottom-right-corner', src: '/assets/town/floor/bottom-right-corner.png' },
        { alias: 'town-floor-top-left-corner', src: '/assets/town/floor/top-left-corner.png' },
        { alias: 'town-floor-top-right-corner', src: '/assets/town/floor/top-right-corner.png' },
      ],
    },
    {
      name: 'town-buildings',
      assets: [
        { alias: 'town-building-hall', src: '/assets/town/buildings/hall.png' },
        { alias: 'town-building-warehouse', src: '/assets/town/buildings/warehouse.png' },
        { alias: 'town-building-lumber', src: '/assets/town/buildings/lumber.png' },
        { alias: 'town-building-quarry', src: '/assets/town/buildings/quarry.png' },
        { alias: 'town-building-mine', src: '/assets/town/buildings/mine.png' },
        { alias: 'town-building-blacksmith', src: '/assets/town/buildings/blacksmith.png' },
        { alias: 'town-building-tavern', src: '/assets/town/buildings/tavern.png' },
        { alias: 'town-building-alchemy', src: '/assets/town/buildings/alchemy.png' },
      ],
    },
  ],
};

let assetsInitialized = false;
let townBundlesLoaded = false;

export async function ensureTownAssetsReady(): Promise<void> {
  if (!assetsInitialized) {
    await PIXI.Assets.init({ manifest: TOWN_MANIFEST });
    assetsInitialized = true;
  }
  if (!townBundlesLoaded) {
    await PIXI.Assets.loadBundle(['town-floor', 'town-buildings']);
    townBundlesLoaded = true;
  }
}

export function getTownTexture(alias: string): PIXI.Texture | null {
  const texture = PIXI.Assets.get(alias);
  return texture instanceof PIXI.Texture ? texture : null;
}

