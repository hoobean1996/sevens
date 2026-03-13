// ==================== SHARED GAME TYPES ====================

export interface KeyState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}

export interface PlayerState {
  id: string;
  hero: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  facing: string;
  angle: number;
  anim: string;
  anim_frame: number;
  level: number;
  gold: number;
  skills: Record<string, SkillState>;
  attrs: Attributes;
  equipped?: Record<string, Equipment>;
  inventory?: Equipment[];
}

export interface SkillState {
  cd_remain: number;
  max_cd: number;
}

export interface Attributes {
  atk: number;
  def: number;
  atk_speed: number;
  move_speed: number;
  crit_rate: number;
  crit_dmg: number;
  hp_regen: number;
  mp_regen: number;
  armor: number;
  dodge: number;
  life_steal: number;
  cd_reduce: number;
  dmg_bonus: number;
  dmg_reduce: number;
}

export interface Equipment {
  id: string;
  name: string;
  slot: string;
  rarity: number;
  level: number;
  atk?: number;
  def?: number;
  max_hp?: number;
  max_mp?: number;
  atk_speed?: number;
  move_speed?: number;
  crit_rate?: number;
  crit_dmg?: number;
  hp_regen?: number;
  mp_regen?: number;
  armor?: number;
  dodge?: number;
  life_steal?: number;
  cd_reduce?: number;
  dmg_bonus?: number;
  dmg_reduce?: number;
}

export interface EnemyState {
  id: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  anim: string;
  facing: string;
}

export interface EffectState {
  id: string;
  kind: string;
  x: number;
  y: number;
  age: number;
  duration: number;
  params: Record<string, number>;
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  crit: boolean;
}

export interface GroundDrop {
  id: string;
  x: number;
  y: number;
  age: number;
  equip: Equipment;
}

export interface GameState {
  type: string;
  tick: number;
  wave: number;
  map_width: number;
  map_height: number;
  players: PlayerState[];
  enemies: EnemyState[];
  effects: EffectState[];
  drops: GroundDrop[];
  damage_nums: DamageNumber[];
  arena_mode?: boolean;
  shop_phase?: boolean;
  shop_timer?: number;
  shops?: ShopState[];
}

export interface ShopState {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  items: ShopItem[];
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  rarity: string;
  item_type: string;
  slot?: string;
  atk?: number;
  def?: number;
  atk_speed?: number;
  crit_rate?: number;
  crit_dmg?: number;
  life_steal?: number;
  hp_regen?: number;
  heal_hp?: number;
  heal_mp?: number;
  max_hp_bonus?: number;
  atk_bonus?: number;
}

export interface JoinedMessage {
  type: 'joined';
  player_id: string;
  map_width: number;
  map_height: number;
  arena_mode?: boolean;
}

export interface ShopResultMessage {
  type: 'shop_result';
  success: boolean;
  message: string;
}

export interface PickupMessage {
  type: 'pickup_ok';
  name: string;
  rarity: number;
  slot: string;
}

export interface BuildQueueItem {
  buildingId: string;
  buildingType: string;
  fromLevel: number;
  completesAt: number;
}

export interface BuildingPosition {
  x: number;
  y: number;
}

export interface TownTileLayer {
  id: string;
  width: number;
  height: number;
  tiles: string[];
  chunkSize?: number;
}

export interface TownMapData {
  version: number;
  width: number;
  height: number;
  layers: {
    ground: TownTileLayer;
    overlay: TownTileLayer;
    objects: TownTileLayer;
  };
}

export interface BuildingInstance {
  id: string;
  type: string;
  gx: number;
  gy: number;
  level: number;
  rotation: number;
  variant: string;
}

export type TownInteractionMode = 'preview' | 'edit';

export interface TownState {
  resources: { wood: number; stone: number; ore: number; gold: number };
  buildings: Record<string, number>;
  caps: { equipSlots: number; materialSlots: number };
  buildQueue: (BuildQueueItem | null)[];
  map: TownMapData;
  buildingInstances: BuildingInstance[];
  buildingPositions?: Record<string, BuildingPosition>;
}

export interface TownBonus {
  atkMult: number;
  hpMult: number;
  defMult: number;
}

export const RARITY_NAMES = ['普通', '优秀', '稀有', '史诗', '传说'];
export const RARITY_COLORS = ['#cccccc', '#44ff44', '#4488ff', '#bb44ff', '#ff8800'];

export const RARITY_STRING_COLORS: Record<string, string> = {
  common: '#cccccc',
  uncommon: '#44ff44',
  rare: '#4488ff',
  epic: '#bb44ff',
  legendary: '#ff8800',
};

export const SHOP_ICONS: Record<string, string> = {
  weapon: 'W',
  armor: 'A',
  potion: 'P',
  upgrade: 'U',
};

export const SLOT_NAMES: Record<string, string> = {
  weapon: '武器',
  armor: '护甲',
  helmet: '头盔',
  boots: '靴子',
  ring: '戒指',
  amulet: '项链',
};

export const SLOT_ICONS: Record<string, string> = {
  weapon: '武',
  armor: '甲',
  helmet: '盔',
  boots: '靴',
  ring: '戒',
  amulet: '链',
};
