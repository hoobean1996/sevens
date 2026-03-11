package game

import (
	"math"
)

// Attributes holds all RPG stats
type Attributes struct {
	ATK       int     `json:"atk"`        // 攻击力
	DEF       int     `json:"def"`        // 防御力
	ATKSpeed  float64 `json:"atk_speed"`  // 攻击速度 (multiplier, 1.0 = base)
	MoveSpeed float64 `json:"move_speed"` // 移动速度
	CritRate  float64 `json:"crit_rate"`  // 暴击率 (0~1)
	CritDmg   float64 `json:"crit_dmg"`   // 暴击伤害倍率 (e.g. 1.5 = 150%)
	HPRegen   float64 `json:"hp_regen"`   // 每秒生命回复
	MPRegen   float64 `json:"mp_regen"`   // 每秒魔力回复
	Armor     int     `json:"armor"`      // 护甲
	Dodge     float64 `json:"dodge"`      // 闪避率 (0~1)
	LifeSteal float64 `json:"life_steal"` // 生命偷取 (0~1)
	CDReduce  float64 `json:"cd_reduce"`  // 冷却缩减 (0~1, e.g. 0.1 = 10%)
	DmgBonus  float64 `json:"dmg_bonus"`  // 伤害加成 (0~1)
	DmgReduce float64 `json:"dmg_reduce"` // 伤害减免 (0~1)
}

type Player struct {
	ID       string
	Name     string
	Hero     string
	Position Vec2
	Velocity Vec2

	HP, MaxHP int
	MP, MaxMP int
	Speed     float64
	Facing    string  // "left" or "right"
	Angle     float64 // 360-degree facing angle (radians, toward mouse)
	Anim      string  // "idle", "run", "cast", "ult"
	AnimFrame int
	AnimTimer float64
	Level     int
	XP        int
	XPNeeded  int
	Gold      int     // arena mode currency

	BaseAttrs Attributes            // base (level-up only)
	Attrs     Attributes            // computed = base + equipment
	Equipped  map[string]*Equipment // slot -> item
	Inventory []*Equipment          // bag (max 20)

	Skills map[string]*SkillInstance

	// Input
	Keys     KeyState
	CastLock float64 // remaining cast lock time

	// Mouse aim
	MouseX float64
	MouseY float64

	// Click-to-move
	MoveTarget   *Vec2   // nil = no move target
	MovingToTarget bool

	// Internal
	hpRegenAcc float64 // fractional HP accumulator
	mpRegenAcc float64 // fractional MP accumulator

	// Buffs
	SpeedBuff     float64 // remaining time
	SpeedBuffMult float64
}

func NewWarrior(id, name string, pos Vec2) *Player {
	p := &Player{
		ID:       id,
		Name:     name,
		Hero:     "warrior",
		Position: pos,
		HP:       1000, MaxHP: 1000,
		MP:       100, MaxMP: 100,
		Speed:    200,
		Facing:   "right",
		Anim:     "idle",
		Level:    1,
		XP:       0, XPNeeded: 100,
		Gold:     100, // Starting gold for arena mode
		Skills:    WarriorSkills(),
		Equipped:  make(map[string]*Equipment),
		Inventory: make([]*Equipment, 0),
		BaseAttrs: Attributes{
			ATK:       80,
			DEF:       30,
			ATKSpeed:  1.0,
			MoveSpeed: 200,
			CritRate:  0.15,
			CritDmg:   1.5,
			HPRegen:   5,
			MPRegen:   10,
			Armor:     20,
			Dodge:     0.05,
		},
	}
	p.RecalcAttrs()
	return p
}

func (p *Player) Update(dt float64, arenaMode bool) {
	// Update skill cooldowns
	for _, sk := range p.Skills {
		if sk.CdRemain > 0 {
			sk.CdRemain -= dt
			if sk.CdRemain < 0 {
				sk.CdRemain = 0
			}
		}
	}

	// HP regen
	p.hpRegenAcc += p.Attrs.HPRegen * dt
	if p.hpRegenAcc >= 1 && p.HP < p.MaxHP {
		add := int(p.hpRegenAcc)
		p.hpRegenAcc -= float64(add)
		p.HP += add
		if p.HP > p.MaxHP {
			p.HP = p.MaxHP
		}
	}

	// MP regen
	p.mpRegenAcc += p.Attrs.MPRegen * dt
	if p.mpRegenAcc >= 1 && p.MP < p.MaxMP {
		add := int(p.mpRegenAcc)
		p.mpRegenAcc -= float64(add)
		p.MP += add
		if p.MP > p.MaxMP {
			p.MP = p.MaxMP
		}
	}

	// Buff timers
	if p.SpeedBuff > 0 {
		p.SpeedBuff -= dt
		if p.SpeedBuff <= 0 {
			p.SpeedBuff = 0
			p.SpeedBuffMult = 0
		}
	}

	// Arena mode: player stays at center, faces target
	if arenaMode {
		// Face toward auto-target (set by world)
		dx := p.MouseX - p.Position.X
		dy := p.MouseY - p.Position.Y
		if dx != 0 || dy != 0 {
			p.Angle = math.Atan2(dy, dx)
		}
		if dx > 0 {
			p.Facing = "right"
		} else if dx < 0 {
			p.Facing = "left"
		}

		// Cast lock animation
		if p.CastLock > 0 {
			p.CastLock -= dt
			if p.CastLock < 0 {
				p.CastLock = 0
			}
			p.Anim = "cast"
		} else {
			p.Anim = "idle"
		}

		// Animation frame
		p.AnimTimer += dt
		if p.AnimTimer > 0.12 {
			p.AnimTimer = 0
			p.AnimFrame = (p.AnimFrame + 1) % 6
		}
		return
	}

	// Classic mode: normal movement
	// Face toward mouse (360 degrees)
	dx := p.MouseX - p.Position.X
	dy := p.MouseY - p.Position.Y
	if dx != 0 || dy != 0 {
		p.Angle = math.Atan2(dy, dx)
	}
	if dx > 0 {
		p.Facing = "right"
	} else if dx < 0 {
		p.Facing = "left"
	}

	// Cast lock
	if p.CastLock > 0 {
		p.CastLock -= dt
		if p.CastLock < 0 {
			p.CastLock = 0
		}
		p.Anim = "cast"
		return // Can't move while casting
	}

	// Movement: WASD takes priority, then click-to-move
	var dir Vec2
	wasdActive := false
	if p.Keys.W {
		dir.Y -= 1; wasdActive = true
	}
	if p.Keys.S {
		dir.Y += 1; wasdActive = true
	}
	if p.Keys.A {
		dir.X -= 1; wasdActive = true
	}
	if p.Keys.D {
		dir.X += 1; wasdActive = true
	}

	// WASD cancels click-to-move
	if wasdActive {
		p.MoveTarget = nil
		p.MovingToTarget = false
	}

	speed := p.Attrs.MoveSpeed
	if p.SpeedBuff > 0 {
		speed *= (1 + p.SpeedBuffMult)
	}

	if wasdActive {
		dir = dir.Normalize()
		p.Velocity = dir.Scale(speed)
		p.Position = p.Position.Add(p.Velocity.Scale(dt))
		p.Anim = "run"
	} else if p.MoveTarget != nil && p.MovingToTarget {
		// Click-to-move
		toTarget := p.MoveTarget.Sub(p.Position)
		dist := toTarget.Len()
		if dist < 5 {
			// Arrived
			p.MoveTarget = nil
			p.MovingToTarget = false
			p.Velocity = Vec2{}
			p.Anim = "idle"
		} else {
			moveDir := toTarget.Normalize()
			p.Velocity = moveDir.Scale(speed)
			p.Position = p.Position.Add(p.Velocity.Scale(dt))
			p.Anim = "run"
		}
	} else {
		p.Velocity = Vec2{}
		p.Anim = "idle"
	}

	// Animation frame
	p.AnimTimer += dt
	if p.AnimTimer > 0.12 {
		p.AnimTimer = 0
		p.AnimFrame = (p.AnimFrame + 1) % 6
	}

	// Note: map clamping is done in world.go resolveCollisions
}

func (p *Player) TryCast(slot string, targetX, targetY float64) *ActiveEffect {
	sk, ok := p.Skills[slot]
	if !ok || sk.CdRemain > 0 || p.MP < sk.Def.MPCost || p.CastLock > 0 {
		return nil
	}

	p.MP -= sk.Def.MPCost
	sk.CdRemain = sk.Def.Cooldown
	p.CastLock = sk.Def.CastTime
	p.Anim = "cast"

	// War Cry is a self-buff, no effect entity
	if sk.Def.ID == "warrior_e" {
		p.SpeedBuff = sk.Def.Duration
		p.SpeedBuffMult = 0.4
		return &ActiveEffect{
			ID:       nextID("fx"),
			Def:      sk.Def,
			OwnerID:  p.ID,
			Position: p.Position,
			Age:      0,
			Duration: 1.0, // visual only
			HitSet:   make(map[string]float64),
			Params: map[string]float64{
				"radius": 150,
			},
		}
	}

	// Determine effect position
	effectPos := Vec2{targetX, targetY}
	// Clamp effect range for melee skills
	dist := p.Position.DistTo(effectPos)
	if sk.Def.HitboxSize < 150 && dist > 150 {
		dir := effectPos.Sub(p.Position).Normalize()
		effectPos = p.Position.Add(dir.Scale(80))
	}

	return &ActiveEffect{
		ID:       nextID("fx"),
		Def:      sk.Def,
		OwnerID:  p.ID,
		Position: effectPos,
		Age:      0,
		Duration: sk.Def.Duration,
		HitSet:   make(map[string]float64),
		Params: map[string]float64{
			"radius": sk.Def.HitboxSize,
			"angle":  math.Atan2(targetY-p.Position.Y, targetX-p.Position.X),
		},
	}
}

// RecalcAttrs recomputes Attrs from BaseAttrs + all equipped items
func (p *Player) RecalcAttrs() {
	a := p.BaseAttrs
	for _, eq := range p.Equipped {
		if eq == nil {
			continue
		}
		a.ATK += eq.ATK
		a.DEF += eq.DEF
		a.ATKSpeed += eq.ATKSpeed
		a.MoveSpeed += eq.MoveSpeed
		a.CritRate += eq.CritRate
		a.CritDmg += eq.CritDmg
		a.HPRegen += eq.HPRegen
		a.MPRegen += eq.MPRegen
		a.Armor += eq.Armor
		a.Dodge += eq.Dodge
		a.LifeSteal += eq.LifeSteal
		a.CDReduce += eq.CDReduce
		a.DmgBonus += eq.DmgBonus
		a.DmgReduce += eq.DmgReduce
	}
	// Cap percentages
	if a.CritRate > 0.80 { a.CritRate = 0.80 }
	if a.Dodge > 0.50 { a.Dodge = 0.50 }
	if a.CDReduce > 0.50 { a.CDReduce = 0.50 }
	if a.DmgReduce > 0.60 { a.DmgReduce = 0.60 }
	if a.LifeSteal > 0.30 { a.LifeSteal = 0.30 }
	p.Attrs = a
}

// EquipItem puts item in slot, returns old item (or nil)
func (p *Player) EquipItem(eqID string) *Equipment {
	// Find in inventory
	idx := -1
	for i, item := range p.Inventory {
		if item.ID == eqID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil
	}

	newItem := p.Inventory[idx]
	// Remove from inventory
	p.Inventory = append(p.Inventory[:idx], p.Inventory[idx+1:]...)

	// Swap with currently equipped
	old := p.Equipped[newItem.Slot]
	p.Equipped[newItem.Slot] = newItem

	// Put old back in inventory
	if old != nil {
		p.Inventory = append(p.Inventory, old)
	}

	p.RecalcAttrs()
	return old
}

// UnequipItem removes item from slot back to inventory
func (p *Player) UnequipItem(slot string) bool {
	eq, ok := p.Equipped[slot]
	if !ok || eq == nil {
		return false
	}
	if len(p.Inventory) >= 20 {
		return false // bag full
	}
	delete(p.Equipped, slot)
	p.Inventory = append(p.Inventory, eq)
	p.RecalcAttrs()
	return true
}

// PickupEquipment adds to inventory, returns false if full
func (p *Player) PickupEquipment(eq *Equipment) bool {
	if len(p.Inventory) >= 20 {
		return false
	}
	p.Inventory = append(p.Inventory, eq)
	return true
}

func (p *Player) TakeDamage(dmg int) {
	p.HP -= dmg
	if p.HP < 0 {
		p.HP = 0
	}
}

func (p *Player) AddXP(xp int) bool {
	p.XP += xp
	if p.XP >= p.XPNeeded {
		p.XP -= p.XPNeeded
		p.Level++
		p.XPNeeded = int(float64(p.XPNeeded) * 1.3)
		// Level up stats
		p.MaxHP += 50
		p.HP = p.MaxHP
		p.MaxMP += 10
		p.MP = p.MaxMP
		p.Speed += 5
		// Level up base attributes
		p.BaseAttrs.ATK += 8
		p.BaseAttrs.DEF += 3
		p.BaseAttrs.Armor += 2
		p.BaseAttrs.HPRegen += 1
		p.BaseAttrs.MPRegen += 0.5
		p.BaseAttrs.MoveSpeed += 5
		if p.BaseAttrs.CritRate < 0.5 {
			p.BaseAttrs.CritRate += 0.01
		}
		p.RecalcAttrs()
		return true
	}
	return false
}

func (p *Player) ToState() PlayerState {
	skills := make(map[string]SkillState)
	for slot, sk := range p.Skills {
		skills[slot] = SkillState{
			CdRemain: sk.CdRemain,
			MaxCd:    sk.Def.Cooldown,
		}
	}
	equipped := make(map[string]*Equipment)
	for slot, eq := range p.Equipped {
		equipped[slot] = eq
	}

	return PlayerState{
		ID:        p.ID,
		Hero:      p.Hero,
		Name:      p.Name,
		X:         p.Position.X,
		Y:         p.Position.Y,
		HP:        p.HP,
		MaxHP:     p.MaxHP,
		MP:        p.MP,
		MaxMP:     p.MaxMP,
		Facing:    p.Facing,
		Angle:     p.Angle,
		Anim:      p.Anim,
		AnimFrame: p.AnimFrame,
		Level:     p.Level,
		Gold:      p.Gold,
		Skills:    skills,
		Attrs:     p.Attrs,
		Equipped:  equipped,
		Inventory: p.Inventory,
	}
}
