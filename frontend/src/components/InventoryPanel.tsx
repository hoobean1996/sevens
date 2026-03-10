import React, { useState } from 'react';
import { PlayerState, Equipment, RARITY_COLORS, RARITY_NAMES, SLOT_NAMES, SLOT_ICONS } from '../engine/types';
import { Network } from '../engine/Network';
import './InventoryPanel.css';

interface Props {
  player: PlayerState | null;
  network: Network;
  onClose: () => void;
}

const STAT_LIST: [string, string, (v: number) => string][] = [
  ['atk', '攻击力', (v) => `+${v}`],
  ['def', '防御力', (v) => `+${v}`],
  ['max_hp', '生命上限', (v) => `+${v}`],
  ['max_mp', '魔力上限', (v) => `+${v}`],
  ['atk_speed', '攻击速度', (v) => `+${(v * 100).toFixed(0)}%`],
  ['move_speed', '移动速度', (v) => `+${v.toFixed(0)}`],
  ['crit_rate', '暴击率', (v) => `+${(v * 100).toFixed(1)}%`],
  ['crit_dmg', '暴击伤害', (v) => `+${(v * 100).toFixed(0)}%`],
  ['hp_regen', '生命回复', (v) => `+${v.toFixed(1)}/s`],
  ['mp_regen', '魔力回复', (v) => `+${v.toFixed(1)}/s`],
  ['armor', '护甲', (v) => `+${v}`],
  ['dodge', '闪避率', (v) => `+${(v * 100).toFixed(1)}%`],
  ['life_steal', '生命偷取', (v) => `+${(v * 100).toFixed(1)}%`],
  ['cd_reduce', '冷却缩减', (v) => `+${(v * 100).toFixed(1)}%`],
  ['dmg_bonus', '伤害加成', (v) => `+${(v * 100).toFixed(1)}%`],
  ['dmg_reduce', '伤害减免', (v) => `+${(v * 100).toFixed(1)}%`],
];

const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];

const InventoryPanel: React.FC<Props> = ({ player, network, onClose }) => {
  const [detailItem, setDetailItem] = useState<{ eq: Equipment; source: string } | null>(null);

  if (!player) return null;

  const handleEquip = (eqID: string) => {
    network.send({ type: 'equip', equip_id: eqID });
    setDetailItem(null);
  };

  const handleUnequip = (slot: string) => {
    network.send({ type: 'unequip', slot });
    setDetailItem(null);
  };

  const inv = player.inventory || [];

  return (
    <>
      <div className="inventory-panel ui-panel" id="inventory-panel">
        <div className="panel-header">
          <h2>背包 / 装备</h2>
          <span className="close-btn" onClick={onClose}>&times;</span>
        </div>
        <div className="panel-body">
          <div className="equip-section">
            <h3>已装备</h3>
            <div className="equip-grid">
              {EQUIP_SLOTS.map((slot) => {
                const eq = player.equipped?.[slot];
                return (
                  <div
                    key={slot}
                    className="equip-slot"
                    style={{ borderColor: eq ? RARITY_COLORS[eq.rarity] : '#333' }}
                    onClick={() => eq && handleUnequip(slot)}
                    onContextMenu={(e) => { e.preventDefault(); if (eq) setDetailItem({ eq, source: 'equipped' }); }}
                  >
                    <div className="eq-icon" style={{ color: eq ? RARITY_COLORS[eq.rarity] : '#333' }}>
                      {SLOT_ICONS[slot]}
                    </div>
                    <div className="eq-name" style={{ color: eq ? RARITY_COLORS[eq.rarity] : '#555' }}>
                      {eq ? eq.name : SLOT_NAMES[slot]}
                    </div>
                    {eq && <div className="eq-level">Lv.{eq.level}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bag-section">
            <div className="bag-header">
              <h3>背包</h3>
              <span>{inv.length}/20</span>
            </div>
            <div className="bag-items">
              {inv.length === 0 ? (
                <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>背包空空如也</div>
              ) : (
                inv.map((item) => (
                  <div
                    key={item.id}
                    className="bag-item"
                    style={{ borderColor: RARITY_COLORS[item.rarity] }}
                    onClick={() => handleEquip(item.id)}
                    onContextMenu={(e) => { e.preventDefault(); setDetailItem({ eq: item, source: 'bag' }); }}
                  >
                    <span style={{ color: RARITY_COLORS[item.rarity] }}>{SLOT_ICONS[item.slot] || '?'}</span>
                    <span className="bag-name" style={{ color: RARITY_COLORS[item.rarity] }}>{item.name}</span>
                    <span className="bag-slot">{SLOT_NAMES[item.slot]}</span>
                    <span className="bag-level">Lv.{item.level}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {detailItem && (
        <ItemDetail
          eq={detailItem.eq}
          source={detailItem.source}
          onClose={() => setDetailItem(null)}
          onEquip={handleEquip}
          onUnequip={handleUnequip}
        />
      )}
    </>
  );
};

interface ItemDetailProps {
  eq: Equipment;
  source: string;
  onClose: () => void;
  onEquip: (id: string) => void;
  onUnequip: (slot: string) => void;
}

const ItemDetail: React.FC<ItemDetailProps> = ({ eq, source, onClose, onEquip, onUnequip }) => {
  const color = RARITY_COLORS[eq.rarity];
  const rarityName = RARITY_NAMES[eq.rarity];

  return (
    <div className="item-detail ui-panel" id="item-detail">
      <div className="detail-header" style={{ borderColor: color }}>
        <div className="detail-icon" style={{ color }}>{SLOT_ICONS[eq.slot] || '?'}</div>
        <div className="detail-title">
          <div className="detail-name" style={{ color }}>{eq.name}</div>
          <div className="detail-sub">
            <span style={{ color }}>{rarityName}</span> · {SLOT_NAMES[eq.slot]} · Lv.{eq.level}
          </div>
        </div>
        <span className="detail-close" onClick={onClose}>&times;</span>
      </div>
      <div className="detail-stats">
        {STAT_LIST.map(([key, label, fmt]) => {
          const val = (eq as any)[key];
          if (!val) return null;
          return (
            <div key={key} className="detail-stat">
              <span className="detail-stat-label">{label}</span>
              <span className="detail-stat-val" style={{ color: '#4f4' }}>{fmt(val)}</span>
            </div>
          );
        })}
      </div>
      <div className="detail-actions">
        {source === 'bag' ? (
          <button className="detail-btn detail-btn-equip" onClick={() => onEquip(eq.id)}>装备</button>
        ) : (
          <button className="detail-btn detail-btn-unequip" onClick={() => onUnequip(eq.slot)}>卸下</button>
        )}
      </div>
    </div>
  );
};

export default InventoryPanel;
