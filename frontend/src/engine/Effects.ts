// @ts-nocheck
/* eslint-disable */
// ==================== PARTICLE SYSTEM ====================
class Particle {
    constructor(x, y, vx, vy, life, color, size, opts = {}) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.color = color; this.size = size;
        this.gravity = opts.gravity || 0;
        this.friction = opts.friction || 0.99;
        this.fadeOut = opts.fadeOut !== false;
        this.shrink = opts.shrink || false;
        this.type = opts.type || 'circle'; // circle, spark, ring, line
        this.angle = opts.angle || 0;
        this.rotSpeed = opts.rotSpeed || 0;
    }

    update(dt) {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.rotSpeed;
        this.life -= dt;
    }

    draw(ctx) {
        const t = Math.max(0, this.life / this.maxLife);
        const alpha = this.fadeOut ? t : 1;
        const sz = this.shrink ? this.size * t : this.size;
        if (alpha <= 0 || sz <= 0) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        switch (this.type) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(0, 0, sz, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
                break;
            case 'spark':
                ctx.fillStyle = this.color;
                ctx.fillRect(-sz * 2, -sz * 0.3, sz * 4, sz * 0.6);
                break;
            case 'ring':
                ctx.beginPath();
                ctx.arc(0, 0, sz, 0, Math.PI * 2);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 2 * t;
                ctx.stroke();
                break;
            case 'line':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(sz * 3, 0);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = sz * 0.5;
                ctx.stroke();
                break;
        }

        ctx.restore();
    }

    get dead() { return this.life <= 0; }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    emit(x, y, count, config) {
        // Cap total particles to prevent lag
        if (this.particles.length > 750) return;
        if (this.particles.length > 500) {
            count = Math.max(1, Math.floor(count * 0.3));
        }

        for (let i = 0; i < count; i++) {
            const ang = config.angle !== undefined
                ? config.angle + (Math.random() - 0.5) * (config.spread || 0)
                : Math.random() * Math.PI * 2;
            const spd = (config.speed || 3) * (0.5 + Math.random() * 0.5);
            const life = (config.life || 1) * (0.7 + Math.random() * 0.3);
            const size = (config.size || 3) * (0.7 + Math.random() * 0.6);
            const color = Array.isArray(config.colors)
                ? config.colors[Math.floor(Math.random() * config.colors.length)]
                : (config.color || '#fff');

            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * (config.posSpread || 0),
                y + (Math.random() - 0.5) * (config.posSpread || 0),
                Math.cos(ang) * spd,
                Math.sin(ang) * spd,
                life, color, size,
                {
                    gravity: config.gravity || 0,
                    friction: config.friction || 0.98,
                    fadeOut: config.fadeOut !== false,
                    shrink: config.shrink || false,
                    type: config.type || 'circle',
                    angle: ang,
                    rotSpeed: config.rotSpeed || 0,
                }
            ));
        }
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].dead) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            p.draw(ctx);
        }
    }

    get count() { return this.particles.length; }
}

// ==================== VFX DEFINITIONS ====================
// Each VFX definition has a render(ctx, effect, particles, dt, screenShake) method
// effect: { kind, x, y, age, duration, params: { radius, angle, ... } }

const VFX = {
    // ===== Q: 裂空斩 - Crescent Slash =====
    slash_arc: {
        init(effect, particles) {
            const ang = effect.params.angle || 0;
            const r = effect.params.radius || 100;
            // Spawn slash sparks
            particles.emit(effect.x, effect.y, 30, {
                angle: ang, spread: 1.2,
                speed: 8, life: 0.3, size: 4,
                colors: ['#ffd700', '#ff8800', '#fff', '#ffaa00'],
                type: 'spark', friction: 0.92,
            });
            // Edge sparks
            for (let i = 0; i < 12; i++) {
                const a = ang - 0.6 + (i / 11) * 1.2;
                const ex = effect.x + Math.cos(a) * r * 0.8;
                const ey = effect.y + Math.sin(a) * r * 0.8;
                particles.emit(ex, ey, 3, {
                    angle: a, spread: 0.3,
                    speed: 4, life: 0.4, size: 3,
                    colors: ['#ffd700', '#fff'],
                    type: 'circle', shrink: true,
                });
            }
            return { shakeAmount: 6 };
        },
        render(ctx, effect) {
            const t = effect.age / effect.duration;
            const ang = effect.params.angle || 0;
            const r = (effect.params.radius || 100) * Math.min(1, t * 4);

            if (t > 1) return;

            ctx.save();
            ctx.translate(effect.x, effect.y);
            ctx.rotate(ang);

            // Main slash arc
            const alpha = 1 - t;
            ctx.globalAlpha = alpha;

            // Glow
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#ffd700';

            // Draw arc
            ctx.beginPath();
            ctx.arc(0, 0, r, -0.6, 0.6);
            ctx.lineWidth = 12 * (1 - t);
            ctx.strokeStyle = '#ffd700';
            ctx.stroke();

            // Inner bright arc
            ctx.beginPath();
            ctx.arc(0, 0, r, -0.4, 0.4);
            ctx.lineWidth = 5 * (1 - t);
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.restore();
        }
    },

    // ===== 普攻: 简单劈砍 - Basic Slash =====
    slash_auto: {
        init(effect, particles) {
            const ang = effect.params.angle || 0;
            const r = effect.params.radius || 70;
            // 少量火花，整体比 Q 更克制
            particles.emit(effect.x, effect.y, 10, {
                angle: ang, spread: 0.8,
                speed: 6, life: 0.25, size: 3,
                colors: ['#ffaa00', '#fff'],
                type: 'spark', friction: 0.9,
            });
            // 轻微屏幕震动
            return { shakeAmount: 2 };
        },
        render(ctx, effect) {
            const t = effect.age / effect.duration;
            if (t > 1) return;

            const ang = effect.params.angle || 0;
            const baseR = effect.params.radius || 70;
            const grow = Math.min(1, t * 5);
            const r = baseR * grow;

            ctx.save();
            ctx.translate(effect.x, effect.y);
            ctx.rotate(ang);

            const alpha = 0.9 * (1 - t);
            ctx.globalAlpha = alpha;

            // 白色光晕：先画一层柔和的白色弧光，让剑轨更清晰
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#fff';
            ctx.beginPath();
            ctx.arc(0, 0, r, -0.45, 0.45);
            ctx.lineWidth = 14 * (1 - t);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.stroke();

            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffaa00';

            // 外层黄色细弧
            ctx.beginPath();
            ctx.arc(0, 0, r, -0.4, 0.4);
            ctx.lineWidth = 4 * (1 - t);
            ctx.strokeStyle = '#ffaa00';
            ctx.stroke();

            // 内层白色剑光线
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.7, -0.25, 0.25);
            ctx.lineWidth = 2 * (1 - t);
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.restore();
        },
    },

    // ===== W: 盾击冲锋 - Shield Bash =====
    shield_bash: {
        init(effect, particles) {
            particles.emit(effect.x, effect.y, 25, {
                speed: 6, life: 0.3, size: 4,
                colors: ['#4488ff', '#88bbff', '#fff'],
                type: 'circle', shrink: true,
            });
            return { shakeAmount: 8 };
        },
        render(ctx, effect) {
            const t = effect.age / effect.duration;
            if (t > 1) return;
            const r = (effect.params.radius || 70) * Math.min(1, t * 3);

            ctx.save();
            ctx.translate(effect.x, effect.y);

            // Shockwave ring
            ctx.globalAlpha = 1 - t;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.lineWidth = 6 * (1 - t);
            ctx.strokeStyle = '#4488ff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#4488ff';
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Inner flash
            if (t < 0.3) {
                ctx.globalAlpha = (0.3 - t) * 2;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = '#88bbff';
                ctx.fill();
            }

            ctx.restore();
        }
    },

    // ===== E: 战吼 - War Cry =====
    war_cry: {
        init(effect, particles) {
            // Emit all at once instead of using setTimeout (avoids stale reference)
            particles.emit(effect.x, effect.y, 25, {
                speed: 5, life: 0.6, size: 3,
                colors: ['#ffdd00', '#ff8800', '#ffaa44'],
                type: 'circle', shrink: true,
            });
            return { shakeAmount: 3 };
        },
        render(ctx, effect) {
            const t = effect.age / effect.duration;
            if (t > 1) return;
            const r = effect.params.radius || 150;

            ctx.save();
            ctx.translate(effect.x, effect.y);

            // Expanding rings
            for (let i = 0; i < 3; i++) {
                const ringT = Math.max(0, t * 3 - i * 0.3);
                if (ringT > 1) continue;
                const ringR = r * ringT;
                ctx.globalAlpha = (1 - ringT) * 0.5;
                ctx.beginPath();
                ctx.arc(0, 0, ringR, 0, Math.PI * 2);
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#ffd700';
                ctx.stroke();
            }

            ctx.restore();
        }
    },

    // ===== R: 七星审判 - ULTIMATE - The Big One =====
    warrior_ult: {
        init(effect, particles) {
            return { shakeAmount: 0, phase: -1 };
        },
        render(ctx, effect, particles, state) {
            const t = effect.age / effect.duration;
            const r = effect.params.radius || 250;
            const cx = effect.x, cy = effect.y;

            if (t > 1) return;

            // ===== PHASE 1 (0-0.2): 聚能 - Dark energy gathering =====
            if (t < 0.2) {
                const pt = t / 0.2;

                // Screen darken
                // (handled in renderer as a global overlay)

                // Particles rush INWARD
                if (effect.age % 0.05 < 0.02) {
                    for (let i = 0; i < 8; i++) {
                        const ang = Math.random() * Math.PI * 2;
                        const dist = r * (1.5 - pt * 0.5);
                        const px = cx + Math.cos(ang) * dist;
                        const py = cy + Math.sin(ang) * dist;
                        const toCenter = Math.atan2(cy - py, cx - px);
                        particles.emit(px, py, 1, {
                            angle: toCenter, spread: 0.2,
                            speed: 6 + pt * 4, life: 0.4, size: 3 + pt * 3,
                            colors: ['#ffd700', '#ff4400', '#ff8800', '#fff'],
                            type: 'circle', friction: 0.95,
                        });
                    }
                }

                // Ground cracks radiating from center
                ctx.save();
                ctx.translate(cx, cy);
                ctx.globalAlpha = pt * 0.6;
                for (let i = 0; i < 7; i++) {
                    const a = (i / 7) * Math.PI * 2 + effect.age * 0.5;
                    const len = r * 0.8 * pt;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    // Jagged line
                    let lx = 0, ly = 0;
                    for (let j = 1; j <= 5; j++) {
                        const frac = j / 5;
                        lx = Math.cos(a) * len * frac + (Math.random() - 0.5) * 15;
                        ly = Math.sin(a) * len * frac + (Math.random() - 0.5) * 15;
                        ctx.lineTo(lx, ly);
                    }
                    ctx.strokeStyle = '#ff4400';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#ff4400';
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;

                // Central orb growing
                const orbR = 15 * pt;
                const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, orbR);
                grd.addColorStop(0, '#fff');
                grd.addColorStop(0.3, '#ffd700');
                grd.addColorStop(1, 'rgba(255,68,0,0)');
                ctx.globalAlpha = pt;
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(0, 0, orbR, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();

                if (state) state.shakeAmount = 3 + pt * 8;
                if (state) state.screenDarken = pt * 0.4;
            }

            // ===== PHASE 2 (0.2-0.4): 爆发 - Eruption =====
            if (t >= 0.2 && t < 0.4) {
                const pt = (t - 0.2) / 0.2;

                // Trigger screen flash at start
                if (pt < 0.05 && state) {
                    state.screenFlash = 0.8;
                    state.shakeAmount = 25;
                }

                // MASSIVE particle burst at start of phase
                if (pt < 0.1) {
                    particles.emit(cx, cy, 60, {
                        speed: 12, life: 0.8, size: 5,
                        colors: ['#ffd700', '#ff8800', '#ff4400', '#fff', '#ffcc00'],
                        type: 'spark', friction: 0.94,
                        posSpread: 30,
                    });
                    particles.emit(cx, cy, 30, {
                        speed: 8, life: 1.0, size: 4,
                        colors: ['#ffd700', '#fff'],
                        type: 'circle', shrink: true, friction: 0.96,
                    });
                }

                ctx.save();
                ctx.translate(cx, cy);

                // Light pillar
                const pillarW = 60 + Math.sin(effect.age * 15) * 10;
                const pillarH = 800;
                const pillarAlpha = (1 - pt) * 0.8;
                ctx.globalAlpha = pillarAlpha;
                const pillarGrd = ctx.createLinearGradient(0, -pillarH/2, 0, pillarH/2);
                pillarGrd.addColorStop(0, 'rgba(255,215,0,0)');
                pillarGrd.addColorStop(0.3, 'rgba(255,215,0,0.8)');
                pillarGrd.addColorStop(0.5, '#fff');
                pillarGrd.addColorStop(0.7, 'rgba(255,215,0,0.8)');
                pillarGrd.addColorStop(1, 'rgba(255,215,0,0)');
                ctx.fillStyle = pillarGrd;
                ctx.fillRect(-pillarW/2, -pillarH/2, pillarW, pillarH);

                // Shockwave rings expanding
                for (let i = 0; i < 3; i++) {
                    const ringPt = Math.max(0, pt - i * 0.1);
                    const ringR = r * ringPt * 1.2;
                    ctx.globalAlpha = Math.max(0, (1 - ringPt) * 0.6);
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
                    ctx.lineWidth = 5 * (1 - ringPt);
                    ctx.strokeStyle = i === 0 ? '#fff' : '#ffd700';
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = '#ffd700';
                    ctx.stroke();
                }

                ctx.shadowBlur = 0;
                ctx.restore();

                if (state) state.screenDarken = (1 - pt) * 0.3;
            }

            // ===== PHASE 3 (0.4-0.8): 持续伤害 - Sustained Damage =====
            if (t >= 0.4 && t < 0.8) {
                const pt = (t - 0.4) / 0.4;

                ctx.save();
                ctx.translate(cx, cy);

                // Rotating energy slashes (7 slashes for "Seven Stars")
                for (let i = 0; i < 7; i++) {
                    const slashAng = (i / 7) * Math.PI * 2 + effect.age * 3;
                    const slashR = r * (0.3 + 0.7 * Math.sin(pt * Math.PI));

                    ctx.globalAlpha = (1 - pt) * 0.7;
                    ctx.beginPath();
                    ctx.arc(0, 0, slashR, slashAng - 0.15, slashAng + 0.15);
                    ctx.lineWidth = 8;
                    ctx.strokeStyle = '#ffd700';
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#ff8800';
                    ctx.stroke();

                    // Star point at each slash end
                    const sx = Math.cos(slashAng) * slashR;
                    const sy = Math.sin(slashAng) * slashR;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 6 * (1-pt), 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                }

                // Central sustained glow
                ctx.globalAlpha = (1 - pt) * 0.4;
                const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
                grd.addColorStop(0, 'rgba(255,215,0,0.5)');
                grd.addColorStop(0.5, 'rgba(255,136,0,0.2)');
                grd.addColorStop(1, 'rgba(255,68,0,0)');
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.restore();

                // Continuous sparks
                if (effect.age % 0.08 < 0.02) {
                    particles.emit(cx, cy, 5, {
                        speed: 6, life: 0.4, size: 3,
                        colors: ['#ffd700', '#ff8800', '#fff'],
                        type: 'spark', posSpread: r * 0.5,
                        friction: 0.95,
                    });
                }

                if (state) state.shakeAmount = 4 * (1 - pt);
            }

            // ===== PHASE 4 (0.8-1.0): 消散 - Dissipation =====
            if (t >= 0.8) {
                const pt = (t - 0.8) / 0.2;

                ctx.save();
                ctx.translate(cx, cy);

                // Fading glow
                ctx.globalAlpha = (1 - pt) * 0.3;
                const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * (1 - pt * 0.5));
                grd.addColorStop(0, 'rgba(255,215,0,0.3)');
                grd.addColorStop(1, 'rgba(255,136,0,0)');
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(0, 0, r * (1 - pt * 0.5), 0, Math.PI * 2);
                ctx.fill();

                // Seven stars floating up
                for (let i = 0; i < 7; i++) {
                    const a = (i / 7) * Math.PI * 2;
                    const starR = r * 0.5 * (1 - pt);
                    const sx = Math.cos(a) * starR;
                    const sy = Math.sin(a) * starR - pt * 80;
                    ctx.globalAlpha = (1 - pt);
                    ctx.fillStyle = '#ffd700';
                    ctx.beginPath();
                    ctx.arc(sx, sy, 4 * (1 - pt), 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();

                // Embers floating upward
                if (effect.age % 0.1 < 0.02) {
                    particles.emit(cx + (Math.random()-0.5)*r, cy, 3, {
                        angle: -Math.PI/2, spread: 0.5,
                        speed: 2, life: 1.0, size: 2,
                        colors: ['#ffd700', '#ff8800', '#ff4400'],
                        type: 'circle', gravity: -0.5, shrink: true,
                    });
                }
            }

            // Damage zone indicator (subtle)
            if (t >= 0.2 && t < 0.8) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.globalAlpha = 0.08;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fillStyle = '#ff4400';
                ctx.fill();
                ctx.globalAlpha = 0.2;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#ffd700';
                ctx.stroke();
                ctx.restore();
            }
        }
    }
};

export { Particle, ParticleSystem, VFX };
