package game

import "math"

// Obstacle is a static collidable terrain object
type Obstacle struct {
	Position Vec2
	Radius   float64
	Kind     string // "rock", "tree"
}

// Predefined terrain obstacles (must match client-side generation)
var MapObstacles []Obstacle

func init() {
	// Use deterministic seed to place obstacles - must match client JS
	rng := newSeededRNG(42)

	// Large rocks
	for i := 0; i < 12; i++ {
		x := 100 + rng.Float64()*(MapWidth-200)
		y := 100 + rng.Float64()*(MapHeight-200)
		// Avoid center spawn area
		if math.Abs(x-MapWidth/2) < 200 && math.Abs(y-MapHeight/2) < 200 {
			x += 300
		}
		MapObstacles = append(MapObstacles, Obstacle{
			Position: Vec2{x, y},
			Radius:   20 + rng.Float64()*10,
			Kind:     "rock",
		})
	}

	// Trees
	for i := 0; i < 20; i++ {
		x := 80 + rng.Float64()*(MapWidth-160)
		y := 80 + rng.Float64()*(MapHeight-160)
		if math.Abs(x-MapWidth/2) < 180 && math.Abs(y-MapHeight/2) < 180 {
			y += 280
		}
		MapObstacles = append(MapObstacles, Obstacle{
			Position: Vec2{x, y},
			Radius:   14,
			Kind:     "tree",
		})
	}
}

// Simple seeded RNG (xorshift64) for deterministic terrain
type seededRNG struct {
	state uint64
}

func newSeededRNG(seed uint64) *seededRNG {
	if seed == 0 {
		seed = 1
	}
	return &seededRNG{state: seed}
}

func (r *seededRNG) Next() uint64 {
	r.state ^= r.state << 13
	r.state ^= r.state >> 7
	r.state ^= r.state << 17
	return r.state
}

func (r *seededRNG) Float64() float64 {
	return float64(r.Next()%1000000) / 1000000.0
}
