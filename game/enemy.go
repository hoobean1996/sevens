package game

import "math"

type EnemyKind struct {
	Name     string
	HP       int
	Speed    float64
	Damage   int
	XP       int
	Score    int
	Radius   float64 // collision radius
	GoldDrop int     // gold dropped on kill
}

var EnemyKinds = map[string]EnemyKind{
	"skeleton": {Name: "skeleton", HP: 120, Speed: 80, Damage: 15, XP: 10, Score: 20, Radius: 16, GoldDrop: 5},
	"orc":      {Name: "orc", HP: 200, Speed: 60, Damage: 25, XP: 20, Score: 40, Radius: 20, GoldDrop: 12},
	"demon":    {Name: "demon", HP: 350, Speed: 100, Damage: 35, XP: 35, Score: 70, Radius: 20, GoldDrop: 25},
	"boss":     {Name: "boss", HP: 2000, Speed: 50, Damage: 60, XP: 200, Score: 500, Radius: 32, GoldDrop: 100},
}

type Enemy struct {
	ID       string
	Kind     EnemyKind
	Position Vec2
	Velocity Vec2
	HP       int
	MaxHP    int
	Facing   string
	Anim     string
	Dead     bool

	// AI state
	AITimer    float64
	AIState    string // "chase", "attack", "wander"
	AttackCD   float64
	HitFlash   float64
}

func NewEnemy(kind string, pos Vec2, waveMult float64) *Enemy {
	k := EnemyKinds[kind]
	hp := int(float64(k.HP) * waveMult)
	return &Enemy{
		ID:       nextID("e"),
		Kind:     k,
		Position: pos,
		HP:       hp,
		MaxHP:    hp,
		Facing:   "left",
		Anim:     "idle",
		AIState:  "chase",
	}
}

func (e *Enemy) Update(dt float64, players []*Player) {
	if e.Dead {
		return
	}

	e.AttackCD -= dt
	e.HitFlash -= dt
	e.AITimer += dt

	// Find nearest player
	var target *Player
	minDist := math.MaxFloat64
	for _, p := range players {
		if p.HP <= 0 {
			continue
		}
		d := e.Position.DistTo(p.Position)
		if d < minDist {
			minDist = d
			target = p
		}
	}

	if target == nil {
		e.Anim = "idle"
		return
	}

	dir := target.Position.Sub(e.Position).Normalize()

	switch e.AIState {
	case "chase":
		e.Velocity = dir.Scale(e.Kind.Speed)
		e.Position = e.Position.Add(e.Velocity.Scale(dt))
		e.Anim = "run"

		if dir.X > 0 {
			e.Facing = "right"
		} else {
			e.Facing = "left"
		}

		// Attack when close (must be > collision radii sum to work with collision)
		attackRange := e.Kind.Radius + 35
		if minDist < attackRange && e.AttackCD <= 0 {
			e.AIState = "attack"
			e.AITimer = 0
		}

	case "attack":
		e.Anim = "attack"
		if e.AITimer > 0.5 {
			// Deal damage
			attackRange := e.Kind.Radius + 45
			if minDist < attackRange && e.AttackCD <= 0 {
				target.TakeDamage(e.Kind.Damage)
				e.AttackCD = 1.5
			}
			e.AIState = "chase"
			e.AITimer = 0
		}
	}
	// Note: map clamping is done in world.go resolveCollisions
}

func (e *Enemy) TakeDamage(dmg int, knockbackDir Vec2, knockbackForce float64) bool {
	e.HP -= dmg
	e.HitFlash = 0.15
	e.Position = e.Position.Add(knockbackDir.Scale(knockbackForce * 0.1))
	if e.HP <= 0 {
		e.Dead = true
		return true
	}
	return false
}

func (e *Enemy) ToState() EnemyState {
	return EnemyState{
		ID:    e.ID,
		Kind:  e.Kind.Name,
		X:     e.Position.X,
		Y:     e.Position.Y,
		HP:    e.HP,
		MaxHP: e.MaxHP,
		Anim:  e.Anim,
		Facing: e.Facing,
	}
}
