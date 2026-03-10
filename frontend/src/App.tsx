import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine, GameMode } from './engine/GameEngine';
import { PlayerState, TownState } from './engine/types';
import StartScreen from './components/StartScreen';
import TownScreen from './components/TownScreen';
import HUD from './components/HUD';
import SkillBar from './components/SkillBar';
import InventoryPanel from './components/InventoryPanel';
import StatsPanel from './components/StatsPanel';
import EscMenu from './components/EscMenu';
import WaveAnnounce from './components/WaveAnnounce';
import PickupNotifs from './components/PickupNotifs';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [mode, setMode] = useState<GameMode>('town');
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [wave, setWave] = useState(0);
  const [announceWave, setAnnounceWave] = useState(0);
  const [townState, setTownState] = useState<TownState | null>(null);
  const [resourceCaps, setResourceCaps] = useState({ wood: 0, stone: 0, ore: 0 });
  const [showInventory, setShowInventory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showEscMenu, setShowEscMenu] = useState(false);
  const [pickupEvent, setPickupEvent] = useState<{ name: string; rarity: number; slot: string } | null>(null);
  const pickupCounter = useRef(0);

  // Initialize engine once
  useEffect(() => {
    const engine = new GameEngine({
      onModeChange: (m) => setMode(m),
      onHUDUpdate: (p, w) => {
        setPlayer({ ...p });
        setWave(w);
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
    });

    engine.initTownState();
    setTownState(engine.townState ? { ...engine.townState } : null);
    setResourceCaps(engine.getResourceCaps());

    engineRef.current = engine;
  }, []);

  // Initialize canvas
  useEffect(() => {
    const engine = engineRef.current;
    if (engine && canvasRef.current) {
      engine.initCanvas(canvasRef.current);
      engine.startLoop();
    }
  }, []);

  // Global event listeners
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const onKeyDown = (e: KeyboardEvent) => {
      engine.handleKeyDown(e);
      setShowInventory(engine.inventoryOpen);
      setShowStats(engine.statsPanelOpen);
      setShowEscMenu(engine.escMenuOpen);
    };
    const onKeyUp = (e: KeyboardEvent) => engine.handleKeyUp(e);
    const onMouseMove = (e: MouseEvent) => engine.handleMouseMove(e);
    const onMouseDown = (e: MouseEvent) => engine.handleMouseDown(e);
    const onContextMenu = (e: MouseEvent) => {
      if (engine.gameStarted && !(e.target as HTMLElement).closest?.('.ui-panel')) {
        e.preventDefault();
      }
    };
    const onResize = () => engine.renderer?.resize();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
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
      <canvas ref={canvasRef} id="game" style={{ display: 'block' }} />

      {mode === 'town' && (
        <TownScreen
          townState={townState}
          resourceCaps={resourceCaps}
          onStartAdventure={handleStartAdventure}
          onUpgrade={handleUpgrade}
        />
      )}

      {mode === 'start' && (
        <StartScreen onSelectHero={handleSelectHero} />
      )}

      {mode === 'run' && (
        <>
          <HUD player={player} wave={wave} townBonus={townBonus} />
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
        </>
      )}
    </>
  );
}

export default App;
