import * as PIXI from 'pixi.js';
import { BUILDING_NAMES, gridToScreen, ISO_TILE_H, ISO_TILE_W, TOWN_GRID_H, TOWN_GRID_W } from './townConfig';

export type TownPixiScene = {
  townState: any;
  buildingGridSize: Record<string, { w: number; h: number }>;
  townHoverCell: { x: number; y: number } | null;
  townDragBuilding: string | null;
  townSelectedBuilding: string | null;
};

const BUILDING_SPRITE_URL: Record<string, string> = {
  hall: '/assets/town/buildings/hall.png',
  warehouse: '/assets/town/buildings/warehouse.png',
  lumber: '/assets/town/buildings/lumber.png',
  quarry: '/assets/town/buildings/quarry.png',
  mine: '/assets/town/buildings/mine.png',
  blacksmith: '/assets/town/buildings/blacksmith.png',
  tavern: '/assets/town/buildings/tavern.png',
  alchemy: '/assets/town/buildings/alchemy.png',
};

const FLOOR_SPRITE_URL: Record<string, string> = {
  turf: '/assets/town/floor/turf.png',
  leftRoad: '/assets/town/floor/left-road.png',
  rightRoad: '/assets/town/floor/right-road.png',
  bottomLeftCorner: '/assets/town/floor/bottom-left-corner.png',
  bottomRightCorner: '/assets/town/floor/bottom-right-corner.png',
  topLeftCorner: '/assets/town/floor/top-left-corner.png',
  topRightCorner: '/assets/town/floor/top-right-corner.png',
};

function diamondPolygon(cx: number, cy: number, scale = 1) {
  const w = (ISO_TILE_W / 2) * scale;
  const h = (ISO_TILE_H / 2) * scale;
  return [
    cx - w, cy,
    cx, cy - h,
    cx + w, cy,
    cx, cy + h,
  ];
}

function footprintScreenWidth(w: number, h: number) {
  // Bounding diamond width of a w*h rectangle in isometric projection
  return (w + h) * (ISO_TILE_W / 2);
}

export class TownPixiRenderer {
  private view: HTMLCanvasElement;
  private app: PIXI.Application | null = null;
  private root: PIXI.Container | null = null;
  private ground: PIXI.Graphics | null = null;
  private groundTiles: PIXI.Container | null = null;
  private hoverGfx: PIXI.Graphics | null = null;
  private previewGfx: PIXI.Graphics | null = null;
  private buildingLayer: PIXI.Container | null = null;
  private buildingSprites: Map<string, PIXI.Container> = new Map();
  private textures: Map<string, PIXI.Texture> = new Map();
  private floorTextures: Map<string, PIXI.Texture> = new Map();
  private startedLoading = false;
  private initDone = false;

  // Camera state for town map
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 3;

  constructor(view: HTMLCanvasElement) {
    this.view = view;
  }

  /** PixiJS v8: 必须 await init() 后再调用 resize/render */
  async init(): Promise<void> {
    if (this.initDone) return;
    const app = new PIXI.Application();
    await app.init({
      canvas: this.view,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      clearBeforeRender: true,
    });
    this.app = app;

    const root = new PIXI.Container();
    this.app.stage.addChild(root);
    this.root = root;

    this.ground = new PIXI.Graphics();
    this.groundTiles = new PIXI.Container();
    this.hoverGfx = new PIXI.Graphics();
    this.previewGfx = new PIXI.Graphics();
    this.buildingLayer = new PIXI.Container();
    root.addChild(this.ground);
    root.addChild(this.groundTiles);
    root.addChild(this.hoverGfx);
    root.addChild(this.previewGfx);
    root.addChild(this.buildingLayer);

    this.drawGround();
    this.applyCameraTransform();
    this.initDone = true;
    void this.ensureTexturesLoaded(); // 尽早开始加载，首帧可能就能用上
  }

  destroy() {
    if (!this.app) return;
    this.app.destroy(true, { children: true, texture: false });
    this.app = null;
    this.root = null;
    this.ground = null;
    this.groundTiles = null;
    this.hoverGfx = null;
    this.previewGfx = null;
    this.buildingLayer = null;
    this.buildingSprites.clear();
  }

  resize(w: number, h: number) {
    if (!this.app?.renderer) return;
    this.app.renderer.resize(w, h);
    if (!this.root) return;
    this.applyCameraTransform();
  }

  private applyCameraTransform() {
    if (!this.root || !this.app?.renderer) return;
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const centerGx = (TOWN_GRID_W - 1) / 2;
    const centerGy = (TOWN_GRID_H - 1) / 2;
    const isoCenter = gridToScreen(centerGx, centerGy);

    this.root.scale.set(this.zoom);
    this.root.position.set(
      w / 2 - isoCenter.x * this.zoom + this.cameraX,
      h / 2 - isoCenter.y * this.zoom + this.cameraY,
    );
  }

  setCamera(x: number, y: number) {
    this.cameraX = x;
    this.cameraY = y;
    this.applyCameraTransform();
  }

  setZoom(zoom: number) {
    const clamped = Math.max(1.5, Math.min(3.5, zoom));
    this.zoom = clamped;
    this.applyCameraTransform();
  }

  private async ensureTexturesLoaded() {
    if (this.startedLoading) return;
    this.startedLoading = true;

    const buildingEntries = Object.entries(BUILDING_SPRITE_URL);
    const floorEntries = Object.entries(FLOOR_SPRITE_URL);

    await Promise.all(buildingEntries.map(async ([type, url]) => {
      try {
        const tex = await PIXI.Assets.load(url);
        if (tex) this.textures.set(type, tex as PIXI.Texture);
      } catch {
        // missing asset: silently fallback to placeholder graphics
      }
    }));

    await Promise.all(floorEntries.map(async ([type, url]) => {
      try {
        const tex = await PIXI.Assets.load(url);
        if (tex) this.floorTextures.set(type, tex as PIXI.Texture);
      } catch {
        // missing asset: silently fallback to checkerboard graphics
      }
    }));

    // After floor textures are ready, redraw ground so纹理真正生效
    if (this.floorTextures.size > 0) {
      this.drawGround();
    }
  }

  private drawGround() {
    if (!this.ground) return;
    this.ground.clear();
    // subtle dark base, so gaps between tiles不会太突兀
    this.ground.beginFill(0x080910, 1);
    const totalW = (TOWN_GRID_W + TOWN_GRID_H) * (ISO_TILE_W / 2);
    const totalH = (TOWN_GRID_W + TOWN_GRID_H) * (ISO_TILE_H / 2);
    this.ground.drawRect(-totalW, -totalH, totalW * 2, totalH * 2);
    this.ground.endFill();

    if (!this.groundTiles) return;
    this.groundTiles.removeChildren();

    const getFloorKey = (gx: number, gy: number): string => {
      const maxX = TOWN_GRID_W - 1;
      const maxY = TOWN_GRID_H - 1;
      // corners
      if (gx === 0 && gy === 0) return 'topLeftCorner';
      if (gx === maxX && gy === 0) return 'topRightCorner';
      if (gx === 0 && gy === maxY) return 'bottomLeftCorner';
      if (gx === maxX && gy === maxY) return 'bottomRightCorner';
      // borders (excluding corners):
      // 左边和右边（不含角） → left-road
      if ((gx === 0 && gy > 0 && gy < maxY) || (gx === maxX && gy > 0 && gy < maxY)) {
        return 'leftRoad';
      }
      // 上边和下边（不含角） → right-road
      if ((gy === 0 && gx > 0 && gx < maxX) || (gy === maxY && gx > 0 && gx < maxX)) {
        return 'rightRoad';
      }
      // inner tiles
      return 'turf';
    };

    for (let gy = 0; gy < TOWN_GRID_H; gy++) {
      for (let gx = 0; gx < TOWN_GRID_W; gx++) {
        const key = getFloorKey(gx, gy);
        const p = gridToScreen(gx, gy);
        const tex = this.floorTextures.get(key);
        if (tex) {
          const s = new PIXI.Sprite(tex);
          s.anchor.set(0.5, 0.5);
          s.position.set(p.x, p.y);
          this.groundTiles.addChild(s);
        } else {
          // fallback: simple checker diamond
          const fill = (gx + gy) % 2 === 0 ? 0x14161e : 0x1a1c26;
          const g = new PIXI.Graphics();
          g.poly(diamondPolygon(0, 0, 1)).fill({ color: fill, alpha: 1 });
          g.position.set(p.x, p.y);
          this.groundTiles.addChild(g);
        }
      }
    }
  }

  private upsertBuilding(type: string): PIXI.Container {
    const tex = this.textures.get(type);
    let c = this.buildingSprites.get(type);

    if (c) {
      // 贴图后来才加载好：把占位菱形换成精灵
      const first = c.children[0];
      if (first && !(first instanceof PIXI.Sprite) && tex) {
        c.removeChild(first);
        first.destroy();
        const s = new PIXI.Sprite(tex);
        s.anchor.set(0.5, 1);
        // Push sprite slightly downward so its base visually sits nearer the tile front edge
        s.position.y = ISO_TILE_H * 0.6;
        c.addChildAt(s, 0);
      }
      return c;
    }

    if (!this.buildingLayer) return new PIXI.Container();
    c = new PIXI.Container();

    if (tex) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5, 1);
      // Push sprite slightly downward so its base visually sits nearer the tile front edge
      s.position.y = ISO_TILE_H * 0.6;
      c.addChild(s);
    } else {
      const g = new PIXI.Graphics();
      g.poly(diamondPolygon(0, 0, 1.15)).fill({ color: 0x444444, alpha: 1 });
      g.poly(diamondPolygon(0, 0, 1.15)).stroke({ color: 0xffd700, width: 2, alpha: 1 });
      c.addChild(g);
    }

    const label = new PIXI.Text({
      text: '',
      style: new PIXI.TextStyle({
        fontFamily: 'sans-serif',
        fontSize: 11,
        fill: 0xffffff,
        align: 'center',
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, -ISO_TILE_H / 4);
    c.addChild(label);

    this.buildingLayer.addChild(c);
    this.buildingSprites.set(type, c);
    return c;
  }

  render(scene: TownPixiScene) {
    if (!this.app?.renderer || !this.root || !this.ground || !this.hoverGfx || !this.previewGfx || !this.buildingLayer) return;
    // 若尚未 resize 或画布为 0，用容器尺寸补一次，避免一直画到 0x0
    const r = this.app.renderer;
    if ((r.width === 0 || r.height === 0) && this.view.parentElement) {
      const w = this.view.parentElement.clientWidth;
      const h = this.view.parentElement.clientHeight;
      if (w > 0 && h > 0) {
        this.view.width = w;
        this.view.height = h;
        this.resize(w, h);
      }
    }
    void this.ensureTexturesLoaded();

    const { townState, townHoverCell, townDragBuilding, townSelectedBuilding } = scene;
    const positions: Record<string, { x: number; y: number }> = townState?.buildingPositions || {};

    // hover
    this.hoverGfx.clear();
    if (townHoverCell) {
      const p = gridToScreen(townHoverCell.x, townHoverCell.y);
      this.hoverGfx.poly(diamondPolygon(p.x, p.y, 1)).fill({ color: 0xffd700, alpha: 0.2 });
      this.hoverGfx.poly(diamondPolygon(p.x, p.y, 1)).stroke({ color: 0xffd700, width: 2, alpha: 0.7 });
    }

    // preview
    this.previewGfx.clear();
    if (townDragBuilding && townHoverCell) {
      const p = gridToScreen(townHoverCell.x, townHoverCell.y);
      this.previewGfx.poly(diamondPolygon(p.x, p.y, 1.15)).fill({ color: 0xffd700, alpha: 0.25 });
      this.previewGfx.poly(diamondPolygon(p.x, p.y, 1.15)).stroke({ color: 0xffd700, width: 2, alpha: 0.9 });
    }

    // buildings: depth order by gx+gy (iso)
    const sorted = Object.entries(positions)
      .map(([type, pos]) => ({ type, gx: pos.x, gy: pos.y }))
      .sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));

    // hide all first (cheap for small N)
    this.buildingSprites.forEach((c) => { c.visible = false; });

    for (const it of sorted) {
      const size = scene.buildingGridSize?.[it.type] ?? { w: 1, h: 1 };
      // Treat (gx,gy) as top-left of the footprint; render at footprint center.
      const centerGx = it.gx + (size.w - 1) / 2;
      const centerGy = it.gy + (size.h - 1) / 2;
      const p = gridToScreen(centerGx, centerGy);
      const c = this.upsertBuilding(it.type);
      c.visible = true;
      c.position.set(p.x, p.y);

      // Scale sprite to match footprint (so image size doesn't dictate tile coverage)
      const first = c.children[0];
      if (first instanceof PIXI.Sprite && first.texture?.width) {
        const targetW = footprintScreenWidth(size.w, size.h) * 0.95; // a bit inset for readability
        const s = targetW / first.texture.width;
        first.scale.set(s, s);
      } else if (first instanceof PIXI.Graphics) {
        // Placeholder: scale diamond roughly to footprint size
        first.clear();
        const scale = Math.max(1, (size.w + size.h) / 2) * 1.05;
        first.poly(diamondPolygon(0, 0, 1.15 * scale)).fill({ color: 0x444444, alpha: 1 });
        first.poly(diamondPolygon(0, 0, 1.15 * scale)).stroke({ color: 0xffd700, width: 2, alpha: 1 });
      }

      // update label
      const level = townState?.buildings?.[it.type] ?? 0;
      const label = c.children.find((ch) => ch instanceof PIXI.Text) as PIXI.Text | undefined;
      if (label) label.text = `Lv.${level}`;

      // selection outline (Pixi v8: use label instead of name)
      let outline = c.children.find((ch) => (ch as PIXI.Container).label === '__outline') as PIXI.Graphics | null;
      if (!outline) {
        outline = new PIXI.Graphics();
        outline.label = '__outline';
        c.addChild(outline);
      }
      outline.clear();
      if (townSelectedBuilding === it.type) {
        // Outline should cover the whole building footprint (w*h tiles), not just one tile
        const footprintScale = (size.w + size.h) / 2;
        outline.poly(diamondPolygon(0, 0, footprintScale * 1.05)).stroke({ color: 0xffaa00, width: 3, alpha: 1 });
      }
    }

    this.app.renderer.render(this.app.stage);
  }
}

