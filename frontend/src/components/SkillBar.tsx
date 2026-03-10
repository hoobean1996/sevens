import React from 'react';
import { PlayerState } from '../engine/types';
import './SkillBar.css';

interface Props {
  player: PlayerState | null;
}

const SKILLS = [
  { slot: 'q', icon: '⚔️', name: '裂空斩' },
  { slot: 'w', icon: '🛡️', name: '盾击' },
  { slot: 'e', icon: '📢', name: '战吼' },
  { slot: 'r', icon: '💥', name: '七星审判' },
];

const SkillBar: React.FC<Props> = ({ player }) => {
  if (!player) return null;

  return (
    <div className="skillbar">
      {SKILLS.map((sk) => {
        const state = player.skills?.[sk.slot];
        const onCd = state && state.cd_remain > 0;
        return (
          <div
            key={sk.slot}
            className="skill-slot"
            style={{ borderColor: onCd ? '#333' : (sk.slot === 'r' ? '#ffd700' : '#888') }}
          >
            <div className="skill-key">{sk.slot.toUpperCase()}</div>
            <div className="skill-icon">{sk.icon}</div>
            {onCd && (
              <div className="skill-cd">{Math.ceil(state.cd_remain)}</div>
            )}
            <div className="skill-name">{sk.name}</div>
          </div>
        );
      })}
    </div>
  );
};

export default SkillBar;
