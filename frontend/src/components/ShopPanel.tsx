import React from 'react';
import { ShopState, ShopItem, RARITY_STRING_COLORS, SHOP_ICONS } from '../engine/types';
import './ShopPanel.css';

interface Props {
  shop: ShopState | null;
  playerGold: number;
  onBuy: (shopId: string, itemId: string) => void;
  onClose: () => void;
}

const ShopPanel: React.FC<Props> = ({ shop, playerGold, onBuy, onClose }) => {
  if (!shop) return null;

  const formatStats = (item: ShopItem): string[] => {
    const stats: string[] = [];
    if (item.atk) stats.push(`攻击力 +${item.atk}`);
    if (item.def) stats.push(`防御力 +${item.def}`);
    if (item.atk_speed) stats.push(`攻速 +${(item.atk_speed * 100).toFixed(0)}%`);
    if (item.crit_rate) stats.push(`暴击率 +${(item.crit_rate * 100).toFixed(0)}%`);
    if (item.crit_dmg) stats.push(`暴击伤害 +${(item.crit_dmg * 100).toFixed(0)}%`);
    if (item.life_steal) stats.push(`生命偷取 +${(item.life_steal * 100).toFixed(0)}%`);
    if (item.hp_regen) stats.push(`生命回复 +${item.hp_regen}/s`);
    if (item.heal_hp) stats.push(`恢复 ${item.heal_hp} 生命`);
    if (item.heal_mp) stats.push(`恢复 ${item.heal_mp} 魔力`);
    if (item.max_hp_bonus) stats.push(`最大生命 +${item.max_hp_bonus}`);
    if (item.atk_bonus) stats.push(`攻击力 +${item.atk_bonus}`);
    return stats;
  };

  const getRarityName = (rarity: string): string => {
    const names: Record<string, string> = {
      common: '普通',
      uncommon: '优秀',
      rare: '稀有',
      epic: '史诗',
      legendary: '传说'
    };
    return names[rarity] || rarity;
  };

  return (
    <div className="shop-panel-overlay" onClick={onClose}>
      <div className="shop-panel" onClick={e => e.stopPropagation()}>
        <div className="shop-header">
          <span className="shop-icon">{SHOP_ICONS[shop.type] || '🏪'}</span>
          <span className="shop-title">{shop.name}</span>
          <button className="shop-close" onClick={onClose}>✕</button>
        </div>

        <div className="shop-gold">
          <span>💰 {playerGold}</span>
        </div>

        <div className="shop-items">
          {shop.items.length === 0 ? (
            <div className="shop-empty">商品已售罄</div>
          ) : (
            shop.items.map(item => {
              const canAfford = playerGold >= item.price;
              const rarityColor = RARITY_STRING_COLORS[item.rarity] || '#ccc';
              const stats = formatStats(item);

              return (
                <div
                  key={item.id}
                  className={`shop-item ${!canAfford ? 'shop-item-disabled' : ''}`}
                  style={{ borderColor: rarityColor }}
                >
                  <div className="item-header">
                    <span className="item-name" style={{ color: rarityColor }}>
                      {item.name}
                    </span>
                    <span className="item-rarity" style={{ color: rarityColor }}>
                      [{getRarityName(item.rarity)}]
                    </span>
                  </div>

                  <div className="item-description">{item.description}</div>

                  {stats.length > 0 && (
                    <div className="item-stats">
                      {stats.map((stat, i) => (
                        <div key={i} className="item-stat">{stat}</div>
                      ))}
                    </div>
                  )}

                  <div className="item-footer">
                    <span className={`item-price ${!canAfford ? 'price-insufficient' : ''}`}>
                      💰 {item.price}
                    </span>
                    <button
                      className="item-buy-btn"
                      disabled={!canAfford}
                      onClick={() => onBuy(shop.id, item.id)}
                    >
                      {canAfford ? '购买' : '金币不足'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="shop-footer">
          按 [ESC] 或点击外部关闭
        </div>
      </div>
    </div>
  );
};

export default ShopPanel;
