// @ts-nocheck
/* eslint-disable */
import { ParticleSystem, VFX } from "./Effects";
import { TOWN_GRID_W, TOWN_GRID_H, ISO_TILE_W, ISO_TILE_H, BUILDING_GRID_SIZE, BUILDING_NAMES, gridToScreen } from "./townConfig";

// ==================== RENDERER ====================
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.camera = { x: 0, y: 0 };
        this.targetCamera = { x: 0, y: 0 };
        this.cameraInited = false;
        this.lastPlayerX = 0;
        this.lastPlayerY = 0;
        this.particles = new ParticleSystem();
        this.shakeIntensity = 0;
        this.screenFlash = 0;
        this.screenDarken = 0;
        this.activeVfxState = {}; // effectID -> state
        this.prevEffects = new Set(); // track which effects we've initialized
        this.damageNumbers = []; // client-side floating damage numbers

        // Ground tile pattern (cached)
        this.groundPattern = null;
        this.generateGround();

        // Generate terrain obstacles (must match server seed=42)
        this.terrainObstacles = [];
        this._generateTerrain();

        // Stars for background
        this.bgStars = [];
        for (let i = 0; i < 100; i++) {
            this.bgStars.push({
                x: Math.random() * 4000 - 1000,
                y: Math.random() * 3000 - 750,
                size: Math.random() * 1.5 + 0.5,
                blink: Math.random() * Math.PI * 2,
            });
        }
    }

    generateGround() {
        // Create a repeating ground texture
        const tc = document.createElement('canvas');
        tc.width = 64; tc.height = 64;
        const tctx = tc.getContext('2d');

        // Dark stone floor
        tctx.fillStyle = '#14161e';
        tctx.fillRect(0, 0, 64, 64);

        // Grid lines
        tctx.strokeStyle = '#1c1f2a';
        tctx.lineWidth = 1;
        tctx.strokeRect(0, 0, 64, 64);

        // Random stone texture
        for (let i = 0; i < 20; i++) {
            tctx.fillStyle = `rgba(${Math.random()*30+15},${Math.random()*30+18},${Math.random()*40+25},0.3)`;
            const rx = Math.random() * 60;
            const ry = Math.random() * 60;
            tctx.fillRect(rx, ry, Math.random()*8+2, Math.random()*8+2);
        }

        this.groundTile = tc;
    }

    resize(w, h) {
        const width = w != null ? w : window.innerWidth;
        const height = h != null ? h : window.innerHeight;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    }

    _drawDiamond(ctx, cx, cy, scale) {
        const w = (ISO_TILE_W / 2) * (scale || 1);
        const h = (ISO_TILE_H / 2) * (scale || 1);
        ctx.beginPath();
        ctx.moveTo(cx - w, cy);
        ctx.lineTo(cx, cy - h);
        ctx.lineTo(cx + w, cy);
        ctx.lineTo(cx, cy + h);
        ctx.closePath();
    }

    _renderTown(ctx, W, H, townScene) {
        const { townState, buildingGridSize, townHoverCell, townDragBuilding, townSelectedBuilding } = townScene;
        const positions = townState.buildingPositions || {};
        const centerGx = (TOWN_GRID_W - 1) / 2;
        const centerGy = (TOWN_GRID_H - 1) / 2;
        const isoCenter = gridToScreen(centerGx, centerGy);
        ctx.fillStyle = '#0d0d14';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2 - isoCenter.x, H / 2 - isoCenter.y);

        for (let gy = 0; gy < TOWN_GRID_H; gy++) {
            for (let gx = 0; gx < TOWN_GRID_W; gx++) {
                const p = gridToScreen(gx, gy);
                ctx.fillStyle = (gx + gy) % 2 === 0 ? '#14161e' : '#1a1c26';
                this._drawDiamond(ctx, p.x, p.y, 1);
                ctx.fill();
                ctx.strokeStyle = '#1c1f2a';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        const buildingColors = {
            hall: '#8b7355',
            warehouse: '#6b7b8b',
            lumber: '#4a6b4a',
            quarry: '#7a7a7a',
            mine: '#5a5a6a',
            blacksmith: '#6a4a4a',
            tavern: '#8b6a4a',
            alchemy: '#4a6a7a',
        };

        const items = [];
        if (townHoverCell) {
            items.push({ gx: townHoverCell.x, gy: townHoverCell.y, kind: 'hover' });
        }
        if (townDragBuilding && townHoverCell) {
            items.push({ gx: townHoverCell.x, gy: townHoverCell.y, kind: 'preview', type: townDragBuilding });
        }
        for (const [type, pos] of Object.entries(positions)) {
            items.push({ gx: pos.x, gy: pos.y, kind: 'building', type, pos });
        }
        items.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));

        for (const it of items) {
            const p = gridToScreen(it.gx, it.gy);
            if (it.kind === 'hover') {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
                this._drawDiamond(ctx, p.x, p.y, 1);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
                ctx.lineWidth = 2;
                ctx.stroke();
            } else if (it.kind === 'preview') {
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = buildingColors[it.type] || '#444';
                this._drawDiamond(ctx, p.x, p.y, 1.15);
                ctx.fill();
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else {
                const size = buildingGridSize[it.type] || { w: 1, h: 1 };
                const isSelected = it.type === townSelectedBuilding;
                ctx.fillStyle = buildingColors[it.type] || '#444';
                this._drawDiamond(ctx, p.x, p.y, 1.15);
                ctx.fill();
                ctx.strokeStyle = isSelected ? '#ffaa00' : '#ffd700';
                ctx.lineWidth = isSelected ? 3 : 2;
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const level = townState.buildings[it.type] ?? 0;
                const label = (BUILDING_NAMES[it.type] || it.type) + ' Lv.' + level;
                ctx.fillText(label, p.x, p.y);
            }
        }
        ctx.restore();
    }

    render(gameState, localPlayerID, mouseWorldX, mouseWorldY, dt, moveTarget, townScene) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        if (townScene) {
            this._renderTown(ctx, W, H, townScene);
            return;
        }

        if (!gameState) return;

        // Find local player
        const localPlayer = gameState.players?.find(p => p.id === localPlayerID);

        // Camera: smooth follow on interpolated player position
        if (localPlayer) {
            if (!this.cameraInited) {
                this.camera.x = localPlayer.x;
                this.camera.y = localPlayer.y;
                this.cameraInited = true;
            }

            this.targetCamera.x = localPlayer.x;
            this.targetCamera.y = localPlayer.y;
        }

        // Smooth camera - tight follow to reduce motion sickness
        const camSpeed = 1 - Math.pow(0.0001, dt); // ~92% catch-up per frame
        this.camera.x += (this.targetCamera.x - this.camera.x) * camSpeed;
        this.camera.y += (this.targetCamera.y - this.camera.y) * camSpeed;

        // Shake (only for big effects, very reduced)
        let sx = 0, sy = 0;
        if (this.shakeIntensity > 1) {
            sx = (Math.random() - 0.5) * this.shakeIntensity * 0.3;
            sy = (Math.random() - 0.5) * this.shakeIntensity * 0.3;
            this.shakeIntensity *= 0.85;
        } else {
            this.shakeIntensity = 0;
        }

        // Clear
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(W / 2 - this.camera.x + sx, H / 2 - this.camera.y + sy);

        // Draw background stars
        for (const s of this.bgStars) {
            const blink = Math.sin(performance.now() * 0.001 + s.blink) * 0.3 + 0.7;
            ctx.globalAlpha = 0.3 * blink;
            ctx.fillStyle = '#446';
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        // Draw ground
        this.drawGround(ctx);

        // Draw terrain obstacles (rocks, trees)
        this.drawTerrain(ctx, performance.now() / 1000);

        // Draw map border
        ctx.strokeStyle = 'rgba(255,215,0,0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, gameState.map_width || 2000, gameState.map_height || 1500);

        // Draw ground effects (below entities)
        this.drawEffects(ctx, gameState.effects, dt, 'below');

        // Draw drops on ground
        this.drawDrops(ctx, gameState.drops);

        // Draw enemies
        this.drawEnemies(ctx, gameState.enemies);

        // Draw players
        this.drawPlayers(ctx, gameState.players, localPlayerID);

        // Draw above effects
        this.drawEffects(ctx, gameState.effects, dt, 'above');

        // Draw particles
        this.particles.update(dt);
        this.particles.draw(ctx);

        // Draw damage numbers from server
        this.processDamageNumbers(gameState.damage_nums);
        this.drawDamageNumbers(ctx, dt);

        // Draw move target indicator (right-click destination)
        if (moveTarget) {
            this.drawMoveTarget(ctx, moveTarget);
        }

        // Draw cursor target
        if (localPlayer) {
            this.drawCrosshair(ctx, mouseWorldX, mouseWorldY);

            // Draw direction indicator line from player to mouse
            ctx.save();
            ctx.strokeStyle = 'rgba(255,215,0,0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(localPlayer.x, localPlayer.y);
            const dx = mouseWorldX - localPlayer.x;
            const dy = mouseWorldY - localPlayer.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const maxLine = 80;
            if (dist > 10) {
                const nx = dx / dist, ny = dy / dist;
                ctx.lineTo(localPlayer.x + nx * Math.min(dist, maxLine), localPlayer.y + ny * Math.min(dist, maxLine));
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        ctx.restore();

        // ===== Screen-space overlays =====

        // Screen darken
        if (this.screenDarken > 0.01) {
            ctx.fillStyle = `rgba(0,0,0,${this.screenDarken})`;
            ctx.fillRect(0, 0, W, H);
            this.screenDarken *= 0.95;
        }

        // Screen flash
        if (this.screenFlash > 0.01) {
            ctx.fillStyle = `rgba(255,230,180,${this.screenFlash})`;
            ctx.fillRect(0, 0, W, H);
            this.screenFlash *= 0.85;
        }

        // Vignette (cached)
        if (!this._vignetteCache || this._vignetteCacheW !== W || this._vignetteCacheH !== H) {
            const vc = document.createElement('canvas');
            vc.width = W; vc.height = H;
            const vctx = vc.getContext('2d');
            const vg = vctx.createRadialGradient(W/2, H/2, W*0.35, W/2, H/2, W*0.7);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            vg.addColorStop(1, 'rgba(0,0,0,0.4)');
            vctx.fillStyle = vg;
            vctx.fillRect(0, 0, W, H);
            this._vignetteCache = vc;
            this._vignetteCacheW = W;
            this._vignetteCacheH = H;
        }
        ctx.drawImage(this._vignetteCache, 0, 0);

        // Low HP warning
        if (localPlayer && localPlayer.hp < localPlayer.max_hp * 0.25) {
            const pulse = Math.sin(performance.now() * 0.005) * 0.05 + 0.08;
            ctx.fillStyle = `rgba(255,0,0,${pulse})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // Seeded RNG matching server xorshift64
    _seededRNG(seed) {
        let state = BigInt(seed || 1);
        const mask = BigInt('0xFFFFFFFFFFFFFFFF');
        return {
            next() {
                state ^= (state << 13n) & mask;
                state ^= (state >> 7n) & mask;
                state ^= (state << 17n) & mask;
                state &= mask;
                return state;
            },
            float64() {
                return Number(this.next() % 1000000n) / 1000000;
            }
        };
    }

    _generateTerrain() {
        const rng = this._seededRNG(42);
        const mapW = 2000, mapH = 1500;

        // Large rocks (12) - must match server terrain.go exactly
        for (let i = 0; i < 12; i++) {
            let x = 100 + rng.float64() * (mapW - 200);
            let y = 100 + rng.float64() * (mapH - 200);
            if (Math.abs(x - mapW/2) < 200 && Math.abs(y - mapH/2) < 200) {
                x += 300;
            }
            const radius = 20 + rng.float64() * 10;
            this.terrainObstacles.push({ x, y, radius, kind: 'rock' });
        }

        // Trees (20) - must match server terrain.go exactly
        for (let i = 0; i < 20; i++) {
            let x = 80 + rng.float64() * (mapW - 160);
            let y = 80 + rng.float64() * (mapH - 160);
            if (Math.abs(x - mapW/2) < 180 && Math.abs(y - mapH/2) < 180) {
                y += 280;
            }
            this.terrainObstacles.push({ x, y, radius: 14, kind: 'tree' });
        }

        // Decorative elements (no collision, just visual)
        this._terrainDecor = [];
        // Grass patches
        for (let i = 0; i < 40; i++) {
            this._terrainDecor.push({
                x: rng.float64() * mapW,
                y: rng.float64() * mapH,
                size: 20 + rng.float64() * 30,
                kind: 'grass'
            });
        }
        // Small stones (decorative)
        for (let i = 0; i < 25; i++) {
            this._terrainDecor.push({
                x: rng.float64() * mapW,
                y: rng.float64() * mapH,
                size: 3 + rng.float64() * 5,
                kind: 'pebble'
            });
        }
        // Water puddles
        for (let i = 0; i < 6; i++) {
            let x = 150 + rng.float64() * (mapW - 300);
            let y = 150 + rng.float64() * (mapH - 300);
            this._terrainDecor.push({
                x, y,
                size: 30 + rng.float64() * 40,
                kind: 'water'
            });
        }
    }

    drawGround(ctx) {
        // Cache the full ground as one big canvas (only once)
        if (!this._groundCache) {
            const mapW = 2000, mapH = 1500, ts = 64;
            const gc = document.createElement('canvas');
            gc.width = mapW; gc.height = mapH;
            const gctx = gc.getContext('2d');
            for (let x = 0; x < mapW; x += ts) {
                for (let y = 0; y < mapH; y += ts) {
                    gctx.drawImage(this.groundTile, x, y);
                }
            }

            // Draw decorations onto ground cache
            this._drawDecorToGround(gctx);

            this._groundCache = gc;
        }
        ctx.drawImage(this._groundCache, 0, 0);
    }

    _drawDecorToGround(ctx) {
        // Grass patches
        for (const d of this._terrainDecor) {
            if (d.kind === 'grass') {
                ctx.save();
                ctx.translate(d.x, d.y);
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 + d.x * 0.1;
                    const dist = d.size * 0.3;
                    const bx = Math.cos(angle) * dist;
                    const by = Math.sin(angle) * dist;
                    ctx.strokeStyle = `rgba(${30+Math.floor(d.size)},${60+Math.floor(d.size*1.5)},${20},0.4)`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(bx, by);
                    ctx.quadraticCurveTo(bx + 2, by - d.size*0.3, bx - 1, by - d.size*0.5);
                    ctx.stroke();
                }
                ctx.restore();
            } else if (d.kind === 'pebble') {
                ctx.fillStyle = `rgba(40,44,55,0.5)`;
                ctx.beginPath();
                ctx.ellipse(d.x, d.y, d.size, d.size * 0.7, d.x * 0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(55,60,72,0.3)`;
                ctx.beginPath();
                ctx.ellipse(d.x - 1, d.y - 1, d.size * 0.6, d.size * 0.4, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (d.kind === 'water') {
                // Water puddle
                const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
                grad.addColorStop(0, 'rgba(30,60,100,0.35)');
                grad.addColorStop(0.7, 'rgba(20,45,80,0.2)');
                grad.addColorStop(1, 'rgba(15,30,50,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.ellipse(d.x, d.y, d.size * 1.2, d.size, d.y * 0.01, 0, Math.PI * 2);
                ctx.fill();
                // Water highlight
                ctx.fillStyle = 'rgba(80,140,200,0.1)';
                ctx.beginPath();
                ctx.ellipse(d.x - d.size*0.2, d.y - d.size*0.15, d.size*0.4, d.size*0.2, -0.3, 0, Math.PI*2);
                ctx.fill();
            }
        }
    }

    drawTerrain(ctx, time) {
        for (const obs of this.terrainObstacles) {
            if (obs.kind === 'rock') {
                this._drawRock(ctx, obs, time);
            } else if (obs.kind === 'tree') {
                this._drawTree(ctx, obs, time);
            }
        }
    }

    _drawRock(ctx, obs, time) {
        const { x, y, radius } = obs;
        ctx.save();
        ctx.translate(x, y);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(3, radius * 0.6, radius * 1.1, radius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main rock body
        const grad = ctx.createRadialGradient(-radius*0.3, -radius*0.3, 0, 0, 0, radius);
        grad.addColorStop(0, '#6a6a72');
        grad.addColorStop(0.6, '#4a4a52');
        grad.addColorStop(1, '#333338');
        ctx.fillStyle = grad;
        ctx.beginPath();
        // Irregular rock shape
        for (let i = 0; i <= 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const r = radius * (0.85 + Math.sin(ang * 3 + x) * 0.15);
            const px = Math.cos(ang) * r;
            const py = Math.sin(ang) * r * 0.8;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(180,180,190,0.15)';
        ctx.beginPath();
        ctx.ellipse(-radius*0.25, -radius*0.25, radius*0.4, radius*0.25, -0.5, 0, Math.PI*2);
        ctx.fill();

        // Cracks
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-radius*0.3, -radius*0.1);
        ctx.lineTo(radius*0.2, radius*0.15);
        ctx.moveTo(radius*0.1, -radius*0.3);
        ctx.lineTo(radius*0.05, radius*0.1);
        ctx.stroke();

        ctx.restore();
    }

    _drawTree(ctx, obs, time) {
        const { x, y, radius } = obs;
        ctx.save();
        ctx.translate(x, y);

        // Tree shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(4, 12, 22, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Trunk
        ctx.fillStyle = '#4a3520';
        ctx.fillRect(-4, -5, 8, 20);
        // Trunk detail
        ctx.fillStyle = '#3a2815';
        ctx.fillRect(-2, -3, 2, 16);

        // Tree crown (layered circles for depth)
        const sway = Math.sin(time * 0.5 + x * 0.01) * 1.5;
        const layers = [
            { ox: 0, oy: -18, r: 20, c: '#1a4a1a' },
            { ox: -8+sway, oy: -24, r: 16, c: '#226622' },
            { ox: 8+sway, oy: -22, r: 14, c: '#1e5a1e' },
            { ox: sway*0.5, oy: -30, r: 12, c: '#2a7a2a' },
        ];
        for (const l of layers) {
            ctx.fillStyle = l.c;
            ctx.beginPath();
            ctx.arc(l.ox, l.oy, l.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Leaf highlights
        ctx.fillStyle = 'rgba(60,180,60,0.2)';
        ctx.beginPath();
        ctx.arc(-3+sway, -28, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawPlayers(ctx, players, localID) {
        if (!players) return;
        for (const p of players) {
            this.drawCharacter(ctx, p, p.id === localID);
        }
    }

    drawCharacter(ctx, p, isLocal) {
        ctx.save();
        ctx.translate(p.x, p.y);

        const t = performance.now();
        const isRunning = p.anim === 'run';
        const isCasting = p.anim === 'cast';
        const bob = isRunning ? Math.sin(t * 0.012) * 2 : 0;

        // Determine 4-direction facing from the angle
        // 0=right, PI/2=down, PI=left, -PI/2=up
        const angle = p.angle || 0;
        let dir = 'down'; // default
        if (angle > -Math.PI * 0.75 && angle <= -Math.PI * 0.25) dir = 'up';
        else if (angle > -Math.PI * 0.25 && angle <= Math.PI * 0.25) dir = 'right';
        else if (angle > Math.PI * 0.25 && angle <= Math.PI * 0.75) dir = 'down';
        else dir = 'left';

        const flip = (dir === 'left') ? -1 : 1;
        const showBack = (dir === 'up');
        const showFront = (dir === 'down');

        // Shadow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, 22, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Selection ring
        if (isLocal) {
            ctx.strokeStyle = 'rgba(255,215,0,0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(0, 22, 20, 8, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Flip for left/right
        ctx.save();
        ctx.scale(flip, 1);

        const legPhase = isRunning ? t * 0.013 : 0;
        const legSwing = isRunning ? 4 : 0;

        // === CAPE (behind, only visible from front/side) ===
        if (!showBack) {
            // cape is behind, draw first
        }
        if (showBack) {
            // Draw cape from behind
            ctx.fillStyle = '#661122';
            ctx.beginPath();
            ctx.moveTo(-8, 0 + bob);
            ctx.quadraticCurveTo(-10, 16 + Math.sin(t*0.003)*2, -4, 22 + bob);
            ctx.lineTo(4, 22 + bob);
            ctx.quadraticCurveTo(10, 16 + Math.sin(t*0.003+1)*2, 8, 0 + bob);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#881133';
            ctx.beginPath();
            ctx.moveTo(-6, 2 + bob);
            ctx.quadraticCurveTo(-7, 12, -3, 18 + bob);
            ctx.lineTo(3, 18 + bob);
            ctx.quadraticCurveTo(7, 12, 6, 2 + bob);
            ctx.closePath();
            ctx.fill();
        }

        // === BOOTS ===
        ctx.fillStyle = '#442200';
        this._roundRect(ctx, -7, 16 + Math.sin(legPhase)*legSwing + bob, 5, 6, 2); ctx.fill();
        this._roundRect(ctx, 2, 16 + Math.cos(legPhase)*legSwing + bob, 5, 6, 2); ctx.fill();

        // === LEGS ===
        ctx.fillStyle = '#553333';
        ctx.fillRect(-6, 8 + Math.sin(legPhase)*legSwing + bob, 4, 10);
        ctx.fillRect(2, 8 + Math.cos(legPhase)*legSwing + bob, 4, 10);

        // === BODY ARMOR ===
        ctx.fillStyle = '#aa3333';
        this._roundRect(ctx, -9, -8 + bob, 18, 18, 3); ctx.fill();

        // Chest plate
        if (showFront || !showBack) {
            ctx.fillStyle = '#cc4444';
            this._roundRect(ctx, -7, -6 + bob, 14, 12, 2); ctx.fill();
            // Gold emblem
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(0, 1 + bob, 3, 0, Math.PI*2); ctx.fill();
        }

        // Belt
        ctx.fillStyle = '#664400';
        ctx.fillRect(-8, 6 + bob, 16, 3);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-2, 6 + bob, 4, 3);

        // Shoulders
        ctx.fillStyle = '#888';
        this._roundRect(ctx, -13, -8 + bob, 6, 7, 2); ctx.fill();
        this._roundRect(ctx, 7, -8 + bob, 6, 7, 2); ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(-10, -5 + bob, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, -5 + bob, 1.5, 0, Math.PI*2); ctx.fill();

        // === HEAD ===
        // Neck
        ctx.fillStyle = showBack ? '#bb8855' : '#cc9966';
        ctx.fillRect(-3, -12 + bob, 6, 5);

        // Face/head
        ctx.fillStyle = showBack ? '#bb8855' : '#ddaa77';
        this._roundRect(ctx, -6, -20 + bob, 12, 10, 3); ctx.fill();

        if (showFront) {
            // Eyes
            ctx.fillStyle = '#333';
            ctx.fillRect(-3, -16 + bob, 2, 2);
            ctx.fillRect(2, -16 + bob, 2, 2);
            // Mouth
            ctx.fillStyle = '#aa7755';
            ctx.fillRect(-2, -12 + bob, 4, 1);
        }

        // Helmet
        ctx.fillStyle = '#999';
        this._roundRect(ctx, -7, -23 + bob, 14, 8, 3); ctx.fill();
        // Helmet highlight
        ctx.fillStyle = '#aaa';
        ctx.fillRect(-5, -23 + bob, 10, 3);

        // Helmet crest
        ctx.fillStyle = '#cc0000';
        ctx.beginPath();
        ctx.moveTo(-1, -28 + bob); ctx.lineTo(1, -28 + bob);
        ctx.lineTo(2, -23 + bob); ctx.lineTo(-2, -23 + bob);
        ctx.closePath(); ctx.fill();
        // Plume
        ctx.fillStyle = '#dd2222';
        ctx.beginPath();
        ctx.moveTo(0, -30 + bob);
        ctx.quadraticCurveTo(5, -27 + bob, 3, -22 + bob);
        ctx.quadraticCurveTo(0, -25 + bob, 0, -30 + bob);
        ctx.fill();

        if (showFront || !showBack) {
            // Visor
            ctx.fillStyle = '#333';
            ctx.fillRect(-5, -18 + bob, 10, 2);
        }

        // === SWORD (right side, visible from front and side) ===
        if (!showBack) {
            ctx.save();
            if (isCasting) {
                ctx.translate(10, -6 + bob);
                ctx.rotate(-0.8 + Math.sin(t * 0.025) * 0.8);
            } else {
                ctx.translate(10, 0 + bob);
                ctx.rotate(-0.15 + (isRunning ? Math.sin(t*0.008)*0.1 : 0));
            }
            // Blade
            ctx.fillStyle = '#ccc';
            ctx.beginPath();
            ctx.moveTo(0, -26); ctx.lineTo(3, -24); ctx.lineTo(3, 0); ctx.lineTo(0, 0);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(0, -24, 1, 22);
            // Point
            ctx.fillStyle = '#ddd';
            ctx.beginPath(); ctx.moveTo(0,-26); ctx.lineTo(1.5,-28); ctx.lineTo(3,-26); ctx.fill();
            // Guard
            ctx.fillStyle = '#ffd700';
            this._roundRect(ctx, -3, -1, 9, 3, 1); ctx.fill();
            // Grip
            ctx.fillStyle = '#553300';
            ctx.fillRect(0, 2, 3, 5);
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(1.5, 8, 2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }

        // === SHIELD (left side) ===
        if (!showBack) {
            ctx.save();
            ctx.translate(-12, -2 + bob);
            if (isCasting) ctx.rotate(0.2);
            ctx.fillStyle = '#7788aa';
            ctx.beginPath();
            ctx.moveTo(0, -8); ctx.lineTo(7, -4); ctx.lineTo(7, 7);
            ctx.lineTo(3, 12); ctx.lineTo(0, 12); ctx.lineTo(-3, 7); ctx.lineTo(-3, -4);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#aabbcc'; ctx.lineWidth = 1; ctx.stroke();
            // Emblem
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(2, 2, 3, 0, Math.PI*2); ctx.fill();
            // Rivets
            ctx.fillStyle = '#ccc';
            ctx.beginPath(); ctx.arc(-1, -4, 1, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(5, -2, 1, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(5, 7, 1, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }

        // Back-facing: show sword on back
        if (showBack) {
            ctx.fillStyle = '#886644';
            ctx.fillRect(3, -18 + bob, 2, 20); // scabbard strap
            ctx.fillStyle = '#aaa';
            ctx.fillRect(4, -22 + bob, 2, 18); // blade peeking out
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(3, -4 + bob, 4, 2); // hilt
            // Shield on back
            ctx.fillStyle = '#667788';
            ctx.beginPath();
            ctx.ellipse(-4, 0 + bob, 6, 8, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#889aaa'; ctx.lineWidth = 1; ctx.stroke();
        }

        ctx.restore(); // end flip

        // === Overlays (no flip, no rotation) ===
        ctx.textAlign = 'center';
        ctx.font = `${isLocal ? 'bold ' : ''}11px sans-serif`;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(p.name || 'WARRIOR', 0, -34);
        ctx.fillStyle = isLocal ? '#ffd700' : '#88aaff';
        ctx.fillText(p.name || 'WARRIOR', 0, -34);

        // HP bar
        const barW = 36, barY = -42;
        const hpRatio = p.hp / p.max_hp;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this._roundRect(ctx, -barW/2, barY, barW, 5, 2); ctx.fill();
        if (hpRatio > 0) {
            ctx.fillStyle = hpRatio > 0.5 ? '#00cc44' : hpRatio > 0.25 ? '#ddcc00' : '#dd2200';
            this._roundRect(ctx, -barW/2, barY, barW * hpRatio, 5, 2); ctx.fill();
        }

        // MP bar
        const mpRatio = p.mp / p.max_mp;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this._roundRect(ctx, -barW/2, barY + 6, barW, 3, 1); ctx.fill();
        if (mpRatio > 0) {
            ctx.fillStyle = '#4488ff';
            this._roundRect(ctx, -barW/2, barY + 6, barW * mpRatio, 3, 1); ctx.fill();
        }

        ctx.restore();
    }

    // Rounded rectangle helper
    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    drawEnemies(ctx, enemies) {
        if (!enemies) return;
        for (const e of enemies) {
            this.drawEnemy(ctx, e);
        }
    }

    drawEnemy(ctx, e) {
        ctx.save();
        ctx.translate(e.x, e.y);

        const flip = e.facing === 'left' ? -1 : 1;
        ctx.scale(flip, 1);

        const t = performance.now();
        const bob = Math.sin(t * 0.006) * 2;
        const isRunning = e.anim === 'run';
        const scale = e.kind === 'boss' ? 2.0 : e.kind === 'demon' ? 1.3 : 1;

        // Shadow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, 18 * scale, 14 * scale, 5 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Aggro ring for boss
        if (e.kind === 'boss') {
            ctx.strokeStyle = 'rgba(255,0,0,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 18 * scale, 24 * scale, 10 * scale, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.scale(scale, scale);

        if (e.kind === 'skeleton') {
            // === SKELETON ===
            const legP = isRunning ? t * 0.01 : 0;
            // Legs (bones)
            ctx.fillStyle = '#bbb';
            ctx.fillRect(-5, 8 + Math.sin(legP)*(isRunning?4:0), 3, 10);
            ctx.fillRect(2, 8 + Math.cos(legP)*(isRunning?4:0), 3, 10);
            // Ribcage
            ctx.fillStyle = '#ccc';
            this._roundRect(ctx, -6, -6 + bob, 12, 14, 2);
            ctx.fill();
            // Ribs
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(-4, -2 + i*3 + bob);
                ctx.lineTo(4, -2 + i*3 + bob);
                ctx.stroke();
            }
            // Arms (bones)
            ctx.fillStyle = '#bbb';
            ctx.fillRect(-9, -4 + bob, 3, 12);
            ctx.fillRect(6, -4 + bob, 3, 12);
            // Skull
            ctx.fillStyle = '#eee';
            this._roundRect(ctx, -6, -18 + bob, 12, 12, 4);
            ctx.fill();
            // Eye sockets
            ctx.fillStyle = '#200';
            ctx.beginPath(); ctx.arc(-3, -13 + bob, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(3, -13 + bob, 2, 0, Math.PI*2); ctx.fill();
            // Eye glow
            ctx.fillStyle = 'rgba(255,50,0,0.7)';
            ctx.beginPath(); ctx.arc(-3, -13 + bob, 1, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(3, -13 + bob, 1, 0, Math.PI*2); ctx.fill();
            // Jaw
            ctx.fillStyle = '#ddd';
            ctx.fillRect(-4, -8 + bob, 8, 3);
            ctx.fillStyle = '#888';
            for (let i = 0; i < 4; i++) ctx.fillRect(-3 + i*2, -7 + bob, 1, 2);
            // Weapon: rusty sword
            ctx.save();
            ctx.translate(8, -2 + bob);
            ctx.rotate(0.4);
            ctx.fillStyle = '#886655';
            ctx.fillRect(-1, -14, 2, 16);
            ctx.fillStyle = '#664433';
            ctx.fillRect(-2, 0, 4, 2);
            ctx.restore();

        } else if (e.kind === 'orc') {
            // === ORC ===
            const legP = isRunning ? t * 0.009 : 0;
            ctx.fillStyle = '#334422';
            ctx.fillRect(-6, 8 + Math.sin(legP)*(isRunning?4:0), 5, 10);
            ctx.fillRect(2, 8 + Math.cos(legP)*(isRunning?4:0), 5, 10);
            // Body
            ctx.fillStyle = '#4a7a3a';
            this._roundRect(ctx, -8, -8 + bob, 16, 18, 3);
            ctx.fill();
            // Armor vest
            ctx.fillStyle = '#553300';
            ctx.fillRect(-6, -4 + bob, 12, 8);
            ctx.fillStyle = '#664411';
            ctx.fillRect(-4, -3 + bob, 8, 6);
            // Arms
            ctx.fillStyle = '#4a7a3a';
            this._roundRect(ctx, -12, -6 + bob, 5, 14, 2);
            ctx.fill();
            this._roundRect(ctx, 7, -6 + bob, 5, 14, 2);
            ctx.fill();
            // Head
            ctx.fillStyle = '#5b8b4b';
            this._roundRect(ctx, -6, -18 + bob, 12, 11, 4);
            ctx.fill();
            // Angry eyes
            ctx.fillStyle = '#ff4400';
            ctx.fillRect(-4, -14 + bob, 3, 2);
            ctx.fillRect(2, -14 + bob, 3, 2);
            // Underbite
            ctx.fillStyle = '#3a5a2a';
            ctx.fillRect(-5, -9 + bob, 10, 3);
            // Tusks
            ctx.fillStyle = '#ffffcc';
            ctx.beginPath();
            ctx.moveTo(-4, -8 + bob); ctx.lineTo(-5, -5 + bob); ctx.lineTo(-3, -8 + bob);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(4, -8 + bob); ctx.lineTo(5, -5 + bob); ctx.lineTo(3, -8 + bob);
            ctx.fill();
            // Axe
            ctx.save();
            ctx.translate(10, -4 + bob);
            ctx.rotate(0.3 + (isRunning ? Math.sin(t*0.008)*0.2 : 0));
            ctx.fillStyle = '#553300';
            ctx.fillRect(-1, -16, 2, 20);
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.moveTo(1, -16); ctx.lineTo(7, -12); ctx.lineTo(7, -8); ctx.lineTo(1, -6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

        } else if (e.kind === 'demon') {
            // === DEMON ===
            const legP = isRunning ? t * 0.011 : 0;
            ctx.fillStyle = '#440000';
            ctx.fillRect(-5, 8 + Math.sin(legP)*(isRunning?4:0), 4, 10);
            ctx.fillRect(2, 8 + Math.cos(legP)*(isRunning?4:0), 4, 10);
            // Body
            ctx.fillStyle = '#aa2222';
            this._roundRect(ctx, -8, -8 + bob, 16, 18, 3);
            ctx.fill();
            // Dark runes on body
            ctx.strokeStyle = 'rgba(255,100,0,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, 0 + bob, 4, 0, Math.PI); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-3, -4+bob); ctx.lineTo(3, 4+bob); ctx.stroke();
            // Wings (small)
            ctx.fillStyle = '#660000';
            ctx.beginPath();
            ctx.moveTo(-8, -6 + bob);
            ctx.quadraticCurveTo(-18, -16 + bob + Math.sin(t*0.006)*3, -12, -2 + bob);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(8, -6 + bob);
            ctx.quadraticCurveTo(18, -16 + bob + Math.sin(t*0.006+1)*3, 12, -2 + bob);
            ctx.closePath();
            ctx.fill();
            // Head
            ctx.fillStyle = '#cc3333';
            this._roundRect(ctx, -6, -18 + bob, 12, 11, 4);
            ctx.fill();
            // Horns
            ctx.fillStyle = '#441100';
            ctx.beginPath();
            ctx.moveTo(-5, -16+bob); ctx.lineTo(-8, -26+bob); ctx.lineTo(-3, -18+bob);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(5, -16+bob); ctx.lineTo(8, -26+bob); ctx.lineTo(3, -18+bob);
            ctx.closePath(); ctx.fill();
            // Glowing eyes
            ctx.fillStyle = '#ffcc00';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ff8800';
            ctx.beginPath(); ctx.arc(-3, -13+bob, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(3, -13+bob, 2, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;

        } else if (e.kind === 'boss') {
            // === BOSS ===
            const legP = isRunning ? t * 0.008 : 0;
            // Legs
            ctx.fillStyle = '#442200';
            this._roundRect(ctx, -7, 8+Math.sin(legP)*(isRunning?3:0), 6, 12, 2);
            ctx.fill();
            this._roundRect(ctx, 2, 8+Math.cos(legP)*(isRunning?3:0), 6, 12, 2);
            ctx.fill();
            // Body - dark lord armor
            ctx.fillStyle = '#442200';
            this._roundRect(ctx, -10, -10+bob, 20, 22, 4);
            ctx.fill();
            // Armor details
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1;
            ctx.strokeRect(-8, -8+bob, 16, 18);
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(0, 0+bob, 3, 0, Math.PI*2); ctx.fill();
            // Massive shoulder armor
            ctx.fillStyle = '#555';
            this._roundRect(ctx, -16, -12+bob, 8, 10, 3);
            ctx.fill();
            this._roundRect(ctx, 8, -12+bob, 8, 10, 3);
            ctx.fill();
            // Spikes on shoulders
            ctx.fillStyle = '#888';
            ctx.beginPath(); ctx.moveTo(-14,-14+bob); ctx.lineTo(-12,-22+bob); ctx.lineTo(-10,-14+bob); ctx.fill();
            ctx.beginPath(); ctx.moveTo(10,-14+bob); ctx.lineTo(12,-22+bob); ctx.lineTo(14,-14+bob); ctx.fill();
            // Head
            ctx.fillStyle = '#dd4400';
            this._roundRect(ctx, -7, -22+bob, 14, 12, 4);
            ctx.fill();
            // Crown
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.moveTo(-8, -22+bob);
            ctx.lineTo(-8, -28+bob); ctx.lineTo(-5, -24+bob);
            ctx.lineTo(-2, -30+bob); ctx.lineTo(0, -24+bob);
            ctx.lineTo(2, -30+bob); ctx.lineTo(5, -24+bob);
            ctx.lineTo(8, -28+bob); ctx.lineTo(8, -22+bob);
            ctx.closePath();
            ctx.fill();
            // Crown gems
            ctx.fillStyle = '#ff0000';
            ctx.beginPath(); ctx.arc(0, -26+bob, 2, 0, Math.PI*2); ctx.fill();
            // Eyes
            ctx.fillStyle = '#ff0000';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff0000';
            ctx.beginPath(); ctx.arc(-3, -17+bob, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(3, -17+bob, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            // Giant weapon
            ctx.save();
            ctx.translate(14, -6+bob);
            ctx.rotate(0.3 + Math.sin(t*0.005)*0.15);
            ctx.fillStyle = '#444';
            ctx.fillRect(-2, -24, 4, 30);
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.moveTo(2, -24); ctx.lineTo(10, -18); ctx.lineTo(10, -10); ctx.lineTo(2, -4);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ff4400';
            ctx.beginPath(); ctx.arc(6, -14, 2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
            // Aura particles (visual only)
            ctx.globalAlpha = 0.15 + Math.sin(t*0.003)*0.1;
            const auraGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
            auraGrd.addColorStop(0, 'rgba(255,50,0,0.3)');
            auraGrd.addColorStop(1, 'rgba(255,50,0,0)');
            ctx.fillStyle = auraGrd;
            ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.scale(1/scale, 1/scale);
        ctx.scale(flip, 1);

        // HP bar
        const barW = e.kind === 'boss' ? 70 : 28;
        const barY = (e.kind === 'boss' ? -70 : -25) * (e.kind === 'demon' ? 1.3 : 1);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this._roundRect(ctx, -barW/2, barY, barW, 5, 2);
        ctx.fill();
        const hpRatio = e.hp / e.max_hp;
        if (hpRatio > 0) {
            ctx.fillStyle = hpRatio > 0.5 ? '#cc2222' : hpRatio > 0.25 ? '#cc8800' : '#cccc00';
            this._roundRect(ctx, -barW/2, barY, barW * hpRatio, 5, 2);
            ctx.fill();
        }

        // Enemy name
        if (e.kind === 'boss') {
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText('★ 暗黑领主 ★', 0, barY - 6);
            ctx.fillStyle = '#ff4';
            ctx.fillText('★ 暗黑领主 ★', 0, barY - 6);
        }

        ctx.restore();
    }

    drawEffects(ctx, effects, dt, layer) {
        if (!effects) return;

        const currentEffectIDs = new Set();

        for (const ef of effects) {
            currentEffectIDs.add(ef.id);

            const vfxDef = VFX[ef.kind];
            if (!vfxDef) continue;

            // Initialize effect state if new
            if (!this.prevEffects.has(ef.id)) {
                this.prevEffects.add(ef.id);
                if (vfxDef.init) {
                    const state = vfxDef.init(ef, this.particles);
                    this.activeVfxState[ef.id] = state || {};
                }
            }

            // Get or create state
            let state = this.activeVfxState[ef.id];
            if (!state) state = this.activeVfxState[ef.id] = {};

            // Render
            if (layer === 'below') {
                // Ground effects rendered below entities
                if (ef.kind === 'warrior_ult') {
                    vfxDef.render(ctx, ef, this.particles, state);
                }
            } else {
                // Above effects
                if (ef.kind !== 'warrior_ult') {
                    vfxDef.render(ctx, ef, this.particles, state);
                }
            }

            // Apply state feedback to renderer
            if (state.shakeAmount) {
                this.shakeIntensity = Math.max(this.shakeIntensity, state.shakeAmount);
                state.shakeAmount = 0;
            }
            if (state.screenFlash) {
                this.screenFlash = Math.max(this.screenFlash, state.screenFlash);
                state.screenFlash = 0;
            }
            if (state.screenDarken) {
                this.screenDarken = Math.max(this.screenDarken, state.screenDarken);
            }
        }

        // Clean up old effect states
        for (const id of this.prevEffects) {
            if (!currentEffectIDs.has(id)) {
                this.prevEffects.delete(id);
                delete this.activeVfxState[id];
            }
        }
    }

    processDamageNumbers(nums) {
        if (!nums) return;
        let playedHit = false;
        for (const n of nums) {
            this.damageNumbers.push({
                x: n.x + (Math.random() - 0.5) * 20,
                y: n.y,
                value: n.value,
                crit: n.crit,
                life: 1.0,
                vy: -2,
                scale: n.crit ? 1.5 : 1.0,
            });
            // Sound: max 1 hit + 1 crit per batch to avoid spam
            if (typeof sfx !== 'undefined' && !playedHit) {
                if (n.crit) { sfx.crit(); } else { sfx.hit(); }
                playedHit = true;
            }
        }
    }

    drawDamageNumbers(ctx, dt) {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const d = this.damageNumbers[i];
            d.life -= dt * 1.2;
            d.y += d.vy;
            d.vy -= 0.08;
            d.scale *= 0.995;

            if (d.life <= 0) {
                this.damageNumbers.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.scale(d.scale, d.scale);
            ctx.globalAlpha = Math.min(1, d.life * 2);
            ctx.font = `bold ${d.crit ? 20 : 15}px sans-serif`;
            ctx.textAlign = 'center';

            // Outline
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(d.value, 0, 0);

            // Fill
            ctx.fillStyle = d.crit ? '#ffd700' : '#fff';
            ctx.fillText(d.value, 0, 0);

            if (d.crit) {
                ctx.fillStyle = '#ff4400';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText('CRIT!', 0, -15);
            }

            ctx.restore();
        }
    }

    drawDrops(ctx, drops) {
        if (!drops) return;
        const rarityColors = ['#cccccc', '#44ff44', '#4488ff', '#bb44ff', '#ff8800'];
        const rarityGlow   = ['rgba(170,170,170,0.15)', 'rgba(68,255,68,0.25)', 'rgba(68,136,255,0.35)', 'rgba(187,68,255,0.4)', 'rgba(255,136,0,0.5)'];
        const rarityNames  = ['普通', '优秀', '稀有', '史诗', '传说'];
        const slotIcons = { weapon: this._drawWeaponDrop, armor: this._drawArmorDrop, helmet: this._drawHelmetDrop, boots: this._drawBootsDrop, ring: this._drawRingDrop, amulet: this._drawAmuletDrop };
        const now = performance.now() * 0.001;

        for (const d of drops) {
            const eq = d.equip;
            const r = eq.rarity || 0;
            const color = rarityColors[r];
            const glow = rarityGlow[r];
            const bob = Math.sin(now * 2.5 + d.x * 0.1) * 4;

            ctx.save();
            ctx.translate(d.x, d.y + bob);

            // Ground shadow
            ctx.beginPath();
            ctx.ellipse(0, 12, 16, 5, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fill();

            // Glow pillar for rare+
            if (r >= 2) {
                ctx.save();
                ctx.globalAlpha = 0.15 + r * 0.05 + Math.sin(now * 3) * 0.05;
                ctx.fillStyle = color;
                ctx.fillRect(-2, -40, 4, 50);
                ctx.globalAlpha = 1;
                ctx.restore();
            }

            // Glow circle
            ctx.beginPath();
            ctx.arc(0, 0, 18 + r * 3, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            // Draw slot-specific icon
            const drawFn = slotIcons[eq.slot];
            if (drawFn) {
                drawFn.call(this, ctx, color, r, now);
            }

            // Sparkles for rare+
            if (r >= 2) {
                const count = r + 1;
                for (let i = 0; i < count; i++) {
                    const ang = now * 1.8 + i * (Math.PI * 2 / count) + d.y * 0.03;
                    const sr = 20 + r * 2;
                    const sx = Math.cos(ang) * sr;
                    const sy = Math.sin(ang) * sr * 0.5 - 5;
                    const sparkAlpha = 0.5 + Math.sin(now * 4 + i * 1.7) * 0.4;
                    ctx.fillStyle = color;
                    ctx.globalAlpha = sparkAlpha;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            }

            // Item name
            ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillText(eq.name, 1, -22);
            ctx.fillStyle = color;
            ctx.fillText(eq.name, 0, -23);

            // [F] hint
            ctx.font = '9px "Microsoft YaHei", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('[F]', 0, 24);

            ctx.restore();
        }
    }

    // ---- Drop item icons by slot ----
    _drawWeaponDrop(ctx, color, r, now) {
        ctx.save();
        ctx.rotate(-0.4);
        // Blade
        ctx.fillStyle = '#ccd';
        ctx.beginPath();
        ctx.moveTo(-2, -16);
        ctx.lineTo(2, -16);
        ctx.lineTo(3, -2);
        ctx.lineTo(-3, -2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Edge highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-1, -15, 2, 12);
        // Guard
        ctx.fillStyle = color;
        ctx.fillRect(-6, -3, 12, 3);
        // Handle
        ctx.fillStyle = '#664422';
        ctx.fillRect(-1.5, 0, 3, 8);
        // Pommel
        ctx.beginPath();
        ctx.arc(0, 9, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    _drawArmorDrop(ctx, color, r, now) {
        // Chest plate
        ctx.fillStyle = '#556';
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(10, -10);
        ctx.lineTo(12, 2);
        ctx.lineTo(8, 10);
        ctx.lineTo(-8, 10);
        ctx.lineTo(-12, 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Center line
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.stroke();
        // Gem
        ctx.beginPath();
        ctx.arc(0, -3, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    _drawHelmetDrop(ctx, color, r, now) {
        // Dome
        ctx.fillStyle = '#667';
        ctx.beginPath();
        ctx.arc(0, -2, 10, Math.PI, 0);
        ctx.lineTo(10, 6);
        ctx.lineTo(-10, 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Visor
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-7, 1, 14, 4);
        // Crest
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(2, -6);
        ctx.lineTo(-2, -6);
        ctx.closePath();
        ctx.fill();
    }

    _drawBootsDrop(ctx, color, r, now) {
        // Boot shape
        ctx.fillStyle = '#554';
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.lineTo(4, -10);
        ctx.lineTo(5, 4);
        ctx.lineTo(12, 6);
        ctx.lineTo(12, 10);
        ctx.lineTo(-6, 10);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Buckle
        ctx.fillStyle = color;
        ctx.fillRect(-3, -2, 6, 2);
    }

    _drawRingDrop(ctx, color, r, now) {
        // Ring band
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ccaa44';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Gem on top
        ctx.beginPath();
        ctx.arc(0, -8, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // Gem shine
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(-1, -9, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawAmuletDrop(ctx, color, r, now) {
        // Chain
        ctx.strokeStyle = '#aa8844';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -6, 8, Math.PI * 0.8, Math.PI * 0.2);
        ctx.stroke();
        // Pendant body
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(6, 4);
        ctx.lineTo(0, 12);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fillStyle = '#445';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Center gem
        ctx.beginPath();
        ctx.arc(0, 5, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(-1, 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawMoveTarget(ctx, target) {
        const alpha = target.life / 0.6;
        ctx.save();
        ctx.translate(target.x, target.y);
        ctx.globalAlpha = alpha;

        // Green click indicator (like Warcraft/LoL)
        const r = 12 * (1 + (1 - alpha) * 0.5);

        // Rotating segments
        const rot = performance.now() * 0.003;
        ctx.strokeStyle = '#00ff44';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const a = rot + (i / 4) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(0, 0, r, a, a + 0.4);
            ctx.stroke();
        }

        // Center dot
        ctx.fillStyle = '#00ff44';
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawCrosshair(ctx, mx, my) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.strokeStyle = 'rgba(255,215,0,0.5)';
        ctx.lineWidth = 1.5;

        // Cross
        const g = 5, len = 12;
        ctx.beginPath();
        ctx.moveTo(-len, 0); ctx.lineTo(-g, 0);
        ctx.moveTo(g, 0); ctx.lineTo(len, 0);
        ctx.moveTo(0, -len); ctx.lineTo(0, -g);
        ctx.moveTo(0, g); ctx.lineTo(0, len);
        ctx.stroke();

        // Circle
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,0,0.3)';
        ctx.stroke();

        // Dot
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

export { Renderer };
