import React, { useState, useEffect, useRef } from 'react';
import { TownState, BuildQueueItem } from '../engine/types';
import './TownScreen.css';

const TICK_INTERVAL_SEC = 10;

interface Props {
  townState: TownState | null;
  resourceCaps: { wood: number; stone: number; ore: number };
  onStartAdventure: () => void;
  onUpgrade: (type: string) => void;
  isBuildingInQueue: (type: string) => boolean;
  hasEmptyBuildQueueSlot: () => boolean;
}

interface ResourceFloat {
  id: number;
  type: 'wood' | 'stone' | 'ore';
  value: number;
}

const BUILDINGS = [
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
  townState,
  resourceCaps,
  onStartAdventure,
  onUpgrade,
  isBuildingInQueue,
  hasEmptyBuildQueueSlot,
}) => {
  const r = townState?.resources || { wood: 0, stone: 0, ore: 0, gold: 0 };
  const b = townState?.buildings || {};
  const buildQueue = townState?.buildQueue ?? [null, null, null];
  const hallLevel = b?.hall ?? 1;
  const slotsUnlocked = hallLevel >= 6 ? 3 : hallLevel >= 3 ? 2 : 1;

  const [countdown, setCountdown] = useState(TICK_INTERVAL_SEC);
  const [floats, setFloats] = useState<ResourceFloat[]>([]);
  const [queueTick, setQueueTick] = useState(0);
  const prevResRef = useRef<typeof r | null>(null);

  // 每秒递减倒计时，到 0 重置为 TICK_INTERVAL_SEC；同时刷新建造队列剩余时间
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((c) => (c <= 0 ? TICK_INTERVAL_SEC : c - 1));
      setQueueTick((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // 检测资源增加，显示 +X 浮动并重置倒计时
  useEffect(() => {
    const prev = prevResRef.current;
    prevResRef.current = { ...r };
    if (prev === null) return;

    const next: ResourceFloat[] = [];
    (['wood', 'stone', 'ore'] as const).forEach((type) => {
      const delta = r[type] - prev[type];
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
  }, [r.wood, r.stone, r.ore]);

  const progress = ((TICK_INTERVAL_SEC - countdown) / TICK_INTERVAL_SEC) * 100;

  const getBuildingName = (key: string) => BUILDINGS.find((x) => x.key === key)?.name ?? key;
  const getQueueRemainingSec = (item: BuildQueueItem | null) => {
    if (!item) return 0;
    const nowSec = Math.floor(Date.now() / 1000);
    return Math.max(0, item.completesAt - nowSec);
  };

  return (
    <div className="town-screen">
      <div className="town-top">
        <div className="town-top-left">
          <div className="town-title">七星之都</div>
          <div className="town-subtitle">T O W N &nbsp; O F &nbsp; S E V E N S</div>
          <div className="town-resources">
            <div className="town-resource-row">
              <span>木材</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(r.wood)}</span>
                {floats.filter((f) => f.type === 'wood').map((f) => (
                  <span key={f.id} className="town-resource-float">+{f.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.wood}</span>
            </div>
            <div className="town-resource-row">
              <span>石材</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(r.stone)}</span>
                {floats.filter((f) => f.type === 'stone').map((f) => (
                  <span key={f.id} className="town-resource-float">+{f.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.stone}</span>
            </div>
            <div className="town-resource-row">
              <span>矿石</span>
              <span className="town-resource-value-wrap">
                <span className="town-resource-value">{Math.floor(r.ore)}</span>
                {floats.filter((f) => f.type === 'ore').map((f) => (
                  <span key={f.id} className="town-resource-float">+{f.value}</span>
                ))}
              </span>
              <span className="town-resource-cap">/ {resourceCaps.ore}</span>
            </div>
            <div className="town-resource-row">
              <span>金币</span>
              <span className="town-resource-value">{Math.floor(r.gold)}</span>
            </div>
          </div>
        </div>
        <div className="town-production-panel">
          <div className="town-production-label">下次产出</div>
          <div className="town-production-countdown">{countdown}s</div>
          <div className="town-production-progress-wrap">
            <div className="town-production-progress" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="town-center">
        <button className="town-start-btn" onClick={onStartAdventure}>开 始 冒 险</button>
        <div className="town-start-hint">进入战场，击败怪物获取装备与经验</div>
      </div>

      <div className="town-queue">
        <h3>建 造 队 列</h3>
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
      </div>

      <div className="town-buildings">
        <h3>建 筑</h3>
        <div className="town-grid">
          {BUILDINGS.map((bd) => (
            <div key={bd.key} className={`town-building-card ${!bd.upgradable ? 'locked' : ''}`}>
              <div className="town-building-header">
                <div className="town-building-name">
                  <span className="icon">{bd.icon}</span>
                  <span>{bd.name}</span>
                </div>
                {bd.upgradable && (
                  <div className="town-building-level">Lv.{b[bd.key] ?? 0}</div>
                )}
              </div>
              <div className="town-building-desc">{bd.desc}</div>
              {bd.upgradable && (
                <div className="town-building-actions">
                  <button
                    className="town-upgrade-btn"
                    onClick={() => onUpgrade(bd.key)}
                    disabled={isBuildingInQueue(bd.key) || !hasEmptyBuildQueueSlot()}
                    title={
                      isBuildingInQueue(bd.key)
                        ? '该建筑已在队列中'
                        : !hasEmptyBuildQueueSlot()
                          ? '建造队列已满'
                          : undefined
                    }
                  >
                    {isBuildingInQueue(bd.key) ? '排队中' : !hasEmptyBuildQueueSlot() ? '队列已满' : '升级'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="town-footer">临时会话城镇 · 刷新页面后进度重置 · 后续接入存档系统</div>
    </div>
  );
};

export default TownScreen;
