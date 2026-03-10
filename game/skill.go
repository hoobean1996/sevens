package game

// SkillDef is the static definition template for a skill
type SkillDef struct {
	ID         string
	Name       string
	Slot       string  // "q", "w", "e", "r"
	MPCost     int
	Cooldown   float64 // seconds
	CastTime   float64 // seconds of cast animation
	EffectKind string  // maps to frontend VFX
	Damage     int
	HitboxType string  // "circle", "rect", "cone"
	HitboxSize float64 // radius for circle
	Duration   float64 // how long the effect persists
	MultiHit   bool
	HitInterval float64 // seconds between hits if MultiHit
	Knockback  float64 // knockback force
}

// SkillInstance is a player's runtime copy of a skill
type SkillInstance struct {
	Def      *SkillDef
	CdRemain float64 // seconds remaining
}

// ActiveEffect is a live skill effect in the world
type ActiveEffect struct {
	ID       string
	Def      *SkillDef
	OwnerID  string
	Position Vec2
	Age      float64
	Duration float64
	HitSet   map[string]float64 // entityID -> last hit time
	Params   map[string]float64
}

func (e *ActiveEffect) CanHit(entityID string) bool {
	if !e.Def.MultiHit {
		_, hit := e.HitSet[entityID]
		return !hit
	}
	lastHit, ok := e.HitSet[entityID]
	if !ok {
		return true
	}
	return e.Age-lastHit >= e.Def.HitInterval
}

func (e *ActiveEffect) RecordHit(entityID string) {
	e.HitSet[entityID] = e.Age
}

// WarriorSkills returns the skills for the warrior hero
func WarriorSkills() map[string]*SkillInstance {
	defs := []*SkillDef{
		{
			ID: "warrior_auto", Name: "普通攻击", Slot: "auto",
			MPCost: 0, Cooldown: 0.6, CastTime: 0.05,
			EffectKind: "slash_auto", Damage: 30,
			HitboxType: "circle", HitboxSize: 80,
			Duration: 0.25, MultiHit: false, Knockback: 60,
		},
		{
			ID: "warrior_q", Name: "裂空斩", Slot: "q",
			MPCost: 15, Cooldown: 3, CastTime: 0.15,
			EffectKind: "slash_arc", Damage: 45,
			HitboxType: "circle", HitboxSize: 100,
			Duration: 0.4, MultiHit: false, Knockback: 80,
		},
		{
			ID: "warrior_w", Name: "盾击冲锋", Slot: "w",
			MPCost: 25, Cooldown: 8, CastTime: 0.1,
			EffectKind: "shield_bash", Damage: 60,
			HitboxType: "circle", HitboxSize: 70,
			Duration: 0.3, MultiHit: false, Knockback: 200,
		},
		{
			ID: "warrior_e", Name: "战吼", Slot: "e",
			MPCost: 20, Cooldown: 15, CastTime: 0.2,
			EffectKind: "war_cry", Damage: 0,
			HitboxType: "circle", HitboxSize: 0,
			Duration: 5.0, MultiHit: false, Knockback: 0,
		},
		{
			ID: "warrior_r", Name: "七星审判", Slot: "r",
			MPCost: 80, Cooldown: 30, CastTime: 0.5,
			EffectKind: "warrior_ult", Damage: 80,
			HitboxType: "circle", HitboxSize: 250,
			Duration: 2.5, MultiHit: true, HitInterval: 0.3, Knockback: 50,
		},
	}

	skills := make(map[string]*SkillInstance)
	for _, d := range defs {
		skills[d.Slot] = &SkillInstance{Def: d, CdRemain: 0}
	}
	return skills
}
