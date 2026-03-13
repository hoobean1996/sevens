import React, { useEffect, useRef, useState } from 'react';
import { BuildQueueItem, BuildingInstance, TownState } from '../engine/types';
import { getBuildingDef } from '../engine/townDefinitions';
import './TownScreen.css';

const TICK_INTERVAL_SEC = 10;

interface Props {
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  townState: TownState | null;
  resourceCaps: { wood: number; stone: number; ore: number };
  selectedBuilding: BuildingInstance | null;
  onClearSelection: () => void;
  onStartAdventure: () => void;
  onUpgrade: (buildingId: string) => void;
  isBuildingInQueue: (buildingId: string) => boolean;
  hasEmptyBuildQueueSlot: () => boolean;
  getUpgradeCost: (buildingId: string) => { wood: number; stone: number; ore: number; gold: number };
  children?: React.ReactNode;
}

interface ResourceFloat {
  id: number;
  type: 'wood' | 'stone' | 'ore';
  value: number;
}

const TownScreen: React.FC<Props> = ({
  mapWrapRef,
  townState,
  resourceCaps,
  selectedBuilding,
  onClearSelection,
  onStartAdventure,
  onUpgrade,
  isBuildingInQueue,
  hasEmptyBuildQueueSlot,
  getUpgradeCost,
  children,
}) => {
  const resources = townState?.resources || { wood: 0, stone: 0, ore: 0, gold: 0 };
  const buildQueue = townState?.buildQueue ?? [null, null, null];
  const { wood, stone, ore } = resources;
  const hallLevel = townState?.buildings.hall ?? 1;
  const slotsUnlocked = hallLevel >= 6 ? 3 : hallLevel >= 3 ? 2 : 1;

  const [countdown, setCountdown] = useState(TICK_INTERVAL_SEC);
  const [floats, setFloats] = useState<ResourceFloat[]>([]);
  const prevResRef = useRef<{ wood: number; stone: number; ore: number } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((value) => (value <= 0 ? TICK_INTERVAL_SEC : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const prev = prevResRef.current;
    prevResRef.current = { wood, stone, ore };
    if (!prev) return;

    const next: ResourceFloat[] = [];
    (['wood', 'stone', 'ore'] as const).forEach((type) => {
      const currentValue = type === 'wood' ? wood : type === 'stone' ? stone : ore;
      const delta = currentValue - prev[type];
      if (delta <= 0) return;
      next.push({ id: Date.now() + type.charCodeAt(0) + Math.random(), type, value: Math.round(delta) });
      setCountdown(TICK_INTERVAL_SEC);
    });

    if (next.length === 0) return;
    setFloats((current) => [...current, ...next]);
    next.forEach(({ id }) => {
      setTimeout(() => setFloats((current) => current.filter((item) => item.id !== id)), 1600);
    });
  }, [wood, stone, ore]);

  const progress = ((TICK_INTERVAL_SEC - countdown) / TICK_INTERVAL_SEC) * 100;
  const getQueueRemainingSec = (item: BuildQueueItem | null) => item ? Math.max(0, item.completesAt - Math.floor(Date.now() / 1000)) : 0;

  const selectedDef = selectedBuilding ? getBuildingDef(selectedBuilding.type) : null;
  const selectedCost = selectedBuilding ? getUpgradeCost(selectedBuilding.id) : { wood: 0, stone: 0, ore: 0, gold: 0 };
  const selectedQueued = selectedBuilding ? isBuildingInQueue(selectedBuilding.id) : false;
  const queueFull = !hasEmptyBuildQueueSlot();
  const canUpgrade = !!selectedBuilding && selectedDef?.upgradable && !selectedQueued && !queueFull && selectedBuilding.level < selectedDef.maxLevel;

  return (
    <div className="town-layout">
      <header className="town-header">
        <div className="town-header-left">
          <div className="town-title">Town of Sevens</div>
          <div className="town-subtitle">I S O M E T R I C   T O W N</div>
          <button className="town-start-btn" onClick={onStartAdventure}>
            Start Adventure
          </button>
        </div>
        <div className="town-header-right">
          <div className="town-resources">
            <div className="town-resource-row">
              <span>Wood</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(resources.wood)}</span>
                {floats.filter((item) => item.type === 'wood').map((item) => (
                  <span key={item.id} className="town-resource-float">+{item.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.wood}</span>
            </div>
            <div className="town-resource-row">
              <span>Stone</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(resources.stone)}</span>
                {floats.filter((item) => item.type === 'stone').map((item) => (
                  <span key={item.id} className="town-resource-float">+{item.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.stone}</span>
            </div>
            <div className="town-resource-row">
              <span>Ore</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(resources.ore)}</span>
                {floats.filter((item) => item.type === 'ore').map((item) => (
                  <span key={item.id} className="town-resource-float">+{item.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.ore}</span>
            </div>
            <div className="town-resource-row">
              <span>Gold</span>
              <span className="town-resource-value">{Math.floor(resources.gold)}</span>
            </div>
          </div>
          <div className="town-production-panel">
            <span className="town-production-label">Next Tick</span>
            <span className="town-production-countdown">{countdown}s</span>
            <div className="town-production-progress-wrap">
              <div className="town-production-progress" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="town-body">
        <aside className="town-queue-panel">
          <h3 className="town-queue-title">Build Queue</h3>
          <div className="town-queue-slots">
            {[0, 1, 2].map((index) => {
              const unlocked = index < slotsUnlocked;
              const item = buildQueue[index] ?? null;
              const remain = getQueueRemainingSec(item);
              return (
                <div key={index} className={`town-queue-slot ${unlocked ? '' : 'locked'}`}>
                  {!unlocked && <span className="town-queue-slot-label">Unlock at Hall Lv.{index === 1 ? 3 : 6}</span>}
                  {unlocked && !item && <span className="town-queue-slot-empty">Empty</span>}
                  {unlocked && item && (
                    <>
                      <span className="town-queue-slot-name">{getBuildingDef(item.buildingType).name}</span>
                      <span className="town-queue-slot-lvl">Lv.{item.fromLevel} -&gt; Lv.{item.fromLevel + 1}</span>
                      <span className="town-queue-slot-remain">{remain}s</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {selectedBuilding && selectedDef && (
            <div className="town-building-detail-card">
              <div className="town-detail-header">
                <span className="town-detail-icon">{selectedDef.icon}</span>
                <span className="town-detail-name">{selectedDef.name}</span>
                <span className="town-detail-level">Lv.{selectedBuilding.level}</span>
              </div>
              <div className="town-detail-desc">{selectedDef.description}</div>
              <div className="town-detail-desc">Grid: ({selectedBuilding.gx}, {selectedBuilding.gy}) | Entity: {selectedBuilding.id}</div>
              {selectedDef.upgradable && selectedBuilding.level < selectedDef.maxLevel && (
                <>
                  <div className="town-detail-cost">
                    Upgrade cost: W {selectedCost.wood} / S {selectedCost.stone} / O {selectedCost.ore} / G {selectedCost.gold}
                  </div>
                  <button
                    type="button"
                    className="town-upgrade-btn"
                    onClick={() => onUpgrade(selectedBuilding.id)}
                    disabled={!canUpgrade}
                    title={selectedQueued ? 'This building is already upgrading.' : queueFull ? 'Build queue is full.' : undefined}
                  >
                    {selectedQueued ? 'Queued' : queueFull ? 'Queue Full' : 'Upgrade'}
                  </button>
                </>
              )}
              <button type="button" className="town-clear-selection-btn" onClick={onClearSelection}>
                Clear Selection
              </button>
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


