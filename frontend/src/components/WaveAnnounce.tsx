import React, { useEffect, useState } from 'react';
import './WaveAnnounce.css';

interface Props {
  wave: number;
}

const WaveAnnounce: React.FC<Props> = ({ wave }) => {
  const [visible, setVisible] = useState(false);
  const [displayWave, setDisplayWave] = useState(0);

  useEffect(() => {
    if (wave > 0) {
      setDisplayWave(wave);
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [wave]);

  const isBoss = displayWave % 5 === 0;

  return (
    <div
      className={`wave-announce ${visible ? 'visible' : ''}`}
      style={{
        color: isBoss ? '#ff4400' : '#ffd700',
        textShadow: isBoss ? '0 0 40px rgba(255,68,0,0.6)' : '0 0 40px rgba(255,215,0,0.6)',
      }}
    >
      {isBoss ? `⚠ BOSS WAVE ${displayWave} ⚠` : `WAVE ${displayWave}`}
    </div>
  );
};

export default WaveAnnounce;
