import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine, GameMode } from './engine/GameEngine';
import { PlayerState, TownState, ShopState } from './engine/types';
import StartScreen from './components/StartScreen';
import TownScreen from './components/TownScreen';
import HUD from './components/HUD';
import SkillBar from './components/SkillBar';
import InventoryPanel from './components/InventoryPanel';
import StatsPanel from './components/StatsPanel';
import EscMenu from './components/EscMenu';
import WaveAnnounce from './components/WaveAnnounce';
import PickupNotifs from './components/PickupNotifs';
import ShopPanel from './components/ShopPanel';

function App() {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const townCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const modeRef = useRef<GameMode>('town');

  const [mode, setMode] = useState<GameMode>('town');
  modeRef.current = mode;
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [wave, setWave] = useState(0);
  const [announceWave, setAnnounceWave] = useState(0);
  const [townState, setTownState] = useState<TownState | null>(null);
  const [resourceCaps, setResourceCaps] = useState({ wood: 0, stone: 0, ore: 0 });
  const [selectedBuildingKey, setSelectedBuildingKey] = useState<string | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showEscMenu, setShowEscMenu] = useState(false);
  const [pickupEvent, setPickupEvent] = useState<{ name: string; rarity: number; slot: string } | null>(null);
  const pickupCounter = useRef(0);

  // Arena mode state
  const [arenaMode, setArenaMode] = useState(false);
  const [shopPhase, setShopPhase] = useState(false);
  const [shopTimer, setShopTimer] = useState(0);
  const [activeShop, setActiveShop] = useState<ShopState | null>(null);
  const [showShopPanel, setShowShopPanel] = useState(false);

  // Initialize engine once
  useEffect(() => {
    const engine = new GameEngine({
      onModeChange: (m) => setMode(m),
      onHUDUpdate: (p, w, arena, shopPh, shopTm) => {
        setPlayer({ ...p });
        setWave(w);
        setArenaMode(arena || false);
        setShopPhase(shopPh || false);
        setShopTimer(shopTm || 0);
      },
      onWaveAnnounce: (w) => setAnnounceWave(w),
      onPickup: (name, rarity, slot) => {
        pickupCounter.current++;
        setPickupEvent({ name, rarity, slot });
      },
      onInventoryUpdate: (p) => setPlayer({ ...p }),
      onTownUpdate: (t, caps) => {
        setTownState({ ...t });
        setResourceCaps({ ...caps });
      },
      onTownSelectionChange: (key) => setSelectedBuildingKey(key),
      onShopOpen: (shop) => {
        setActiveShop(shop);
        setShowShopPanel(true);
      },
      onShopResult: (success, message) => {
        // Could show a toast notification here
        console.log('Shop result:', success, message);
      },
    });

    engine.initTownState();
    setTownState(engine.townState ? { ...engine.townState } : null);
    setResourceCaps(engine.getResourceCaps());

    engineRef.current = engine;
  }, []);

  // Initialize canvas and start loop once (Pixi 城镇需 await init 完成)
  useEffect(() => {
    const engine = engineRef.current;
    const townCanvas = townCanvasRef.current;
    const wrap = mapWrapRef.current;
    if (!engine || !townCanvas) return;
    let cancelled = false;
    (async () => {
      await engine.initTownCanvas(townCanvas);
      if (cancelled) return;
      // 确保首帧前就有尺寸，否则 Pixi 会画到 0x0 看不到
      const w = wrap?.clientWidth ?? 0;
      const h = wrap?.clientHeight ?? 0;
      if (w > 0 && h > 0 && engine.townRenderer) {
        townCanvas.width = w;
        townCanvas.height = h;
        engine.townRenderer.resize(w, h);
      }
      if (!cancelled) engine.startLoop();
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-attach canvas when switching mode (town uses Pixi canvas; run/start use main canvas)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (mode === 'town') {
      const canvas = townCanvasRef.current;
      if (canvas) void engine.initTownCanvas(canvas);
    } else {
      if (mainCanvasRef.current) engine.initCanvas(mainCanvasRef.current);
    }
  }, [mode]);

  // Town mode: size town canvas to map container; run mode: fullscreen for main canvas
  useEffect(() => {
    const engine = engineRef.current;
    const mainCanvas = mainCanvasRef.current;
    if (!engine) return;
    let ro: ResizeObserver | null = null;
    const sizeTownCanvas = () => {
      if (!mapWrapRef.current || !townCanvasRef.current) return;
      const w = mapWrapRef.current.clientWidth;
      const h = mapWrapRef.current.clientHeight;
      if (w > 0 && h > 0 && engineRef.current?.townRenderer) {
        townCanvasRef.current.width = w;
        townCanvasRef.current.height = h;
        engineRef.current.townRenderer.resize(w, h);
        engineRef.current.syncTownZoom();
      }
    };
    if (mode === 'town') {
      const raf = requestAnimationFrame(() => {
        sizeTownCanvas();
        ro = new ResizeObserver(sizeTownCanvas);
        if (mapWrapRef.current) ro.observe(mapWrapRef.current);
      });
      return () => {
        cancelAnimationFrame(raf);
        ro?.disconnect();
      };
    } else {
      if (!engine.renderer || !mainCanvas) return;
      mainCanvas.width = window.innerWidth;
      mainCanvas.height = window.innerHeight;
      (engine.renderer as { resize: (w?: number, h?: number) => void }).resize();
    }
  }, [mode]);

  // Global event listeners
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const onKeyDown = (e: KeyboardEvent) => {
      engine.handleKeyDown(e);
      setShowInventory(engine.inventoryOpen);
      setShowStats(engine.statsPanelOpen);
      setShowEscMenu(engine.escMenuOpen);
      setShowShopPanel(engine.shopPanelOpen);
    };
    const onKeyUp = (e: KeyboardEvent) => engine.handleKeyUp(e);
    const onMouseMove = (e: MouseEvent) => engine.handleMouseMove(e);
    const onMouseDown = (e: MouseEvent) => engine.handleMouseDown(e);
    const onMouseUp = (e: MouseEvent) => engine.handleMouseUp(e);
    const onContextMenu = (e: MouseEvent) => {
      if (engine.gameStarted && !(e.target as HTMLElement).closest?.('.ui-panel')) {
        e.preventDefault();
      }
    };
    const onResize = () => {
      if (modeRef.current === 'town' && mapWrapRef.current && townCanvasRef.current) {
        const w = mapWrapRef.current.clientWidth;
        const h = mapWrapRef.current.clientHeight;
        if (w > 0 && h > 0) {
          townCanvasRef.current.width = w;
          townCanvasRef.current.height = h;
          engine.townRenderer?.resize(w, h);
          engine.syncTownZoom();
        }
      } else {
        const c = mainCanvasRef.current;
        if (c) {
          c.width = window.innerWidth;
          c.height = window.innerHeight;
        }
        engine.renderer?.resize();
      }
    };
    const onWheel = (e: WheelEvent) => {
      engine.handleWheel(e);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleSelectHero = useCallback((hero: string) => {
    engineRef.current?.selectHero(hero);
  }, []);

  const handleStartAdventure = useCallback(() => {
    engineRef.current?.startAdventure();
  }, []);

  const handleUpgrade = useCallback((type: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.upgradeBuilding(type);
    setTownState(engine.townState ? { ...engine.townState } : null);
    setResourceCaps(engine.getResourceCaps());
  }, []);

  const handleBackToTown = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.backToTown();
    setShowEscMenu(false);
    engine.escMenuOpen = false;
  }, []);

  const townBonus = engineRef.current?.townBonus || { atkMult: 1, hpMult: 1, defMult: 1 };

  return (
    <>
      {mode === 'town' ? (
        <TownScreen
          mapWrapRef={mapWrapRef}
          townState={townState}
          resourceCaps={resourceCaps}
          selectedBuildingKey={selectedBuildingKey}
          onClearSelection={() => engineRef.current?.clearTownSelection()}
          onStartAdventure={handleStartAdventure}
          onUpgrade={handleUpgrade}
          isBuildingInQueue={(type) => engineRef.current?.isBuildingInQueue?.(type) ?? false}
          hasEmptyBuildQueueSlot={() => engineRef.current?.hasEmptyBuildQueueSlot?.() ?? true}
          getUpgradeCost={(type) => engineRef.current?.getUpgradeCost?.(type) ?? { wood: 0, stone: 0, ore: 0, gold: 0 }}
        >
          <canvas ref={townCanvasRef} id="town" style={{ display: 'block', width: '100%', height: '100%' }} />
        </TownScreen>
      ) : (
        <canvas ref={mainCanvasRef} id="game" style={{ display: 'block' }} />
      )}

      {mode === 'start' && (
        <StartScreen onSelectHero={handleSelectHero} />
      )}

      {mode === 'run' && (
        <>
          <HUD
            player={player}
            wave={wave}
            townBonus={townBonus}
            arenaMode={arenaMode}
            shopPhase={shopPhase}
            shopTimer={shopTimer}
          />
          <SkillBar player={player} />
          <WaveAnnounce wave={announceWave} />
          <PickupNotifs pickupEvent={pickupEvent} />

          {showInventory && engineRef.current && (
            <InventoryPanel
              player={player}
              network={engineRef.current.network}
              onClose={() => {
                setShowInventory(false);
                if (engineRef.current) engineRef.current.inventoryOpen = false;
              }}
            />
          )}

          {showStats && (
            <StatsPanel
              player={player}
              townBonus={townBonus}
              onClose={() => {
                setShowStats(false);
                if (engineRef.current) engineRef.current.statsPanelOpen = false;
              }}
            />
          )}

          {showEscMenu && (
            <EscMenu
              onClose={() => {
                setShowEscMenu(false);
                if (engineRef.current) engineRef.current.escMenuOpen = false;
              }}
              onOpenStats={() => {
                setShowStats(true);
                if (engineRef.current) engineRef.current.statsPanelOpen = true;
              }}
              onOpenInventory={() => {
                setShowInventory(true);
                if (engineRef.current) engineRef.current.inventoryOpen = true;
              }}
              onBackToTown={handleBackToTown}
            />
          )}

          {showShopPanel && activeShop && (
            <ShopPanel
              shop={activeShop}
              playerGold={player?.gold || 0}
              onBuy={(shopId, itemId) => {
                engineRef.current?.network.sendShopBuy(shopId, itemId);
              }}
              onClose={() => {
                setShowShopPanel(false);
                setActiveShop(null);
                if (engineRef.current) engineRef.current.shopPanelOpen = false;
              }}
            />
          )}
        </>
      )}
    </>
  );
}

export default App;
