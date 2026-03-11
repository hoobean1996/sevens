package game

import (
	"math/rand"
)

// ShopStation represents a shop in the arena
type ShopStation struct {
	ID       string
	Name     string
	Type     string // weapon, armor, potion, upgrade
	Position Vec2
	Items    []*ShopItem
}

// ShopItem represents an item for sale
type ShopItem struct {
	ID          string
	Name        string
	Description string
	Price       int
	Rarity      string
	ItemType    string // equipment, potion, upgrade
	Slot        string
	// Equipment stats
	Equipment *Equipment
	// Potion effects
	HealHP    int
	HealMP    int
	// Upgrade effects (permanent)
	MaxHPBonus int
	ATKBonus   int
}

// ShopBuyResult represents the result of a purchase
type ShopBuyResult struct {
	Success bool
	Message string
}

// initShops creates the 4 shops at arena corners
func initShops() []*ShopStation {
	shops := []*ShopStation{
		{
			ID:       "shop_weapon",
			Name:     "武器店",
			Type:     "weapon",
			Position: Vec2{50, 50},
			Items:    nil,
		},
		{
			ID:       "shop_armor",
			Name:     "防具店",
			Type:     "armor",
			Position: Vec2{ArenaWidth - 50, 50},
			Items:    nil,
		},
		{
			ID:       "shop_potion",
			Name:     "药水店",
			Type:     "potion",
			Position: Vec2{50, ArenaHeight - 50},
			Items:    nil,
		},
		{
			ID:       "shop_upgrade",
			Name:     "铁匠铺",
			Type:     "upgrade",
			Position: Vec2{ArenaWidth - 50, ArenaHeight - 50},
			Items:    nil,
		},
	}

	// Initialize items for wave 1
	for _, shop := range shops {
		shop.RefreshItems(1)
	}

	return shops
}

// RefreshItems generates new items based on wave level
func (s *ShopStation) RefreshItems(wave int) {
	s.Items = nil

	switch s.Type {
	case "weapon":
		s.Items = generateWeapons(wave)
	case "armor":
		s.Items = generateArmor(wave)
	case "potion":
		s.Items = generatePotions(wave)
	case "upgrade":
		s.Items = generateUpgrades(wave)
	}
}

func generateWeapons(wave int) []*ShopItem {
	items := make([]*ShopItem, 0, 3)
	basePrice := 50 + wave*10

	// Generate 3 weapons with varying rarities (0=common, 1=uncommon, 2=rare)
	rarityNames := []string{"common", "uncommon", "rare"}
	names := []string{"短剑", "长剑", "战斧"}

	for i := 0; i < 3; i++ {
		mult := 1.0 + float64(i)*0.5
		price := int(float64(basePrice) * mult)

		atk := int(float64(10+wave*3) * mult)
		critRate := 0.02 * float64(i+1)

		items = append(items, &ShopItem{
			ID:          nextID("item"),
			Name:        names[i],
			Description: "攻击力+" + itoa(atk),
			Price:       price,
			Rarity:      rarityNames[i],
			ItemType:    "equipment",
			Slot:        "weapon",
			Equipment: &Equipment{
				ID:       nextID("eq"),
				Name:     names[i],
				Rarity:   i, // 0=common, 1=uncommon, 2=rare
				Slot:     "weapon",
				ATK:      atk,
				CritRate: critRate,
			},
		})
	}

	return items
}

func generateArmor(wave int) []*ShopItem {
	items := make([]*ShopItem, 0, 3)
	basePrice := 40 + wave*8

	// Armor pieces
	slots := []string{"helmet", "chest", "boots"}
	names := []string{"铁盔", "锁甲", "战靴"}
	rarityNames := []string{"common", "uncommon", "rare"}

	for i := 0; i < 3; i++ {
		rarityIdx := rand.Intn(3)
		mult := 1.0 + float64(rarityIdx)*0.3
		price := int(float64(basePrice) * mult)

		def := int(float64(5+wave*2) * mult)
		armor := int(float64(3+wave) * mult)

		items = append(items, &ShopItem{
			ID:          nextID("item"),
			Name:        names[i],
			Description: "防御+" + itoa(def) + " 护甲+" + itoa(armor),
			Price:       price,
			Rarity:      rarityNames[rarityIdx],
			ItemType:    "equipment",
			Slot:        slots[i],
			Equipment: &Equipment{
				ID:     nextID("eq"),
				Name:   names[i],
				Rarity: rarityIdx,
				Slot:   slots[i],
				DEF:    def,
				Armor:  armor,
			},
		})
	}

	return items
}

func generatePotions(wave int) []*ShopItem {
	items := make([]*ShopItem, 0, 3)

	// Health potion
	items = append(items, &ShopItem{
		ID:          nextID("item"),
		Name:        "生命药水",
		Description: "恢复300点生命",
		Price:       30,
		Rarity:      "common",
		ItemType:    "potion",
		HealHP:      300,
	})

	// Mana potion
	items = append(items, &ShopItem{
		ID:          nextID("item"),
		Name:        "魔力药水",
		Description: "恢复50点魔力",
		Price:       25,
		Rarity:      "common",
		ItemType:    "potion",
		HealMP:      50,
	})

	// Large health potion (scales with wave)
	healAmount := 500 + wave*50
	items = append(items, &ShopItem{
		ID:          nextID("item"),
		Name:        "大生命药水",
		Description: "恢复" + itoa(healAmount) + "点生命",
		Price:       60 + wave*5,
		Rarity:      "uncommon",
		ItemType:    "potion",
		HealHP:      healAmount,
	})

	return items
}

func generateUpgrades(wave int) []*ShopItem {
	items := make([]*ShopItem, 0, 3)

	// Max HP upgrade
	hpBonus := 100 + wave*20
	items = append(items, &ShopItem{
		ID:          nextID("item"),
		Name:        "生命强化",
		Description: "永久增加" + itoa(hpBonus) + "最大生命",
		Price:       100 + wave*15,
		Rarity:      "rare",
		ItemType:    "upgrade",
		MaxHPBonus:  hpBonus,
	})

	// ATK upgrade
	atkBonus := 10 + wave*3
	items = append(items, &ShopItem{
		ID:          nextID("item"),
		Name:        "力量强化",
		Description: "永久增加" + itoa(atkBonus) + "攻击力",
		Price:       120 + wave*20,
		Rarity:      "rare",
		ItemType:    "upgrade",
		ATKBonus:    atkBonus,
	})

	// Combined upgrade
	items = append(items, &ShopItem{
		ID:          nextID("item"),
		Name:        "全能强化",
		Description: "永久增加" + itoa(hpBonus/2) + "生命和" + itoa(atkBonus/2) + "攻击",
		Price:       150 + wave*25,
		Rarity:      "epic",
		ItemType:    "upgrade",
		MaxHPBonus:  hpBonus / 2,
		ATKBonus:    atkBonus / 2,
	})

	return items
}

// ToState converts ShopStation to ShopState for network transmission
func (s *ShopStation) ToState() ShopState {
	items := make([]ShopItemState, 0, len(s.Items))
	for _, item := range s.Items {
		state := ShopItemState{
			ID:          item.ID,
			Name:        item.Name,
			Description: item.Description,
			Price:       item.Price,
			Rarity:      item.Rarity,
			ItemType:    item.ItemType,
			Slot:        item.Slot,
			HealHP:      item.HealHP,
			HealMP:      item.HealMP,
			MaxHPBonus:  item.MaxHPBonus,
			ATKBonus:    item.ATKBonus,
		}
		if item.Equipment != nil {
			state.ATK = item.Equipment.ATK
			state.DEF = item.Equipment.DEF
			state.ATKSpeed = item.Equipment.ATKSpeed
			state.CritRate = item.Equipment.CritRate
			state.CritDmg = item.Equipment.CritDmg
			state.LifeSteal = item.Equipment.LifeSteal
			state.HPRegen = item.Equipment.HPRegen
		}
		items = append(items, state)
	}

	return ShopState{
		ID:    s.ID,
		Name:  s.Name,
		Type:  s.Type,
		X:     s.Position.X,
		Y:     s.Position.Y,
		Items: items,
	}
}

// ProcessShopBuy handles a purchase request
func (w *World) ProcessShopBuy(p *Player, shopID, itemID string) ShopBuyResult {
	// Find shop
	var shop *ShopStation
	for _, s := range w.Shops {
		if s.ID == shopID {
			shop = s
			break
		}
	}
	if shop == nil {
		return ShopBuyResult{Success: false, Message: "商店不存在"}
	}

	// No distance check in arena mode - shops accessible via hotkeys

	// Find item
	var item *ShopItem
	itemIdx := -1
	for i, it := range shop.Items {
		if it.ID == itemID {
			item = it
			itemIdx = i
			break
		}
	}
	if item == nil {
		return ShopBuyResult{Success: false, Message: "物品不存在"}
	}

	// Check gold
	if p.Gold < item.Price {
		return ShopBuyResult{Success: false, Message: "金币不足"}
	}

	// Process purchase
	p.Gold -= item.Price

	switch item.ItemType {
	case "equipment":
		if len(p.Inventory) >= 20 {
			p.Gold += item.Price // Refund
			return ShopBuyResult{Success: false, Message: "背包已满"}
		}
		p.Inventory = append(p.Inventory, item.Equipment)

	case "potion":
		if item.HealHP > 0 {
			p.HP += item.HealHP
			if p.HP > p.MaxHP {
				p.HP = p.MaxHP
			}
		}
		if item.HealMP > 0 {
			p.MP += item.HealMP
			if p.MP > p.MaxMP {
				p.MP = p.MaxMP
			}
		}

	case "upgrade":
		if item.MaxHPBonus > 0 {
			p.MaxHP += item.MaxHPBonus
			p.HP += item.MaxHPBonus // Also heal for the bonus
		}
		if item.ATKBonus > 0 {
			p.BaseAttrs.ATK += item.ATKBonus
			p.RecalcAttrs()
		}
	}

	// Remove item from shop (one-time purchase)
	shop.Items = append(shop.Items[:itemIdx], shop.Items[itemIdx+1:]...)

	return ShopBuyResult{Success: true, Message: "购买成功"}
}

// Helper to convert int to string
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	if neg {
		s = "-" + s
	}
	return s
}
