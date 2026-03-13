import * as PIXI from 'pixi.js';
import { ISO_TILE_H, ISO_TILE_W, gridToScreen } from './townConfig';
import { ensureTownAssetsReady, getTownTexture } from './townAssets';
import { getBuildingDef } from './townDefinitions';
import { BuildingInstance, TownMapData } from './types';
import { TownSnapshot } from './TownController';

function diamondPolygon(cx: number, cy: number, scale = 1) {
  const w = (ISO_TILE_W / 2) * scale;
  const h = (ISO_TILE_H / 2) * scale;
  return [cx - w, cy, cx, cy - h, cx + w, cy, cx, cy + h];
}

function footprintWidth(w: number, h: number) {
  return (w + h) * (ISO_TILE_W / 2);
}

type BuildingNode = {
  container: PIXI.Container;
  sprite: PIXI.Sprite | PIXI.Graphics;
  label: PIXI.Text;
  outline: PIXI.Graphics;
  signature: string;
  sortValue: number;
};

export class TownPixiRenderer {
  private view: HTMLCanvasElement;
  private app: PIXI.Application | null = null;
  private root: PIXI.Container | null = null;
  private groundBase: PIXI.Graphics | null = null;
  private groundLayer: PIXI.Container | null = null;
  private overlayLayer: PIXI.Container | null = null;
  private buildingLayer: PIXI.Container | null = null;
  private hoverGfx: PIXI.Graphics | null = null;
  private previewGfx: PIXI.Graphics | null = null;
  private buildingNodes = new Map<string, BuildingNode>();
  private cssWidth = 0;
  private cssHeight = 0;
  private zoom = 1;
  private cameraX = 0;
  private cameraY = 0;
  private initialZoomSet = false;
  private assetsReady = false;
  private snapshot: TownSnapshot | null = null;
  private lastMapVersion = -1;
  private lastObjectsVersion = -1;
  private lastSelectionId: string | null = null;
  private lastHoverKey = '';
  private lastPreviewKey = '';
  private sortDirty = false;

  constructor(view: HTMLCanvasElement) {
    this.view = view;
  }

  async init(): Promise<void> {
    if (this.app) return;
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

    this.root = new PIXI.Container();
    this.groundBase = new PIXI.Graphics();
    this.groundLayer = new PIXI.Container();
    this.overlayLayer = new PIXI.Container();
    this.buildingLayer = new PIXI.Container();
    this.hoverGfx = new PIXI.Graphics();
    this.previewGfx = new PIXI.Graphics();

    this.root.addChild(this.groundBase, this.groundLayer, this.overlayLayer, this.buildingLayer, this.hoverGfx, this.previewGfx);
    this.app.stage.addChild(this.root);

    await ensureTownAssetsReady();
    this.assetsReady = true;
  }

  destroy() {
    if (!this.app) return;
    this.app.destroy(true, { children: true, texture: false });
    this.app = null;
    this.root = null;
    this.groundBase = null;
    this.groundLayer = null;
    this.overlayLayer = null;
    this.buildingLayer = null;
    this.hoverGfx = null;
    this.previewGfx = null;
    this.buildingNodes.clear();
  }

  resize(width: number, height: number) {
    if (!this.app?.renderer) return;
    this.app.renderer.resize(width, height);
    this.cssWidth = width;
    this.cssHeight = height;
    if (this.snapshot?.townState.map && !this.initialZoomSet && width > 0 && height > 0) {
      const mapW = (this.snapshot.townState.map.width + this.snapshot.townState.map.height) * (ISO_TILE_W / 2);
      const mapH = (this.snapshot.townState.map.width + this.snapshot.townState.map.height) * (ISO_TILE_H / 2);
      this.zoom = Math.max(0.5, Math.min(3.5, Math.min(width / mapW, height / mapH) * 0.85));
      this.initialZoomSet = true;
    }
    this.applyCameraTransform();
  }

  getZoom() {
    return this.zoom;
  }

  getCamera() {
    return { x: this.cameraX, y: this.cameraY };
  }

  updateCamera(camera: { x: number; y: number; zoom: number }) {
    this.cameraX = camera.x;
    this.cameraY = camera.y;
    this.zoom = camera.zoom;
    this.applyCameraTransform();
  }

  setTownData(snapshot: TownSnapshot) {
    this.snapshot = snapshot;
    if (snapshot.versions.map !== this.lastMapVersion) {
      this.rebuildGround(snapshot.townState.map);
      this.lastMapVersion = snapshot.versions.map;
    }
    if (snapshot.versions.objects !== this.lastObjectsVersion) {
      this.syncBuildings(snapshot.townState.buildingInstances);
      this.lastObjectsVersion = snapshot.versions.objects;
    }
    this.updateSelection(snapshot.selectedEntityId);
    this.updateHover(snapshot.townHoverCell);
    this.updatePreview(snapshot.previewPlacement);
  }

  selectEntity(entityId: string | null) {
    this.updateSelection(entityId);
  }

  previewPlacement(preview: { type: string; gx: number; gy: number } | null) {
    this.updatePreview(preview);
  }

  render(snapshot?: TownSnapshot) {
    if (!this.app?.renderer || !this.root) return;
    if (snapshot) this.setTownData(snapshot);
    if (this.sortDirty) this.sortBuildings();
    this.app.renderer.render(this.app.stage);
  }

  private applyCameraTransform() {
    if (!this.root || !this.snapshot) return;
    const rect = this.view.getBoundingClientRect();
    const width = this.cssWidth || rect.width || 1;
    const height = this.cssHeight || rect.height || 1;
    const map = this.snapshot.townState.map;
    const isoCenter = gridToScreen((map.width - 1) / 2, (map.height - 1) / 2);
    this.root.scale.set(this.zoom);
    this.root.position.set(width / 2 - isoCenter.x * this.zoom + this.cameraX, height / 2 - isoCenter.y * this.zoom + this.cameraY);
  }

  private rebuildGround(map: TownMapData) {
    if (!this.groundBase || !this.groundLayer || !this.overlayLayer) return;
    this.groundBase.clear();
    const totalW = (map.width + map.height) * (ISO_TILE_W / 2);
    const totalH = (map.width + map.height) * (ISO_TILE_H / 2);
    this.groundBase.beginFill(0x080910, 1);
    this.groundBase.drawRect(-totalW, -totalH, totalW * 2, totalH * 2);
    this.groundBase.endFill();

    this.groundLayer.removeChildren();
    this.overlayLayer.removeChildren();

    const { ground, overlay } = map.layers;
    for (let gy = 0; gy < map.height; gy++) {
      for (let gx = 0; gx < map.width; gx++) {
        const p = gridToScreen(gx, gy);
        this.groundLayer.addChild(this.createTileSprite(ground.tiles[gy * ground.width + gx], p.x, p.y));
        const overlayKey = overlay.tiles[gy * overlay.width + gx];
        if (overlayKey && overlayKey !== 'empty') {
          this.overlayLayer.addChild(this.createTileSprite(overlayKey, p.x, p.y));
        }
      }
    }
    this.applyCameraTransform();
  }

  private createTileSprite(textureKey: string, x: number, y: number) {
    const texture = this.assetsReady ? getTownTexture(textureKey) : null;
    if (texture) {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprite.position.set(x, y);
      return sprite;
    }
    const fallback = new PIXI.Graphics();
    fallback.poly(diamondPolygon(0, 0)).fill({ color: 0x1a1c26, alpha: 1 });
    fallback.position.set(x, y);
    return fallback;
  }

  private syncBuildings(instances: BuildingInstance[]) {
    if (!this.buildingLayer) return;
    const nextIds = new Set(instances.map((instance) => instance.id));

    for (const [id, node] of Array.from(this.buildingNodes.entries())) {
      if (nextIds.has(id)) continue;
      node.container.destroy({ children: true });
      this.buildingNodes.delete(id);
    }

    for (const instance of instances) {
      const node = this.ensureBuildingNode(instance);
      const signature = `${instance.type}:${instance.level}:${instance.gx}:${instance.gy}:${instance.rotation}:${instance.variant}`;
      if (node.signature !== signature) {
        this.applyBuildingNode(node, instance);
        node.signature = signature;
      }
    }

    this.sortDirty = true;
  }

  private ensureBuildingNode(instance: BuildingInstance): BuildingNode {
    const cached = this.buildingNodes.get(instance.id);
    if (cached) return cached;

    const container = new PIXI.Container();
    const texture = this.assetsReady ? getTownTexture(getBuildingDef(instance.type).textureKey) : null;
    const sprite = texture ? new PIXI.Sprite(texture) : new PIXI.Graphics();
    if (sprite instanceof PIXI.Sprite) {
      sprite.anchor.set(0.5, 1);
    }
    const label = new PIXI.Text({
      text: '',
      style: new PIXI.TextStyle({
        fontFamily: 'sans-serif',
        fontSize: 11,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    label.anchor.set(0.5, 0.5);
    const outline = new PIXI.Graphics();
    container.addChild(sprite, label, outline);
    this.buildingLayer?.addChild(container);

    const node: BuildingNode = {
      container,
      sprite,
      label,
      outline,
      signature: '',
      sortValue: 0,
    };
    this.buildingNodes.set(instance.id, node);
    return node;
  }

  private applyBuildingNode(node: BuildingNode, instance: BuildingInstance) {
    const def = getBuildingDef(instance.type);
    const centerGx = instance.gx + (def.footprint.w - 1) / 2;
    const centerGy = instance.gy + (def.footprint.h - 1) / 2;
    const position = gridToScreen(centerGx, centerGy);
    node.container.position.set(position.x, position.y);
    node.label.text = `Lv.${instance.level}`;
    node.label.position.set(0, -ISO_TILE_H / 4);

    if (node.sprite instanceof PIXI.Sprite) {
      const texture = this.assetsReady ? getTownTexture(def.textureKey) : null;
      if (texture && node.sprite.texture !== texture) node.sprite.texture = texture;
      node.sprite.anchor.set(def.anchor.x, def.anchor.y);
      node.sprite.position.y = def.anchorOffsetY;
      const targetWidth = footprintWidth(def.footprint.w, def.footprint.h) * 0.95;
      const scale = node.sprite.texture.width > 0 ? targetWidth / node.sprite.texture.width : 1;
      node.sprite.scale.set(scale, scale);
    } else {
      node.sprite.clear();
      const scale = Math.max(1, (def.footprint.w + def.footprint.h) / 2) * 1.05;
      node.sprite.poly(diamondPolygon(0, 0, scale)).fill({ color: 0x444444, alpha: 1 });
      node.sprite.poly(diamondPolygon(0, 0, scale)).stroke({ color: 0xffd700, width: 2, alpha: 1 });
    }

    node.sortValue = position.y + def.obstacleHeight;
    node.container.zIndex = node.sortValue;
  }

  private updateSelection(entityId: string | null) {
    if (this.lastSelectionId === entityId) return;
    this.lastSelectionId = entityId;
    for (const [id, node] of Array.from(this.buildingNodes.entries())) {
      const instance = this.snapshot?.townState.buildingInstances.find((item) => item.id === id);
      if (!instance) continue;
      const def = getBuildingDef(instance.type);
      node.outline.clear();
      if (id !== entityId) continue;
      const scale = (def.footprint.w + def.footprint.h) / 2;
      node.outline.poly(diamondPolygon(0, 0, scale * 1.05)).stroke({ color: 0xffaa00, width: 3, alpha: 1 });
    }
  }

  private updateHover(cell: { x: number; y: number } | null) {
    if (!this.hoverGfx) return;
    const nextKey = cell ? `${cell.x},${cell.y}` : '';
    if (this.lastHoverKey === nextKey) return;
    this.lastHoverKey = nextKey;
    this.hoverGfx.clear();
    if (!cell) return;
    const p = gridToScreen(cell.x, cell.y);
    this.hoverGfx.poly(diamondPolygon(p.x, p.y)).fill({ color: 0xffd700, alpha: 0.18 });
    this.hoverGfx.poly(diamondPolygon(p.x, p.y)).stroke({ color: 0xffd700, width: 2, alpha: 0.7 });
  }

  private updatePreview(preview: { type: string; gx: number; gy: number } | null) {
    if (!this.previewGfx) return;
    const nextKey = preview ? `${preview.type}:${preview.gx},${preview.gy}` : '';
    if (this.lastPreviewKey === nextKey) return;
    this.lastPreviewKey = nextKey;
    this.previewGfx.clear();
    if (!preview) return;
    const def = getBuildingDef(preview.type);
    const centerGx = preview.gx + (def.footprint.w - 1) / 2;
    const centerGy = preview.gy + (def.footprint.h - 1) / 2;
    const p = gridToScreen(centerGx, centerGy);
    const scale = (def.footprint.w + def.footprint.h) / 2;
    this.previewGfx.poly(diamondPolygon(p.x, p.y, scale * 1.05)).fill({ color: 0xffd700, alpha: 0.2 });
    this.previewGfx.poly(diamondPolygon(p.x, p.y, scale * 1.05)).stroke({ color: 0xffd700, width: 2, alpha: 0.9 });
  }

  private sortBuildings() {
    if (!this.buildingLayer) return;
    const nodes = Array.from(this.buildingNodes.values()).sort((a, b) => a.sortValue - b.sortValue);
    for (const node of nodes) this.buildingLayer.addChild(node.container);
    this.sortDirty = false;
  }
}


