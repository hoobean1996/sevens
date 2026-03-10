import React from 'react';
import './StartScreen.css';

interface Props {
  onSelectHero: (hero: string) => void;
}

const StartScreen: React.FC<Props> = ({ onSelectHero }) => {
  return (
    <div className="start-screen">
      <div className="start-bg-deco" />
      <h1>七星传说</h1>
      <div className="subtitle">S E V E N S</div>
      <div className="hero-select">
        <div className="hero-card" onClick={() => onSelectHero('warrior')}>
          <div className="hero-icon">⚔️</div>
          <h3 style={{ color: '#ff4444' }}>战神·裂天</h3>
          <p>近战战士<br />裂空斩 | 盾击冲锋<br />战吼 | 七星审判</p>
        </div>
        <div className="hero-card locked">
          <div className="hero-icon">🏹</div>
          <h3 style={{ color: '#44ff44' }}>影弓·疾风</h3>
          <p>远程射手<br />即将开放</p>
        </div>
        <div className="hero-card locked">
          <div className="hero-icon">🔮</div>
          <h3 style={{ color: '#4488ff' }}>星术·天启</h3>
          <p>法师<br />即将开放</p>
        </div>
        <div className="hero-card locked">
          <div className="hero-icon">🗡️</div>
          <h3 style={{ color: '#ff44ff' }}>暗影·幻刺</h3>
          <p>刺客<br />即将开放</p>
        </div>
      </div>
      <div className="controls-hint">方向键/右键 移动 | Q W E R 技能 | F 拾取 | I 属性 | B 背包</div>
    </div>
  );
};

export default StartScreen;
