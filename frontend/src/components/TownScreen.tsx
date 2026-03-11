import React, { useState, useEffect, useRef } from 'react';
import { TownState, BuildQueueItem } from '../engine/types';
import './TownScreen.css';

const TICK_INTERVAL_SEC = 10;

interface Props {
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  townState: TownState | null;
  resourceCaps: { wood: number; stone: number; ore: number };
  selectedBuildingKey: string | null;
  onClearSelection: () => void;
  onStartAdventure: () => void;
  onUpgrade: (type: string) => void;
  isBuildingInQueue: (type: string) => boolean;
  hasEmptyBuildQueueSlot: () => boolean;
  getUpgradeCost: (type: string) => { wood: number; stone: number; ore: number; gold: number };
  children?: React.ReactNode;
}

interface ResourceFloat {
  id: number;
  type: 'wood' | 'stone' | 'ore';
  value: number;
}

const BUILDINGS: { key: string; icon: string; name: string; desc: string; upgradable: boolean }[] = [
  { key: 'hall', icon: '🏛️', name: '市政厅', desc: '决定其他建筑最高等级', upgradable: true },
  { key: 'warehouse', icon: '📦', name: '仓库', desc: '提高资源存储上限', upgradable: true },
  { key: 'lumber', icon: '🌲', name: '伐木场', desc: '自动产出木材', upgradable: true },
  { key: 'quarry', icon: '🪨', name: '采石场', desc: '自动产出石材', upgradable: true },
  { key: 'mine', icon: '⛏️', name: '采矿场', desc: '自动产出矿石', upgradable: true },
  { key: 'blacksmith', icon: '⚒️', name: '铁匠铺', desc: '打造武器防具 (即将开放)', upgradable: false },
  { key: 'tavern', icon: '🍖', name: '餐厅', desc: '冒险前增益 (即将开放)', upgradable: false },
  { key: 'alchemy', icon: '⚗️', name: '炼金工坊', desc: '制作药剂 (即将开放)', upgradable: false },
];

const TownScreen: React.FC<Props> = ({
  mapWrapRef,
  townState,
  resourceCaps,
  selectedBuildingKey,
  onClearSelection,
  onStartAdventure,
  onUpgrade,
  isBuildingInQueue,
  hasEmptyBuildQueueSlot,
  getUpgradeCost,
  children,
}) => {
  const r = townState?.resources || { wood: 0, stone: 0, ore: 0, gold: 0 };
  const b = townState?.buildings || {};
  const buildQueue = townState?.buildQueue ?? [null, null, null];
  const hallLevel = b?.hall ?? 1;
  const slotsUnlocked = hallLevel >= 6 ? 3 : hallLevel >= 3 ? 2 : 1;

  const [countdown, setCountdown] = useState(TICK_INTERVAL_SEC);
  const [floats, setFloats] = useState<ResourceFloat[]>([]);
  const prevResRef = useRef<{ wood: number; stone: number; ore: number } | null>(null);
  const { wood, stone, ore } = r;

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((c) => (c <= 0 ? TICK_INTERVAL_SEC : c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const prev = prevResRef.current;
    prevResRef.current = { wood, stone, ore };
    if (prev === null) return;
    const next: ResourceFloat[] = [];
    (['wood', 'stone', 'ore'] as const).forEach((type) => {
      const cur = type === 'wood' ? wood : type === 'stone' ? stone : ore;
      const delta = cur - prev[type];
      if (delta > 0) {
        next.push({ id: Date.now() + type.charCodeAt(0) + Math.random(), type, value: Math.round(delta) });
        setCountdown(TICK_INTERVAL_SEC);
      }
    });
    if (next.length) {
      setFloats((f) => [...f, ...next]);
      next.forEach(({ id }) => {
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1600);
      });
    }
  }, [wood, stone, ore]);

  const progress = ((TICK_INTERVAL_SEC - countdown) / TICK_INTERVAL_SEC) * 100;

  const getBuildingName = (key: string) => BUILDINGS.find((x) => x.key === key)?.name ?? key;
  const getBuildingInfo = (key: string) => BUILDINGS.find((x) => x.key === key);
  const getQueueRemainingSec = (item: BuildQueueItem | null) => {
    if (!item) return 0;
    const nowSec = Math.floor(Date.now() / 1000);
    return Math.max(0, item.completesAt - nowSec);
  };

  return (
    <div className="town-layout">
      <header className="town-header">
        <div className="town-header-left">
          <div className="town-title">七星之都</div>
          <div className="town-subtitle">T O W N &nbsp; O F &nbsp; S E V E N S</div>
          <button className="town-start-btn" onClick={onStartAdventure}>
            开 始 冒 险
          </button>
        </div>
        <div className="town-header-right">
          <div className="town-resources">
            <div className="town-resource-row">
              <span>木</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(r.wood)}</span>
                {floats.filter((f) => f.type === 'wood').map((f) => (
                  <span key={f.id} className="town-resource-float">+{f.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.wood}</span>
            </div>
            <div className="town-resource-row">
              <span>石</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(r.stone)}</span>
                {floats.filter((f) => f.type === 'stone').map((f) => (
                  <span key={f.id} className="town-resource-float">+{f.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.stone}</span>
            </div>
            <div className="town-resource-row">
              <span>矿</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(r.ore)}</span>
                {floats.filter((f) => f.type === 'ore').map((f) => (
                  <span key={f.id} className="town-resource-float">+{f.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.ore}</span>
            </div>
            <div className="town-resource-row">
              <span>金</span>
              <span className="town-resource-value">{Math.floor(r.gold)}</span>
            </div>
          </div>
          <div className="town-production-panel">
            <span className="town-production-label">下次产出</span>
            <span className="town-production-countdown">{countdown}s</span>
            <div className="town-production-progress-wrap">
              <div className="town-production-progress" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="town-body">
        <aside className="town-queue-panel">
          <h3 className="town-queue-title">建 造 队 列</h3>
          <div className="town-queue-slots">
            {[0, 1, 2].map((i) => {
              const unlocked = i < slotsUnlocked;
              const item = buildQueue[i] ?? null;
              const remain = getQueueRemainingSec(item);
              return (
                <div key={i} className={`town-queue-slot ${unlocked ? '' : 'locked'}`}>
                  {!unlocked && (
                    <span className="town-queue-slot-label">
                      {i === 1 ? '市政厅 Lv3 解锁' : '市政厅 Lv6 解锁'}
                    </span>
                  )}
                  {unlocked && !item && <span className="town-queue-slot-empty">空</span>}
                  {unlocked && item && (
                    <>
                      <span className="town-queue-slot-name">{getBuildingName(item.buildingType)}</span>
                      <span className="town-queue-slot-lvl">Lv.{item.fromLevel}→Lv.{item.fromLevel + 1}</span>
                      <span className="town-queue-slot-remain">剩余 {remain}s</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {selectedBuildingKey && (
            <div className="town-building-detail-card">
              {(() => {
                const info = getBuildingInfo(selectedBuildingKey);
                const level = b[selectedBuildingKey] ?? 0;
                const cost = getUpgradeCost(selectedBuildingKey);
                const upgradable = info?.upgradable ?? false;
                const inQueue = isBuildingInQueue(selectedBuildingKey);
                const queueFull = !hasEmptyBuildQueueSlot();
                const canUpgrade = upgradable && !inQueue && !queueFull && level < 10;
                return (
                  <>
                    <div className="town-detail-header">
                      <span className="town-detail-icon">{info?.icon ?? '🏠'}</span>
                      <span className="town-detail-name">{info?.name ?? selectedBuildingKey}</span>
                      <span className="town-detail-level">Lv.{level}</span>
                    </div>
                    {info?.desc && <div className="town-detail-desc">{info.desc}</div>}
                    {upgradable && level < 10 && (
                      <>
                        <div className="town-detail-cost">
                          升级需要：木 {cost.wood} / 石 {cost.stone} / 矿 {cost.ore} / 金 {cost.gold}
                        </div>
                        <button
                          type="button"
                          className="town-upgrade-btn"
                          onClick={() => onUpgrade(selectedBuildingKey)}
                          disabled={!canUpgrade}
                          title={inQueue ? '该建筑已在队列中' : queueFull ? '建造队列已满' : undefined}
                        >
                          {inQueue ? '排队中' : queueFull ? '队列已满' : '升级'}
                        </button>
                      </>
                    )}
                    <button type="button" className="town-clear-selection-btn" onClick={onClearSelection}>
                      取消选中
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </aside>

        <main className="town-map-wrap" ref={mapWrapRef}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default TownScreen;
