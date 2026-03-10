import React, { useEffect, useState, useCallback } from 'react';
import { RARITY_COLORS, RARITY_NAMES, SLOT_NAMES } from '../engine/types';
import './PickupNotifs.css';

interface Notif {
  id: number;
  name: string;
  rarity: number;
  slot: string;
  fading: boolean;
}

let notifCounter = 0;

interface Props {
  pickupEvent: { name: string; rarity: number; slot: string } | null;
}

const PickupNotifs: React.FC<Props> = ({ pickupEvent }) => {
  const [notifs, setNotifs] = useState<Notif[]>([]);

  const addNotif = useCallback((name: string, rarity: number, slot: string) => {
    const id = ++notifCounter;
    setNotifs((prev) => {
      const next = [...prev, { id, name, rarity, slot, fading: false }];
      return next.slice(-5);
    });
    setTimeout(() => {
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, fading: true } : n));
    }, 2500);
    setTimeout(() => {
      setNotifs((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    if (pickupEvent) {
      addNotif(pickupEvent.name, pickupEvent.rarity, pickupEvent.slot);
    }
  }, [pickupEvent, addNotif]);

  return (
    <div className="pickup-notifs">
      {notifs.map((n) => {
        const color = RARITY_COLORS[n.rarity] || '#ccc';
        return (
          <div
            key={n.id}
            className="pickup-notif"
            style={{
              color,
              textShadow: `0 0 8px ${color}`,
              opacity: n.fading ? 0 : 1,
            }}
          >
            获得 [{RARITY_NAMES[n.rarity]}] {n.name} ({SLOT_NAMES[n.slot]})
          </div>
        );
      })}
    </div>
  );
};

export default PickupNotifs;
