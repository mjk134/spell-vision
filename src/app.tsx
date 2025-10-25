import Statbar from "./components/stat-bar"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useRef, useEffect, useState } from 'react';
import RemoteFeed from './components/remote-feed';
import type { RemoteFeedHandle } from './components/remote-feed';
import { toast } from 'sonner';
import HandRecogniser from "./components/gesture-rec.tsx";




function App() {
  const remoteFeedRef = useRef<RemoteFeedHandle>(null);
  const handRecogniserStreamRef = useRef<MediaStream | null>(null);
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<'caller' | 'callee'>('caller');

  // HandRecogniser will manage its own webcam initialization
  useEffect(() => {
    if (remoteFeedRef.current) {
      remoteFeedRef.current.onDataReceived((data) => {
        console.log('Received data from peer:', data);
        toast.success(`Received: ${JSON.stringify(data)}`);
      });
    }
  }, []);

  const handleConnect = () => {
    if (!roomId.trim()) {
      toast.error('Please enter a room ID');
      return;
    }
    if (!handRecogniserStreamRef.current) {
      toast.error('Please wait for gesture recognition to initialize');
      return;
    }

    remoteFeedRef.current?.connect(roomId);
    setIsConnected(true);
    toast.success('Connecting to room...');
  };

  const handleDisconnect = () => {
    remoteFeedRef.current?.disconnect();
    setIsConnected(false);
    toast.success('Disconnected from room');
  };

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
          <Dialog>
      <form>
        <DialogTrigger asChild>
          <button>Open Dialog</button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Make changes to your profile here. Click save when you&apos;re
              done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3">

            </div>
            <div className="grid gap-3">

            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button>Cancel</button>
            </DialogClose>
            <button type="submit">Save changes</button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
      
      <h1 className="text-gray-200 text-6xl">Spell Vision</h1>
      <p className="font-mono text-gray-200">Created by: username, username & username</p>
      <div className="relative p-8 flex items-center flex-col h-[90vh] w-full gap-2 margin-20">
        {/* Dashed border with custom dashes */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="1" y="1" width="98" height="98" fill="none" className="stroke-gray-400 [stroke-width:0.1] [stroke-dasharray:2.5_1]" />
        </svg>
        <div className="flex items-center max-h-full justify-between flex-row w-full">
          <div className="flex flex-col w-[40%] h-full max-h-full gap-10">
            {/* Local Player stream*/}
            <div className="bg-gray-300 h-[28vmin]" />
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
            <div className="bg-gray-300 h-[28vmin]" />
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

