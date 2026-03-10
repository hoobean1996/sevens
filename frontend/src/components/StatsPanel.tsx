import React from 'react';
import { PlayerState, TownBonus } from '../engine/types';
import './StatsPanel.css';

interface Props {
  player: PlayerState | null;
  townBonus: TownBonus;
  onClose: () => void;
}

const StatsPanel: React.FC<Props> = ({ player, townBonus, onClose }) => {
  if (!player || !player.attrs) return null;

  const a = player.attrs;
  const displayMaxHP = Math.round(player.max_hp * townBonus.hpMult);
  const displayHP = Math.min(displayMaxHP, player.hp);
  const heroNames: Record<string, string> = { warrior: '战神·裂天' };

  return (
    <div className="stats-panel ui-panel" id="stats-panel">
      <div className="panel-header">
        <h2>⚔ 角色属性</h2>
        <span className="close-btn" onClick={onClose}>&times;</span>
      </div>
      <div className="panel-body">
        <div className="stat-section">
          <h3>基础信息</h3>
          <StatRow label="角色名" value={player.name || '-'} />
          <StatRow label="职业" value={heroNames[player.hero] || player.hero} />
          <StatRow label="等级" value={String(player.level)} className="orange" />
        </div>
        <div className="stat-section">
          <h3>生命 / 魔力</h3>
          <StatRow label="生命值" value={`${displayHP} / ${displayMaxHP}`} className="green" />
          <StatRow label="魔力值" value={`${player.mp} / ${player.max_mp}`} className="blue" />
          <StatRow label="生命回复" value={`${a.hp_regen.toFixed(1)}/s`} className="green" />
          <StatRow label="魔力回复" value={`${a.mp_regen.toFixed(1)}/s`} className="blue" />
        </div>
        <div className="stat-section">
          <h3>攻击</h3>
          <StatRow label="攻击力" value={String(Math.round(a.atk * townBonus.atkMult))} className="orange" />
          <StatRow label="攻击速度" value={`${a.atk_speed.toFixed(2)}x`} />
          <StatRow label="暴击率" value={`${(a.crit_rate * 100).toFixed(1)}%`} className="orange" />
          <StatRow label="暴击伤害" value={`${(a.crit_dmg * 100).toFixed(0)}%`} className="orange" />
          <StatRow label="伤害加成" value={`${(a.dmg_bonus * 100).toFixed(1)}%`} />
        </div>
        <div className="stat-section">
          <h3>防御</h3>
          <StatRow label="防御力" value={String(Math.round(a.def * townBonus.defMult))} />
          <StatRow label="护甲" value={String(a.armor)} />
          <StatRow label="闪避率" value={`${(a.dodge * 100).toFixed(1)}%`} />
          <StatRow label="伤害减免" value={`${(a.dmg_reduce * 100).toFixed(1)}%`} />
        </div>
        <div className="stat-section">
          <h3>其他</h3>
          <StatRow label="移动速度" value={String(Math.round(a.move_speed))} />
          <StatRow label="生命偷取" value={`${(a.life_steal * 100).toFixed(1)}%`} className="green" />
          <StatRow label="冷却缩减" value={`${(a.cd_reduce * 100).toFixed(1)}%`} className="blue" />
        </div>
      </div>
    </div>
  );
};

const StatRow: React.FC<{ label: string; value: string; className?: string }> = ({ label, value, className }) => (
  <div className="stat-row">
    <span className="stat-label">{label}</span>
    <span className={`stat-value ${className || ''}`}>{value}</span>
  </div>
);

export default StatsPanel;
