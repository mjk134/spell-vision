import Statbar from "./components/stat-bar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRef, useEffect, useState } from 'react';
import RemoteFeed from './components/remote-feed';
import type { RemoteFeedHandle } from './components/remote-feed';
import { toast } from 'sonner';
import HandRecogniser from "./components/gesture-rec.tsx";
import createId from "./lib/cuid.ts";




function App() {
  const remoteFeedRef = useRef<RemoteFeedHandle>(null);
  const handRecogniserStreamRef = useRef<MediaStream | null>(null);
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<'caller' | 'callee'>('caller');
  const [open, setOpen] = useState(true)
  // Is this redundant?
  const [joinCode, setJoinCode] = useState('')

  // HandRecogniser will manage its own webcam initialization
  useEffect(() => {
    if (remoteFeedRef.current) {
      remoteFeedRef.current.onDataReceived((data) => {
        console.log('Received data from peer:', data);
        toast.success(`Received: ${JSON.stringify(data)}`);
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
    if (!handRecogniserStreamRef.current) {
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
      <p className="font-mono text-gray-600 text-xs">Room code: {roomId}</p>
      <div className="relative p-8 flex items-center flex-col h-[90vh] w-full gap-2 margin-20">
        {/* Dashed border with custom dashes */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="1" y="1" width="98" height="98" fill="none" className="stroke-gray-400 [stroke-width:0.1] [stroke-dasharray:2.5_1]" />
        </svg>
        <div className="flex items-center max-h-full justify-between flex-row w-full">
          <div className="flex flex-col w-[40%] h-full max-h-full gap-10">
            {/* Local Player stream*/}
            {/* <div className="bg-gray-300 h-[28vmin]" /> */}
            <HandRecogniser stream={handRecogniserStreamRef} />
            {/* Local Player HP */}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={50} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">HP 100</p>
            </div>
            {/* local Player MP/*/}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={50} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">MP 50</p>
            </div>
          </div>
          <h1 className="font-display text-gray-200">VS</h1>
          <div className="flex flex-col w-[40%] h-full max-h-full gap-10">
            {/* Remote video stream */}
            {/* <div className="bg-gray-300 h-[28vmin]" /> */}
            <RemoteFeed
              ref={remoteFeedRef}
              localStreamRef={handRecogniserStreamRef}
              peerId={peerId}
            />
            {/* Player HP for remote */}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={50} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">HP 100</p>
            </div>
            {/* Player MP for remote */}
            <div className="flex flex-row items-center justify-between gap-4 text-gray-200 w-full h-[4vh]">
              <Statbar progress={50} totalProgress={100} />
              <p className="font-mono text-2xl w-[40%]">MP 50</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default App

