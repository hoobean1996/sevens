package game

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	TickRate  = 20
	MapWidth  = 2000
	MapHeight = 1500

	// Arena mode constants
	ArenaWidth  = 800
	ArenaHeight = 600
	ShopPhaseDuration = 8.0
)

// PlayerConn wraps a websocket connection with a write channel
// to prevent concurrent writes (gorilla/websocket is NOT safe for concurrent writes)
type PlayerConn struct {
	conn    *websocket.Conn
	writeCh chan []byte
	done    chan struct{}
}

func newPlayerConn(conn *websocket.Conn) *PlayerConn {
	pc := &PlayerConn{
		conn:    conn,
		writeCh: make(chan []byte, 64), // buffered to avoid blocking game tick
		done:    make(chan struct{}),
	}
	go pc.writeLoop()
	return pc
}

func (pc *PlayerConn) writeLoop() {
	defer pc.conn.Close()
	for {
		select {
		case data, ok := <-pc.writeCh:
			if !ok {
				return
			}
			if err := pc.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		case <-pc.done:
			return
		}
	}
}

func (pc *PlayerConn) Send(data []byte) {
	select {
	case pc.writeCh <- data:
	default:
		// Drop message if buffer full (client too slow)
	}
}

func (pc *PlayerConn) Close() {
	close(pc.done)
}

type World struct {
	mu         sync.Mutex
	Players    map[string]*Player
	Conns      map[string]*PlayerConn
	ConnToID   map[*websocket.Conn]string // reverse lookup: conn -> playerID
	Enemies    []*Enemy
	Effects    []*ActiveEffect
	DamageNums []DamageNumber
	Drops      []*GroundDrop

	TickNum    uint64
	Wave       int
	WaveTimer  float64
	WaveActive bool

	// Arena mode
	ArenaMode      bool
	ShopPhase      bool
	ShopPhaseTimer float64
	Shops          []*ShopStation
}

func (w *World) reset() {
	w.Enemies = nil
	w.Effects = nil
	w.DamageNums = nil
	w.Drops = nil
	w.Wave = 0
	w.WaveTimer = 3.0
	w.TickNum = 0
	w.ArenaMode = true
	w.ShopPhase = false
	w.ShopPhaseTimer = 0
	w.Shops = initShops()
	log.Println("World reset — all players left")
}

func NewWorld() *World {
	return &World{
		Players:   make(map[string]*Player),
		Conns:     make(map[string]*PlayerConn),
		ConnToID:  make(map[*websocket.Conn]string),
		WaveTimer: 3.0,
		ArenaMode: true,
		Shops:     initShops(),
	}
}

func (w *World) Run() {
	dt := 1.0 / float64(TickRate)
	ticker := time.NewTicker(time.Second / TickRate)
	defer ticker.Stop()

	for range ticker.C {
		w.mu.Lock()
		w.TickNum++
		w.updatePlayers(dt)
		w.updateEnemies(dt)
		w.updateEffects(dt)
		w.updateWaves(dt)
		w.updateDrops(dt)
		snapshot := w.buildSnapshot()
		w.DamageNums = nil

		// Broadcast to all via write channels (non-blocking)
		for _, pc := range w.Conns {
			pc.Send(snapshot)
		}
		w.mu.Unlock()
	}
}

func (w *World) HandleConnection(conn *websocket.Conn) {
	// Read loop — runs on its own goroutine per connection
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			w.mu.Lock()
			if id, ok := w.ConnToID[conn]; ok {
				if pc, ok2 := w.Conns[id]; ok2 {
					pc.Close()
				}
				delete(w.Conns, id)
				delete(w.Players, id)
				delete(w.ConnToID, conn)
				log.Printf("Player %s disconnected", id)

				// Reset world when all players leave
				if len(w.Players) == 0 {
					w.reset()
				}
			}
			w.mu.Unlock()
			return
		}

		var msg ClientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		w.mu.Lock()
		w.handleMessage(conn, msg)
		w.mu.Unlock()
	}
}

func (w *World) handleMessage(conn *websocket.Conn, msg ClientMessage) {
	switch msg.Type {
	case "join":
		id := nextID("p")
		var spawnX, spawnY float64
		if w.ArenaMode {
			// Spawn at center of arena
			spawnX = ArenaWidth/2 + (rand.Float64()-0.5)*50
			spawnY = ArenaHeight/2 + (rand.Float64()-0.5)*50
		} else {
			spawnX = MapWidth/2 + (rand.Float64()-0.5)*200
			spawnY = MapHeight/2 + (rand.Float64()-0.5)*200
		}

		player := NewWarrior(id, msg.Name, Vec2{spawnX, spawnY})

		pc := newPlayerConn(conn)
		w.Players[id] = player
		w.Conns[id] = pc
		w.ConnToID[conn] = id
		log.Printf("Player %s (%s) joined as %s", id, msg.Name, msg.Hero)

		var mapW, mapH float64
		if w.ArenaMode {
			mapW, mapH = ArenaWidth, ArenaHeight
		} else {
			mapW, mapH = MapWidth, MapHeight
		}
		ack := ServerMessage{
			Type:      "joined",
			PlayerID:  id,
			MapWidth:  mapW,
			MapHeight: mapH,
			ArenaMode: w.ArenaMode,
		}
		data, _ := json.Marshal(ack)
		pc.Send(data)

	case "input":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok && msg.Keys != nil {
				p.Keys = *msg.Keys
			}
		}

	case "mouse":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok {
				p.MouseX = msg.TargetX
				p.MouseY = msg.TargetY
			}
		}

	case "move":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok {
				target := Vec2{msg.TargetX, msg.TargetY}
				p.MoveTarget = &target
				p.MovingToTarget = true
			}
		}

	case "cast":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok {
				effect := p.TryCast(msg.SkillID, msg.TargetX, msg.TargetY)
				if effect != nil {
					w.Effects = append(w.Effects, effect)
				}
			}
		}

	case "pickup":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok {
				bestIdx := -1
				bestDist := 60.0
				for i, d := range w.Drops {
					dist := p.Position.DistTo(d.Position)
					if dist < bestDist {
						bestDist = dist
						bestIdx = i
					}
				}
				if bestIdx >= 0 {
					d := w.Drops[bestIdx]
					if p.PickupEquipment(&d.Equip) {
						w.Drops = append(w.Drops[:bestIdx], w.Drops[bestIdx+1:]...)
						// Notify player
						notify := map[string]interface{}{
							"type":   "pickup_ok",
							"name":   d.Equip.Name,
							"rarity": d.Equip.Rarity,
							"slot":   d.Equip.Slot,
						}
						data, _ := json.Marshal(notify)
						if pc, ok := w.Conns[id]; ok {
							pc.Send(data)
						}
					}
				}
			}
		}

	case "equip":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok {
				p.EquipItem(msg.EquipID)
			}
		}

	case "unequip":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok {
				p.UnequipItem(msg.Slot)
			}
		}

	case "shop_buy":
		if id, ok := w.ConnToID[conn]; ok {
			if p, ok := w.Players[id]; ok {
				// Allow shopping anytime in arena mode
				result := w.ProcessShopBuy(p, msg.ShopID, msg.ItemID)
				notify := map[string]interface{}{
					"type":    "shop_result",
					"success": result.Success,
					"message": result.Message,
				}
				data, _ := json.Marshal(notify)
				if pc, ok := w.Conns[id]; ok {
					pc.Send(data)
				}
			}
		}
	}
}

const PlayerRadius = 18.0

func (w *World) updatePlayers(dt float64) {
	for _, p := range w.Players {
		// In arena mode, auto-target nearest enemy
		if w.ArenaMode && len(w.Enemies) > 0 {
			var nearest *Enemy
			minDist := math.MaxFloat64
			for _, e := range w.Enemies {
				if e.Dead {
					continue
				}
				d := p.Position.DistTo(e.Position)
				if d < minDist {
					minDist = d
					nearest = e
				}
			}
			if nearest != nil {
				p.MouseX = nearest.Position.X
				p.MouseY = nearest.Position.Y
			}
		}

		p.Update(dt, w.ArenaMode)

		// Auto-combat in arena mode
		if w.ArenaMode && !w.ShopPhase && len(w.Enemies) > 0 {
			w.autoCast(p)
		}
	}
}

// autoCast automatically uses skills when off cooldown
func (w *World) autoCast(p *Player) {
	if p.CastLock > 0 {
		return
	}

	// Priority: R (ultimate) > Q (slash) > W (shield bash) > E (war cry)
	// Use ultimate when available and there are multiple enemies
	skillOrder := []string{"r", "q", "w", "e"}
	if len(w.Enemies) < 3 {
		// Don't waste ultimate on few enemies
		skillOrder = []string{"q", "w", "e"}
	}

	for _, slot := range skillOrder {
		sk, ok := p.Skills[slot]
		if !ok || sk.CdRemain > 0 || p.MP < sk.Def.MPCost {
			continue
		}

		// Cast the skill at nearest enemy position
		effect := p.TryCast(slot, p.MouseX, p.MouseY)
		if effect != nil {
			w.Effects = append(w.Effects, effect)
			break // Only cast one skill per tick
		}
	}
}

func (w *World) updateEnemies(dt float64) {
	players := make([]*Player, 0, len(w.Players))
	for _, p := range w.Players {
		players = append(players, p)
	}

	alive := make([]*Enemy, 0, len(w.Enemies))
	for _, e := range w.Enemies {
		e.Update(dt, players)
		if !e.Dead {
			alive = append(alive, e)
		}
	}
	w.Enemies = alive

	// Collision resolution
	w.resolveCollisions()
}

func (w *World) resolveCollisions() {
	players := make([]*Player, 0, len(w.Players))
	for _, p := range w.Players {
		players = append(players, p)
	}

	// Player vs Enemy
	for _, p := range players {
		for _, e := range w.Enemies {
			if e.Dead {
				continue
			}
			if w.ArenaMode {
				// In arena mode, only push enemy away, player stays fixed
				resolveStaticCircleCollision(&e.Position, e.Kind.Radius, p.Position, PlayerRadius)
			} else {
				resolveCircleCollision(&p.Position, PlayerRadius, &e.Position, e.Kind.Radius)
			}
		}
	}

	// Enemy vs Enemy
	for i := 0; i < len(w.Enemies); i++ {
		if w.Enemies[i].Dead {
			continue
		}
		for j := i + 1; j < len(w.Enemies); j++ {
			if w.Enemies[j].Dead {
				continue
			}
			resolveCircleCollision(&w.Enemies[i].Position, w.Enemies[i].Kind.Radius,
				&w.Enemies[j].Position, w.Enemies[j].Kind.Radius)
		}
	}

	// Player vs Player
	for i := 0; i < len(players); i++ {
		for j := i + 1; j < len(players); j++ {
			resolveCircleCollision(&players[i].Position, PlayerRadius,
				&players[j].Position, PlayerRadius)
		}
	}

	// Player vs Obstacles (obstacles are immovable) - skip in arena mode
	if !w.ArenaMode {
		for _, p := range players {
			for _, obs := range MapObstacles {
				resolveStaticCircleCollision(&p.Position, PlayerRadius, obs.Position, obs.Radius)
			}
		}

		// Enemy vs Obstacles
		for _, e := range w.Enemies {
			if e.Dead {
				continue
			}
			for _, obs := range MapObstacles {
				resolveStaticCircleCollision(&e.Position, e.Kind.Radius, obs.Position, obs.Radius)
			}
		}
	}

	// Clamp all to map bounds after collision
	var mapW, mapH float64
	if w.ArenaMode {
		mapW, mapH = ArenaWidth, ArenaHeight
	} else {
		mapW, mapH = MapWidth, MapHeight
	}
	for _, p := range players {
		p.Position.X = math.Max(PlayerRadius, math.Min(mapW-PlayerRadius, p.Position.X))
		p.Position.Y = math.Max(PlayerRadius, math.Min(mapH-PlayerRadius, p.Position.Y))
	}
	for _, e := range w.Enemies {
		if !e.Dead {
			e.Position.X = math.Max(e.Kind.Radius, math.Min(mapW-e.Kind.Radius, e.Position.X))
			e.Position.Y = math.Max(e.Kind.Radius, math.Min(mapH-e.Kind.Radius, e.Position.Y))
		}
	}
}

// resolveStaticCircleCollision pushes a moving circle away from a static obstacle
func resolveStaticCircleCollision(pos *Vec2, r float64, obsPos Vec2, obsR float64) {
	dx := pos.X - obsPos.X
	dy := pos.Y - obsPos.Y
	dist := math.Sqrt(dx*dx + dy*dy)
	minDist := r + obsR
	if dist >= minDist || dist < 0.001 {
		return
	}
	overlap := minDist - dist
	nx := dx / dist
	ny := dy / dist
	pos.X += nx * overlap
	pos.Y += ny * overlap
}

// resolveCircleCollision pushes two circles apart if overlapping (each pushed half)
func resolveCircleCollision(posA *Vec2, rA float64, posB *Vec2, rB float64) {
	dx := posB.X - posA.X
	dy := posB.Y - posA.Y
	dist := math.Sqrt(dx*dx + dy*dy)
	minDist := rA + rB
	if dist >= minDist || dist < 0.001 {
		return
	}
	overlap := minDist - dist
	nx := dx / dist
	ny := dy / dist
	half := overlap * 0.5
	posA.X -= nx * half
	posA.Y -= ny * half
	posB.X += nx * half
	posB.Y += ny * half
}

func (w *World) updateEffects(dt float64) {
	active := make([]*ActiveEffect, 0, len(w.Effects))
	for _, ef := range w.Effects {
		ef.Age += dt
		if ef.Age > ef.Duration {
			continue
		}

		if ef.Def.Damage > 0 {
			for _, e := range w.Enemies {
				if e.Dead {
					continue
				}
				dx := ef.Position.X - e.Position.X
				dy := ef.Position.Y - e.Position.Y
				distSq := dx*dx + dy*dy
				hitbox := ef.Def.HitboxSize
				if distSq <= hitbox*hitbox && ef.CanHit(e.ID) {
					ef.RecordHit(e.ID)

					// Use player attributes for damage calc
					baseDmg := ef.Def.Damage
					critRate := 0.15
					critDmgMult := 1.8
					dmgBonus := 0.0
					lifeSteal := 0.0
					if owner, ok := w.Players[ef.OwnerID]; ok {
						baseDmg += owner.Attrs.ATK / 2
						critRate = owner.Attrs.CritRate
						critDmgMult = owner.Attrs.CritDmg
						dmgBonus = owner.Attrs.DmgBonus
						lifeSteal = owner.Attrs.LifeSteal
					}
					dmg := baseDmg + rand.Intn(baseDmg/4+1)
					dmg = int(float64(dmg) * (1 + dmgBonus))
					crit := rand.Float64() < critRate
					if crit {
						dmg = int(float64(dmg) * critDmgMult)
					}

					knockDir := e.Position.Sub(ef.Position).Normalize()
					killed := e.TakeDamage(dmg, knockDir, ef.Def.Knockback)

					// Life steal (reuse owner lookup from above)
					if lifeSteal > 0 {
						if owner, ok := w.Players[ef.OwnerID]; ok {
							owner.HP = min(owner.HP+int(float64(dmg)*lifeSteal), owner.MaxHP)
						}
					}

					w.DamageNums = append(w.DamageNums, DamageNumber{
						X: e.Position.X, Y: e.Position.Y - 30,
						Value: dmg, Crit: crit,
					})

					if killed {
						if p, ok := w.Players[ef.OwnerID]; ok {
							p.AddXP(e.Kind.XP)
							// Award gold in arena mode
							if w.ArenaMode {
								p.Gold += e.Kind.GoldDrop
							}
						}
						// Roll for equipment drop
						if drop := RollDrop(e.Kind.Name, w.Wave); drop != nil {
							w.Drops = append(w.Drops, &GroundDrop{
								ID:       drop.ID,
								Equip:    *drop,
								Position: e.Position,
								X:        e.Position.X,
								Y:        e.Position.Y,
							})
						}
					}
				}
			}
		}

		active = append(active, ef)
	}
	w.Effects = active
}

func (w *World) updateDrops(dt float64) {
	// In arena mode, auto-pickup for nearest player
	if w.ArenaMode {
		for _, d := range w.Drops {
			// Find nearest player
			var nearest *Player
			bestDist := 9999.0
			for _, p := range w.Players {
				dist := p.Position.DistTo(d.Position)
				if dist < bestDist {
					bestDist = dist
					nearest = p
				}
			}
			if nearest != nil {
				nearest.PickupEquipment(&d.Equip)
			}
		}
		w.Drops = nil // All drops auto-picked
		return
	}

	// Classic mode: Age drops, remove after 30 seconds
	alive := make([]*GroundDrop, 0, len(w.Drops))
	for _, d := range w.Drops {
		d.Age += dt
		if d.Age < 30 {
			alive = append(alive, d)
		}
	}
	w.Drops = alive
}

func (w *World) updateWaves(dt float64) {
	if len(w.Players) == 0 {
		return
	}

	if w.ArenaMode {
		// Arena mode: continuous waves, no shop phase pause
		// Spawn next wave immediately when all enemies are killed
		if len(w.Enemies) == 0 {
			if w.Wave == 0 {
				// First wave starts after initial timer
				w.WaveTimer -= dt
				if w.WaveTimer <= 0 {
					w.Wave++
					w.spawnWave()
					for _, shop := range w.Shops {
						shop.RefreshItems(w.Wave)
					}
				}
			} else {
				// Next wave starts immediately
				w.Wave++
				w.spawnWave()
				// Refresh shop items every wave
				for _, shop := range w.Shops {
					shop.RefreshItems(w.Wave)
				}
			}
		}
	} else {
		// Classic mode
		w.WaveTimer -= dt
		if w.WaveTimer <= 0 && len(w.Enemies) < 3 {
			w.Wave++
			w.spawnWave()
			w.WaveTimer = 12 + float64(w.Wave)*0.5
			if w.WaveTimer > 25 {
				w.WaveTimer = 25
			}
		}
	}
}

func (w *World) spawnWave() {
	log.Printf("Spawning wave %d", w.Wave)

	isBoss := w.Wave%5 == 0
	waveMult := 1.0 + float64(w.Wave)*0.1

	if w.ArenaMode {
		// Arena mode: spawn from edges
		if isBoss {
			// Boss from random edge
			pos := w.randomEdgePosition()
			w.Enemies = append(w.Enemies, NewEnemy("boss", pos, waveMult))
			// Minions
			for i := 0; i < 3+w.Wave/2; i++ {
				epos := w.randomEdgePosition()
				w.Enemies = append(w.Enemies, NewEnemy("skeleton", epos, waveMult))
			}
		} else {
			num := 4 + w.Wave*2
			if num > 20 {
				num = 20
			}
			for i := 0; i < num; i++ {
				pos := w.randomEdgePosition()
				kind := "skeleton"
				r := rand.Float64()
				if w.Wave >= 3 && r < 0.3 {
					kind = "orc"
				}
				if w.Wave >= 6 && r < 0.15 {
					kind = "demon"
				}
				w.Enemies = append(w.Enemies, NewEnemy(kind, pos, waveMult))
			}
		}
	} else {
		// Classic mode: spawn around player center
		var center Vec2
		count := 0
		for _, p := range w.Players {
			center = center.Add(p.Position)
			count++
		}
		if count > 0 {
			center = center.Scale(1.0 / float64(count))
		} else {
			center = Vec2{MapWidth / 2, MapHeight / 2}
		}

		if isBoss {
			ang := rand.Float64() * math.Pi * 2
			pos := Vec2{
				center.X + math.Cos(ang)*500,
				center.Y + math.Sin(ang)*500,
			}
			w.Enemies = append(w.Enemies, NewEnemy("boss", pos, waveMult))
			for i := 0; i < 3+w.Wave/2; i++ {
				a := rand.Float64() * math.Pi * 2
				d := 400 + rand.Float64()*200
				epos := Vec2{center.X + math.Cos(a)*d, center.Y + math.Sin(a)*d}
				w.Enemies = append(w.Enemies, NewEnemy("skeleton", epos, waveMult))
			}
		} else {
			num := 4 + w.Wave*2
			if num > 30 {
				num = 30
			}
			for i := 0; i < num; i++ {
				ang := rand.Float64() * math.Pi * 2
				dist := 350 + rand.Float64()*250
				pos := Vec2{
					center.X + math.Cos(ang)*dist,
					center.Y + math.Sin(ang)*dist,
				}
				kind := "skeleton"
				r := rand.Float64()
				if w.Wave >= 3 && r < 0.3 {
					kind = "orc"
				}
				if w.Wave >= 6 && r < 0.15 {
					kind = "demon"
				}
				w.Enemies = append(w.Enemies, NewEnemy(kind, pos, waveMult))
			}
		}
	}
}

// randomEdgePosition returns a position on the arena edge
func (w *World) randomEdgePosition() Vec2 {
	edge := rand.Intn(4)
	var x, y float64
	margin := 30.0
	switch edge {
	case 0: // top
		x = rand.Float64() * ArenaWidth
		y = margin
	case 1: // bottom
		x = rand.Float64() * ArenaWidth
		y = ArenaHeight - margin
	case 2: // left
		x = margin
		y = rand.Float64() * ArenaHeight
	case 3: // right
		x = ArenaWidth - margin
		y = rand.Float64() * ArenaHeight
	}
	return Vec2{x, y}
}

func (w *World) buildSnapshot() []byte {
	msg := ServerMessage{
		Type:    "state",
		Tick:    w.TickNum,
		Wave:    w.Wave,
		Players: make([]PlayerState, 0, len(w.Players)),
		Enemies: make([]EnemyState, 0, len(w.Enemies)),
		Effects: make([]EffectState, 0, len(w.Effects)),
		Drops:   make([]GroundDrop, 0, len(w.Drops)),
	}

	// Arena mode fields
	if w.ArenaMode {
		msg.ArenaMode = true
		msg.ShopPhase = w.ShopPhase
		msg.ShopPhaseTimer = w.ShopPhaseTimer
		msg.Shops = make([]ShopState, 0, len(w.Shops))
		for _, shop := range w.Shops {
			msg.Shops = append(msg.Shops, shop.ToState())
		}
	}

	for _, p := range w.Players {
		msg.Players = append(msg.Players, p.ToState())
	}
	for _, e := range w.Enemies {
		msg.Enemies = append(msg.Enemies, e.ToState())
	}
	for _, ef := range w.Effects {
		msg.Effects = append(msg.Effects, EffectState{
			ID:       ef.ID,
			Kind:     ef.Def.EffectKind,
			X:        ef.Position.X,
			Y:        ef.Position.Y,
			Age:      ef.Age,
			Duration: ef.Duration,
			Params:   ef.Params,
		})
	}
	for _, d := range w.Drops {
		msg.Drops = append(msg.Drops, *d)
	}
	msg.DamageNums = w.DamageNums

	data, _ := json.Marshal(msg)
	return data
}
