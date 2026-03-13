import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine, GameMode } from './engine/GameEngine';
import { BuildingInstance, PlayerState, ShopState, TownInteractionMode, TownState } from './engine/types';
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
  const [townInteractionMode, setTownInteractionMode] = useState<TownInteractionMode>('preview');
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingInstance | null>(null);
  const [resourceCaps, setResourceCaps] = useState({ wood: 0, stone: 0, ore: 0 });
  const [showInventory, setShowInventory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showEscMenu, setShowEscMenu] = useState(false);
  const [pickupEvent, setPickupEvent] = useState<{ name: string; rarity: number; slot: string } | null>(null);
  const [arenaMode, setArenaMode] = useState(false);
  const [shopPhase, setShopPhase] = useState(false);
  const [shopTimer, setShopTimer] = useState(0);
  const [activeShop, setActiveShop] = useState<ShopState | null>(null);
  const [showShopPanel, setShowShopPanel] = useState(false);

  useEffect(() => {
    const engine = new GameEngine({
      onModeChange: (nextMode) => setMode(nextMode),
      onHUDUpdate: (nextPlayer, nextWave, arena, shopPh, shopTm) => {
        setPlayer({ ...nextPlayer });
        setWave(nextWave);
        setArenaMode(arena || false);
        setShopPhase(shopPh || false);
        setShopTimer(shopTm || 0);
      },
      onWaveAnnounce: (nextWave) => setAnnounceWave(nextWave),
      onPickup: (name, rarity, slot) => setPickupEvent({ name, rarity, slot }),
      onInventoryUpdate: (nextPlayer) => setPlayer({ ...nextPlayer }),
      onTownUpdate: (nextTown, caps) => {
        setTownState(nextTown);
        setResourceCaps({ ...caps });
        setSelectedBuilding((current) => nextTown.buildingInstances.find((instance) => instance.id === current?.id) ?? null);
      },
      onTownSelectionChange: (entityId) => {
        setSelectedBuilding(engine.getSelectedTownBuilding(entityId));
      },
      onShopOpen: (shop) => {
        setActiveShop(shop);
        setShowShopPanel(true);
      },
      onShopResult: (success, message) => {
        console.log('Shop result:', success, message);
      },
    });

    engine.initTownState();
    setTownState(engine.townState);
    setTownInteractionMode(engine.getTownInteractionMode());
    setSelectedBuilding(engine.getSelectedTownBuilding(null));
    setResourceCaps(engine.getResourceCaps());
    engineRef.current = engine;
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const townCanvas = townCanvasRef.current;
    const wrap = mapWrapRef.current;
    if (!engine || !townCanvas) return;
    let cancelled = false;

    (async () => {
      await engine.initTownCanvas(townCanvas);
      if (cancelled) return;
      const width = wrap?.clientWidth ?? 0;
      const height = wrap?.clientHeight ?? 0;
      if (width > 0 && height > 0 && engine.townRenderer) {
        townCanvas.width = width;
        townCanvas.height = height;
        engine.townRenderer.resize(width, height);
        engine.syncTownZoom();
      }
      if (!cancelled) engine.startLoop();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (mode === 'town' && townCanvasRef.current) {
      void engine.initTownCanvas(townCanvasRef.current);
      return;
    }
    if (mainCanvasRef.current) engine.initCanvas(mainCanvasRef.current);
  }, [mode]);

  useEffect(() => {
    const engine = engineRef.current;
    const mainCanvas = mainCanvasRef.current;
    if (!engine) return;

    let observer: ResizeObserver | null = null;
    const sizeTownCanvas = () => {
      if (!mapWrapRef.current || !townCanvasRef.current || !engine.townRenderer) return;
      const width = mapWrapRef.current.clientWidth;
      const height = mapWrapRef.current.clientHeight;
      if (width <= 0 || height <= 0) return;
      townCanvasRef.current.width = width;
      townCanvasRef.current.height = height;
      engine.townRenderer.resize(width, height);
      engine.syncTownZoom();
    };

    if (mode === 'town') {
      const raf = requestAnimationFrame(() => {
        sizeTownCanvas();
        observer = new ResizeObserver(sizeTownCanvas);
        if (mapWrapRef.current) observer.observe(mapWrapRef.current);
      });
      return () => {
        cancelAnimationFrame(raf);
        observer?.disconnect();
      };
    }

    if (mainCanvas && engine.renderer) {
      mainCanvas.width = window.innerWidth;
      mainCanvas.height = window.innerHeight;
      engine.renderer.resize();
    }
  }, [mode]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const onKeyDown = (event: KeyboardEvent) => {
      engine.handleKeyDown(event);
      setShowInventory(engine.inventoryOpen);
      setShowStats(engine.statsPanelOpen);
      setShowEscMenu(engine.escMenuOpen);
      setShowShopPanel(engine.shopPanelOpen);
    };

    const onResize = () => {
      if (modeRef.current === 'town' && mapWrapRef.current && townCanvasRef.current) {
        const width = mapWrapRef.current.clientWidth;
        const height = mapWrapRef.current.clientHeight;
        if (width > 0 && height > 0) {
          townCanvasRef.current.width = width;
          townCanvasRef.current.height = height;
          engine.townRenderer?.resize(width, height);
          engine.syncTownZoom();
        }
      } else if (mainCanvasRef.current) {
        mainCanvasRef.current.width = window.innerWidth;
        mainCanvasRef.current.height = window.innerHeight;
        engine.renderer?.resize();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => engine.handleKeyUp(event);
    const onMouseMove = (event: MouseEvent) => engine.handleMouseMove(event);
    const onMouseDown = (event: MouseEvent) => engine.handleMouseDown(event);
    const onMouseUp = (event: MouseEvent) => engine.handleMouseUp(event);
    const onWheel = (event: WheelEvent) => engine.handleWheel(event);
    const onContextMenu = (event: MouseEvent) => {
      if (engine.gameStarted && !(event.target as HTMLElement).closest?.('.ui-panel')) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  const handleSelectHero = useCallback((hero: string) => engineRef.current?.selectHero(hero), []);
  const handleStartAdventure = useCallback(() => engineRef.current?.startAdventure(), []);

  const handleUpgrade = useCallback((buildingId: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.upgradeBuilding(buildingId);
    setTownState(engine.townState);
    setSelectedBuilding(engine.getSelectedTownBuilding(engine.getSelectedTownBuildingId()));
    setResourceCaps(engine.getResourceCaps());
  }, []);

  const handleBackToTown = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.backToTown();
    setTownInteractionMode(engine.getTownInteractionMode());
    setSelectedBuilding(null);
    setShowEscMenu(false);
    engine.escMenuOpen = false;
  }, []);

  const handleStartTownEdit = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.beginTownEdit();
    setTownInteractionMode(engine.getTownInteractionMode());
    setSelectedBuilding(null);
    setTownState(engine.townState);
  }, []);

  const handleSaveTownEdit = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.commitTownEdit();
    setTownInteractionMode(engine.getTownInteractionMode());
    setSelectedBuilding(null);
    setTownState(engine.townState);
    setResourceCaps(engine.getResourceCaps());
  }, []);

  const handleCancelTownEdit = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.cancelTownEdit();
    setTownInteractionMode(engine.getTownInteractionMode());
    setSelectedBuilding(null);
    setTownState(engine.townState);
    setResourceCaps(engine.getResourceCaps());
  }, []);

  const townBonus = engineRef.current?.townBonus || { atkMult: 1, hpMult: 1, defMult: 1 };

  return (
    <>
      {mode === 'town' ? (
        <TownScreen
          mapWrapRef={mapWrapRef}
          townState={townState}
          interactionMode={townInteractionMode}
          resourceCaps={resourceCaps}
          selectedBuilding={selectedBuilding}
          onClearSelection={() => {
            engineRef.current?.clearTownSelection();
            setSelectedBuilding(null);
          }}
          onStartEdit={handleStartTownEdit}
          onSaveEdit={handleSaveTownEdit}
          onCancelEdit={handleCancelTownEdit}
          onStartAdventure={handleStartAdventure}
          onUpgrade={handleUpgrade}
          isBuildingInQueue={(buildingId) => engineRef.current?.isBuildingInQueue(buildingId) ?? false}
          hasEmptyBuildQueueSlot={() => engineRef.current?.hasEmptyBuildQueueSlot() ?? true}
          getUpgradeCost={(buildingId) => engineRef.current?.getUpgradeCost(buildingId) ?? { wood: 0, stone: 0, ore: 0, gold: 0 }}
        >
          <canvas ref={townCanvasRef} id="town" style={{ display: 'block', width: '100%', height: '100%' }} />
        </TownScreen>
      ) : (
        <canvas ref={mainCanvasRef} id="game" style={{ display: 'block' }} />
      )}

      {mode === 'start' && <StartScreen onSelectHero={handleSelectHero} />}

      {mode === 'run' && (
        <>
          <HUD player={player} wave={wave} townBonus={townBonus} arenaMode={arenaMode} shopPhase={shopPhase} shopTimer={shopTimer} />
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
              onBuy={(shopId, itemId) => engineRef.current?.network.sendShopBuy(shopId, itemId)}
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
