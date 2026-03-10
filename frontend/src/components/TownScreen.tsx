import React from 'react';
import { TownState } from '../engine/types';
import './TownScreen.css';

interface Props {
  townState: TownState | null;
  resourceCaps: { wood: number; stone: number; ore: number };
  onStartAdventure: () => void;
  onUpgrade: (type: string) => void;
}

const BUILDINGS = [
  { key: 'hall', icon: '🏛️', name: '市政厅', desc: '决定其他建筑最高等级', upgradable: true },
  { key: 'warehouse', icon: '📦', name: '仓库', desc: '提高资源存储上限', upgradable: true },
  { key: 'lumber', icon: '🌲', name: '伐木场', desc: '自动产出木材', upgradable: true },
  { key: 'quarry', icon: '🪨', name: '采石场', desc: '自动产出石材', upgradable: true },
  { key: 'mine', icon: '⛏️', name: '采矿场', desc: '自动产出矿石', upgradable: true },
  { key: 'blacksmith', icon: '⚒️', name: '铁匠铺', desc: '打造武器防具 (即将开放)', upgradable: false },
  { key: 'tavern', icon: '🍖', name: '餐厅', desc: '冒险前增益 (即将开放)', upgradable: false },
  { key: 'alchemy', icon: '⚗️', name: '炼金工坊', desc: '制作药剂 (即将开放)', upgradable: false },
];

const TownScreen: React.FC<Props> = ({ townState, resourceCaps, onStartAdventure, onUpgrade }) => {
  const r = townState?.resources || { wood: 0, stone: 0, ore: 0, gold: 0 };
  const b = townState?.buildings || {};

  return (
    <div className="town-screen">
      <div className="town-top">
        <div className="town-title">七星之都</div>
        <div className="town-subtitle">T O W N &nbsp; O F &nbsp; S E V E N S</div>
        <div className="town-resources">
          <div>木材 <span>{Math.floor(r.wood)}</span> / {resourceCaps.wood}</div>
          <div>石材 <span>{Math.floor(r.stone)}</span> / {resourceCaps.stone}</div>
          <div>矿石 <span>{Math.floor(r.ore)}</span> / {resourceCaps.ore}</div>
          <div>金币 <span>{Math.floor(r.gold)}</span></div>
        </div>
      </div>

      <div className="town-center">
        <button className="town-start-btn" onClick={onStartAdventure}>开 始 冒 险</button>
        <div className="town-start-hint">进入战场，击败怪物获取装备与经验</div>
      </div>

      <div className="town-buildings">
        <h3>建 筑</h3>
        <div className="town-grid">
          {BUILDINGS.map((bd) => (
            <div key={bd.key} className={`town-building-card ${!bd.upgradable ? 'locked' : ''}`}>
              <div className="town-building-header">
                <div className="town-building-name">
                  <span className="icon">{bd.icon}</span>
                  <span>{bd.name}</span>
                </div>
                {bd.upgradable && (
                  <div className="town-building-level">Lv.{b[bd.key] ?? 0}</div>
                )}
              </div>
              <div className="town-building-desc">{bd.desc}</div>
              {bd.upgradable && (
                <div className="town-building-actions">
                  <button className="town-upgrade-btn" onClick={() => onUpgrade(bd.key)}>升级</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="town-footer">临时会话城镇 · 刷新页面后进度重置 · 后续接入存档系统</div>
    </div>
  );
};

export default TownScreen;
