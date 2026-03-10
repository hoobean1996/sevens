import React from 'react';
import { PlayerState, TownBonus } from '../engine/types';
import './HUD.css';

interface Props {
  player: PlayerState | null;
  wave: number;
  townBonus: TownBonus;
}

const HUD: React.FC<Props> = ({ player, wave, townBonus }) => {
  if (!player) return null;

  const displayMaxHP = Math.round(player.max_hp * townBonus.hpMult);
  const displayHP = Math.min(displayMaxHP, player.hp);
  const hpPct = (displayHP / displayMaxHP * 100) + '%';
  const mpPct = (player.mp / player.max_mp * 100) + '%';

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-portrait">⚔️</div>
        <div className="hud-bars">
          <div className="hud-bar">
            <div className="hud-bar-fill hp-fill" style={{ width: hpPct }} />
            <div className="hud-bar-text">{displayHP} / {displayMaxHP}</div>
          </div>
          <div className="hud-bar">
            <div className="hud-bar-fill mp-fill" style={{ width: mpPct }} />
            <div className="hud-bar-text">{player.mp} / {player.max_mp}</div>
          </div>
          <div className="hud-bar" style={{ height: 8 }}>
            <div className="hud-bar-fill xp-fill" style={{ width: '0%' }} />
          </div>
        </div>
        <div className="hud-info">
          <div>LV <span>{player.level}</span></div>
          <div>WAVE <span>{wave}</span></div>
        </div>
      </div>
    </div>
  );
};

export default HUD;
