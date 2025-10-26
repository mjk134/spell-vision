import Statbar from "./components/stat-bar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {useRef, useEffect, useState} from 'react';
import RemoteFeed from './components/remote-feed';
import type { RemoteFeedHandle } from './components/remote-feed';
import { toast } from 'sonner';
import HandRecogniser, {type Gesture, GESTURES} from "./components/gesture-rec.tsx";
import createId from "./lib/cuid.ts";
import { Game, type SpellKind } from "./lib/game.ts";
import { cn } from "./lib/utils.ts";

function App() {
  const remoteFeedRef = useRef<RemoteFeedHandle>(null);
  const handRecogniserCanvasStreamRef = useRef<MediaStream | null>(null);
  const handRecogniserVideoStreamRef = useRef<MediaStream | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<'caller' | 'callee'>('caller');
  const [open, setOpen] = useState(true)
  // Is this redundant?
  const [joinCode, setJoinCode] = useState('')
  const [gestures, setGestures] = useState<Gesture[]>([GESTURES.none]);
  const [health, setHealth] = useState(100);
  const [mana, setMana] = useState(100);
  const [opponentHealth, setOpponentHealth] = useState(100);
  const lastGestureRef = useRef<Gesture>(GESTURES.none);

  // Initialize game instance
  useEffect(() => {
    gameRef.current = new Game();

    // Set up callback for when we cast a spell
    gameRef.current.onSpellCast((spell: SpellKind) => {
      console.log('Spell cast:', spell);
      toast.success(`Cast spell: ${spell}`);

      // Send spell to opponent via data channel
      if (remoteFeedRef.current) {
        remoteFeedRef.current.sendData({
          type: 'spell',
          spell: spell,
          timestamp: Date.now()
        });
      }
    });

    // Set up callback for health changes
    gameRef.current.onHealthChange((newHealth: number) => {
      setHealth(newHealth);

      // Send health update to opponent
      if (remoteFeedRef.current) {
        remoteFeedRef.current.sendData({
          type: 'healthUpdate',
          health: newHealth,
          timestamp: Date.now()
        });
      }
    });

    //Set up callback for mana changes
    gameRef.current.onManaChange((newMana: number) => {
      setMana(newMana)

      if (remoteFeedRef.current) {
        remoteFeedRef.current.sendData({
          type: 'manaUpdate',
          mana: newMana,
          timestamp: Date.now()
        })
      }
    })

    // Set up callback for losing
    gameRef.current.onLose(() => {
      toast.error('You lost!');
    });
  }, []);

  // Process gestures through game state
  useEffect(() => {
    if (!gameRef.current || gestures.length === 0) return;

    const currentGesture = gestures[0];

    // Only process if gesture changed and is not 'none'
    if (currentGesture !== lastGestureRef.current && currentGesture !== GESTURES.none) {
      console.log('Processing gesture:', currentGesture);
      gameRef.current.processGesture(currentGesture);
      lastGestureRef.current = currentGesture;
    } else if (currentGesture === GESTURES.none) {
      lastGestureRef.current = GESTURES.none;
    }
  }, [gestures]);

  // HandRecogniser will manage its own webcam initialization
  useEffect(() => {
    if (remoteFeedRef.current) {
      remoteFeedRef.current.onDataReceived((data) => {
        console.log('Received data from peer:', data);

        // Handle incoming spell from opponent
        if (typeof data === 'object' && data !== null && 'type' in data) {
          if (data.type === 'spell' && 'spell' in data) {
            const spell = data.spell as SpellKind;
            toast.info(`Opponent cast spell: ${spell}`);

            if (gameRef.current) {
              gameRef.current.opponentCastSpell(spell);
            }
          } else if (data.type === 'healthUpdate' && 'health' in data) {
            // Update opponent's health display
            const health = data.health as number;
            setOpponentHealth(health);
          }
        } else {
          toast.success(`Received: ${JSON.stringify(data)}`);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      setOpen(false)
    } else {
      setOpen(true)
    }
  }, [isConnected])

  const handleConnect = (connectRoomId?: string, connectPeerId?: 'caller' | 'callee') => {
    const roomToConnect = connectRoomId || roomId;
    const peerToUse = connectPeerId || peerId;

    if (!roomToConnect.trim()) {
      toast.error('Please enter a room ID');
      return;
    }
    if (!handRecogniserCanvasStreamRef.current) {
      toast.error('Please wait for gesture recognition to initialize');
      return;
    }

    // Update state for UI
    setRoomId(roomToConnect);
    setPeerId(peerToUse);

    remoteFeedRef.current?.connect(roomToConnect, peerToUse);
    setIsConnected(true);
    toast.success('Connecting to room...');
  };

  const handleDisconnect = () => {
    remoteFeedRef.current?.disconnect();
    setIsConnected(false);
    toast.success('Disconnected from room');
  };

  const handleJoin = () => {
    if (!joinCode) {
      toast.error("Failed to join room.")
      return;
    }

    handleConnect(joinCode, 'callee');
  }

  // @ts-expect-error - Utility function for testing data channel
  const sendTestData = () => {
    const state = remoteFeedRef.current?.getDataChannelState();
    if (state !== 'open') {
      toast.error(`Data channel is not open (state: ${state})`);
      return;
    }

    const testData = {
      type: 'test',
      message: 'Hello from ' + peerId,
      timestamp: Date.now()
    };

    remoteFeedRef.current?.sendData(testData);
    toast.info('Sent: ' + JSON.stringify(testData));
  };

  return (
    <main className="flex flex-col max-w-[1000px] padding-20 w-full items-center justify-center">
      <Dialog open={open}>
        <DialogContent showCloseButton={false} className="sm:max-w-[600px] p-5 rounded-none text-gray-200">
          <div className="p-8">
            <DialogHeader>
              <DialogTitle className="font-mono text-4xl">Welcome to <span className="font-display">Spell Vision</span></DialogTitle>
              <DialogDescription className="font-mono">
                The ultimate game for sign language users.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5 mt-4">
              <button className="bg-gray-200 text-gray-900 font-mono py-3 text-xl cursor-pointer" onClick={() => {
                const id = createId()
                handleConnect(id, 'caller')
              }}>
                Create Game
              </button>
              <input 
                maxLength={10} 
                className="border-2 border-gray-200 placeholder:text-gray-400 font-mono p-3" 
                placeholder="Enter Code" 
                onChange={(e) => setJoinCode(e.target.value)}
                value={joinCode}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleJoin()
                  }
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <h1 className="text-gray-200 text-6xl">Spell Vision</h1>
      <p className="font-mono text-gray-200">Created by: username, username & username</p>
      <div className="flex flex-row items-center gap-2">
        <p className="font-mono text-gray-600 text-xs">Room code: {roomId}</p>
      </div>
      <div className="relative p-8 flex items-center flex-col h-[90vh] w-full gap-2 margin-20">
        {/* Dashed border with custom dashes */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="1" y="1" width="98" height="98" fill="none" className="stroke-gray-400 [stroke-width:0.1] [stroke-dasharray:2.5_1]" />
        </svg>
        <div className="flex items-center max-h-full justify-between flex-row w-full">
          <div className="flex flex-col w-[40%] h-full max-h-full gap-10">
            {/* Local Player stream*/}
            {/* <div className="bg-gray-300 h-[28vmin]" /> */}
            <HandRecogniser canvasStream={handRecogniserCanvasStreamRef} videoStream={handRecogniserVideoStreamRef} setGestures={setGestures}/>
            {/* Local Player HP */}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={health} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">HP {health}</p>
            </div>
            {/* local Player MP/*/}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={mana} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">MP {mana}</p>
            </div>
          </div>
          <h1 className="font-display text-gray-200">VS</h1>
          <div className="flex flex-col w-[40%] h-full max-h-full gap-10">
            {/* Remote video stream */}
            {/* <div className="bg-gray-300 h-[28vmin]" /> */}
            <RemoteFeed
              ref={remoteFeedRef}
              webcamStreamRef={handRecogniserVideoStreamRef}
              peerId={peerId}
              gestures={gestures}
            />
            {/* Player HP for remote */}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={opponentHealth} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">HP {opponentHealth}</p>
            </div>
            {/* Player MP for remote */}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={50} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">MP 50</p>
            </div>
          </div>
        </div>
        <h2 className="font-mono text-2xl">Your Gestures</h2>
        <div className="grid grid-cols-2 w-full h-full">
         <div className="flex flex-row gap-2 items-center h-[30%]">
          {gameRef.current?.targetFireSequence.map((g, i) => {
              return (
                <div className={cn(g === lastGestureRef.current ? 'bg-amber-200' : '')}>
                  <img key={i} src={`${g}.svg`} />
                </div>
              )
            })}
            <span className="font-mono text-6xl pl-4 text-gray-200">→ 🔥</span>
         </div>
         <div className="flex flex-row gap-2 items-center h-[30%]">
          {gameRef.current?.targetWaterSequence.map((g, i) => {
              return (
                <div className={cn(g === lastGestureRef.current ? 'bg-amber-200' : '')}>
                  <img key={i} src={`${g}.svg`} />
                </div>
              )
            })}
            <span className="font-mono text-6xl pl-4 text-gray-200">→ 💧</span>
         </div>
         <div className="flex flex-row gap-2 items-center h-[30%]">
          {gameRef.current?.targetPlantSequence.map((g, i) => {
              return (
                <div className={cn(g === lastGestureRef.current ? 'bg-amber-200' : '')}>
                  <img key={i} src={`${g}.svg`} />
                </div>
              )
            })}
            <span className="font-mono text-6xl pl-4 text-gray-200">→ 🌱</span>
         </div>
         <div className="relative text-gray-200 font-mono text-2xl flex flex-row gap-2 justify-center">
          Gesture:
          <div className="">
            {lastGestureRef.current == GESTURES.none ? 'No gesture' : <img src={`${lastGestureRef.current}.svg`} />}
          </div>
         </div>
        <div className="col-span-2 flex items-center justify-center">{isConnected && (<button onClick={() => handleDisconnect()} className="text-gray-600 p-5 bg-gray-200">Disconnect</button>)}</div>
        </div>
      </div>
    </main>
  )
}

export default App

