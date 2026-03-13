import React, { useEffect, useRef, useState } from 'react';
import { BuildQueueItem, BuildingInstance, TownInteractionMode, TownState } from '../engine/types';
import { getBuildingDef } from '../engine/townDefinitions';
import { getResourceYield } from '../engine/townYield';
import BuildingPanel from './BuildingPanel';
import './TownScreen.css';

const TICK_INTERVAL_SEC = 10;

interface Props {
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  townState: TownState | null;
  interactionMode: TownInteractionMode;
  resourceCaps: { wood: number; stone: number; ore: number };
  selectedBuilding: BuildingInstance | null;
  onClearSelection: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
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
  interactionMode,
  resourceCaps,
  selectedBuilding,
  onClearSelection,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
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
  const getQueueRemainingSec = (item: BuildQueueItem | null) =>
    item ? Math.max(0, item.completesAt - Math.floor(Date.now() / 1000)) : 0;

  const selectedDef = selectedBuilding ? getBuildingDef(selectedBuilding.type) : null;
  const selectedCost = selectedBuilding
    ? getUpgradeCost(selectedBuilding.id)
    : { wood: 0, stone: 0, ore: 0, gold: 0 };
  const selectedQueued = selectedBuilding ? isBuildingInQueue(selectedBuilding.id) : false;
  const queueFull = !hasEmptyBuildQueueSlot();
  const hasEnoughResources =
    resources.wood >= selectedCost.wood &&
    resources.stone >= selectedCost.stone &&
    resources.ore >= selectedCost.ore &&
    resources.gold >= selectedCost.gold;
  const canUpgrade =
    !!selectedBuilding &&
    selectedDef?.upgradable &&
    !selectedQueued &&
    !queueFull &&
    hasEnoughResources &&
    selectedBuilding.level < selectedDef.maxLevel;

  const renderBuildingExtra = () => {
    if (!selectedBuilding || !selectedDef) return null;
    const { type, level } = selectedBuilding;
    if (!selectedDef.upgradable || level >= selectedDef.maxLevel) return null;

    if (type === 'lumber') {
      const currentYield = getResourceYield('lumber', level);
      const nextYield = getResourceYield('lumber', level + 1);
      const delta = nextYield - currentYield;
      return (
        <div className="town-building-upgrade-diff">
          <div className="town-building-upgrade-title">升级后变化</div>
          <div className="town-building-upgrade-row">
            <span className="label">当前产量</span>
            <span className="value">
              {currentYield.toFixed(1)} 木材 / {TICK_INTERVAL_SEC}s
            </span>
          </div>
          <div className="town-building-upgrade-row">
            <span className="label">升级后</span>
            <span className="value">
              {nextYield.toFixed(1)} 木材 / {TICK_INTERVAL_SEC}s
              <span className="delta">（+{delta.toFixed(1)}）</span>
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="town-layout">
      <header className="town-header">
        <div className="town-header-left">
          <div className="town-title">七星之都</div>
          <div className="town-subtitle">T O W N &nbsp; O F &nbsp; S E V E N S</div>
          <div className="town-header-actions">
            <button className="town-start-btn" onClick={onStartAdventure}>
              开始冒险
            </button>
            {interactionMode === 'preview' ? (
              <button className="town-edit-btn" onClick={onStartEdit}>
                城镇编辑
              </button>
            ) : (
              <div className="town-edit-action-group">
                <button className="town-edit-btn town-edit-btn-save" onClick={onSaveEdit}>
                  保存布局
                </button>
                <button className="town-edit-btn town-edit-btn-cancel" onClick={onCancelEdit}>
                  取消编辑
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="town-header-right">
          <div className="town-resources">
            <div className="town-resource-row">
              <span>木材</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(resources.wood)}</span>
                {floats.filter((item) => item.type === 'wood').map((item) => (
                  <span key={item.id} className="town-resource-float">+{item.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.wood}</span>
            </div>
            <div className="town-resource-row">
              <span>石材</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(resources.stone)}</span>
                {floats.filter((item) => item.type === 'stone').map((item) => (
                  <span key={item.id} className="town-resource-float">+{item.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.stone}</span>
            </div>
            <div className="town-resource-row">
              <span>矿石</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(resources.ore)}</span>
                {floats.filter((item) => item.type === 'ore').map((item) => (
                  <span key={item.id} className="town-resource-float">+{item.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.ore}</span>
            </div>
            <div className="town-resource-row">
              <span>金币</span>
              <span className="town-resource-value">{Math.floor(resources.gold)}</span>
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
          <h3 className="town-queue-title">建造队列</h3>
          <div className="town-queue-slots">
            {[0, 1, 2].map((index) => {
              const unlocked = index < slotsUnlocked;
              const item = buildQueue[index] ?? null;
              const remain = getQueueRemainingSec(item);
              return (
                <div key={index} className={`town-queue-slot ${unlocked ? '' : 'locked'}`}>
                  {!unlocked && <span className="town-queue-slot-label">主城 Lv.{index === 1 ? 3 : 6} 解锁</span>}
                  {unlocked && !item && <span className="town-queue-slot-empty">空</span>}
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

        </aside>

        <main className={`town-map-wrap ${interactionMode === 'edit' ? 'is-editing' : ''}`} ref={mapWrapRef}>
          {interactionMode === 'edit' && (
            <div className="town-edit-banner">编辑模式：拖动建筑调整位置，完成后请保存布局或取消编辑</div>
          )}
          {children}
        </main>
      </div>

      {interactionMode === 'preview' && selectedBuilding && selectedDef && (
        <div className="town-panel-overlay" onClick={onClearSelection}>
          <BuildingPanel
            building={selectedBuilding}
            def={selectedDef}
            canUpgrade={!!canUpgrade}
            hasEnoughResources={hasEnoughResources}
            resources={resources}
            selectedCost={selectedCost}
            queued={selectedQueued}
            queueFull={queueFull}
            onUpgrade={() => onUpgrade(selectedBuilding.id)}
            onClose={onClearSelection}
            extraContent={renderBuildingExtra()}
          />
        </div>
      )}
    </div>
  );
};

export default TownScreen;
