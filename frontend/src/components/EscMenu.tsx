import React from 'react';
import { sfx } from '../engine/SoundSystem';
import './EscMenu.css';

interface Props {
  onClose: () => void;
  onOpenStats: () => void;
  onOpenInventory: () => void;
  onBackToTown: () => void;
}

const EscMenu: React.FC<Props> = ({ onClose, onOpenStats, onOpenInventory, onBackToTown }) => {
  const [volume, setVolume] = React.useState(30);

  const handleVolume = (val: number) => {
    setVolume(val);
    sfx.volume = val / 100;
  };

  return (
    <div className="esc-menu-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="esc-menu">
        <h2>菜 单</h2>
        <button className="esc-btn" onClick={onClose}>继续游戏</button>
        <button className="esc-btn" onClick={() => { onClose(); onOpenStats(); }}>属性面板 (I)</button>
        <button className="esc-btn" onClick={() => { onClose(); onOpenInventory(); }}>背包装备 (B)</button>
        <div className="esc-volume">
          <span>音量</span>
          <input type="range" min={0} max={100} value={volume} onChange={(e) => handleVolume(Number(e.target.value))} />
          <span>{volume}%</span>
        </div>
        <button className="esc-btn danger" onClick={onBackToTown}>返回城镇</button>
      </div>
    </div>
  );
};

export default EscMenu;
