import React from 'react';
import { BuildingInstance } from '../engine/types';
import { BuildingDefinition } from '../engine/townDefinitions';

interface Props {
  building: BuildingInstance;
  def: BuildingDefinition;
  canUpgrade: boolean;
  hasEnoughResources: boolean;
  resources: { wood: number; stone: number; ore: number; gold: number };
  selectedCost: { wood: number; stone: number; ore: number; gold: number };
  queued: boolean;
  queueFull: boolean;
  onUpgrade: () => void;
  onClose: () => void;
  extraContent?: React.ReactNode;
}

const BuildingPanel: React.FC<Props> = ({
  building,
  def,
  canUpgrade,
  hasEnoughResources,
  resources,
  selectedCost,
  queued,
  queueFull,
  onUpgrade,
  onClose,
  extraContent,
}) => {
  const atMaxLevel = building.level >= def.maxLevel;
  const showUpgradeSection = def.upgradable && !atMaxLevel;

  let upgradeLabel = '升级';
  let upgradeTitle: string | undefined;
  if (queued) {
    upgradeLabel = '排队中';
    upgradeTitle = '该建筑已经在建造队列中。';
  } else if (queueFull) {
    upgradeLabel = '队列已满';
    upgradeTitle = '当前没有空闲的建造队列。';
  } else if (!hasEnoughResources) {
    upgradeLabel = '资源不足';
    upgradeTitle = '当前资源不足，无法升级。';
  }

  return (
    <div className="town-building-panel" onClick={(e) => e.stopPropagation()}>
      <div className="town-building-panel-header">
        <div className="town-building-panel-title-wrap">
          <div className="town-building-panel-title">
            <div className="town-building-panel-icon">
              {def.previewSrc ? (
                <img className="town-building-panel-icon-image" src={def.previewSrc} alt={def.name} />
              ) : (
                <span className="town-building-panel-icon-fallback">{def.icon}</span>
              )}
            </div>
            <div className="town-building-panel-heading">
              <span className="town-detail-name">{def.name}</span>
              <span className="town-building-panel-subtitle">城镇建筑管理面板</span>
            </div>
          </div>
          <div className="town-building-panel-level-badge">Lv.{building.level}</div>
        </div>
        <button type="button" className="town-panel-close-btn" onClick={onClose} aria-label="关闭建筑面板">
          ×
        </button>
      </div>

      <div className="town-building-panel-body">
        <section className="town-building-panel-card town-building-panel-hero">
          <div className="town-building-panel-kicker">建筑说明</div>
          <div className="town-building-panel-description">{def.description}</div>
        </section>

        {extraContent}

        {showUpgradeSection ? (
          <section className="town-building-panel-card town-building-panel-upgrade-card">
            <div className="town-building-panel-kicker">升级消耗</div>
            <div className="town-building-panel-cost-grid">
              <div
                className={`town-building-panel-cost-item ${
                  resources.wood >= selectedCost.wood ? 'affordable' : 'insufficient'
                }`}
              >
                <span className="label">木材</span>
                <span className="value">
                  {Math.floor(resources.wood)} / {selectedCost.wood}
                </span>
              </div>
              <div
                className={`town-building-panel-cost-item ${
                  resources.stone >= selectedCost.stone ? 'affordable' : 'insufficient'
                }`}
              >
                <span className="label">石材</span>
                <span className="value">
                  {Math.floor(resources.stone)} / {selectedCost.stone}
                </span>
              </div>
              <div
                className={`town-building-panel-cost-item ${
                  resources.ore >= selectedCost.ore ? 'affordable' : 'insufficient'
                }`}
              >
                <span className="label">矿石</span>
                <span className="value">
                  {Math.floor(resources.ore)} / {selectedCost.ore}
                </span>
              </div>
              <div
                className={`town-building-panel-cost-item ${
                  resources.gold >= selectedCost.gold ? 'affordable' : 'insufficient'
                }`}
              >
                <span className="label">金币</span>
                <span className="value">
                  {Math.floor(resources.gold)} / {selectedCost.gold}
                </span>
              </div>
            </div>
            <div className="town-building-panel-actions">
              <button
                type="button"
                className={`town-upgrade-btn town-upgrade-btn-large ${canUpgrade ? 'is-ready' : 'is-disabled'}`}
                onClick={onUpgrade}
                disabled={!canUpgrade}
                title={upgradeTitle}
              >
                {upgradeLabel}
              </button>
            </div>
          </section>
        ) : (
          <section className="town-building-panel-card town-building-panel-upgrade-card">
            <div className="town-building-panel-kicker">当前状态</div>
            <div className="town-building-panel-description">该建筑已达到当前可用的最高等级。</div>
          </section>
        )}
      </div>
    </div>
  );
};

export default BuildingPanel;
