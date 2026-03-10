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
}

export interface JoinedMessage {
  type: 'joined';
  player_id: string;
  map_width: number;
  map_height: number;
}

export interface PickupMessage {
  type: 'pickup_ok';
  name: string;
  rarity: number;
  slot: string;
}

export interface TownState {
  resources: { wood: number; stone: number; ore: number; gold: number };
  buildings: Record<string, number>;
  caps: { equipSlots: number; materialSlots: number };
}

export interface TownBonus {
  atkMult: number;
  hpMult: number;
  defMult: number;
}

export const RARITY_NAMES = ['普通', '优秀', '稀有', '史诗', '传说'];
export const RARITY_COLORS = ['#cccccc', '#44ff44', '#4488ff', '#bb44ff', '#ff8800'];
export const SLOT_NAMES: Record<string, string> = {
  weapon: '武器', armor: '铠甲', helmet: '头盔',
  boots: '战靴', ring: '戒指', amulet: '项链',
};
export const SLOT_ICONS: Record<string, string> = {
  weapon: '⚔', armor: '🛡', helmet: '⛑',
  boots: '👢', ring: '💍', amulet: '📿',
};
