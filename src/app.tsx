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
    <main className="flex flex-col p-8 w-full items-center justify-center">
      <h1 className="text-gray-200 text-3xl mb-6">Welcome to Spell Vision!!</h1>

      <div className="flex flex-col gap-4 mb-4 w-full max-w-md">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={isConnected}
            className="flex-1 px-3 py-2 rounded border border-gray-600 bg-gray-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <select
            value={peerId}
            onChange={(e) => setPeerId(e.target.value as 'caller' | 'callee')}
            disabled={isConnected}
            className="px-3 py-2 rounded border border-gray-600 bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="caller">Caller</option>
            <option value="callee">Callee</option>
          </select>
        </div>

        <div className="flex gap-2">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              Connect
            </button>
          ) : (
            <>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={sendTestData}
                className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
              >
                Send Test Data
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start flex-row w-full gap-4 justify-center">
        <HandRecogniser stream={handRecogniserStreamRef} />
        <RemoteFeed
          ref={remoteFeedRef}
          localStreamRef={handRecogniserStreamRef}
          peerId={peerId}
        />
      </div>
    </main>
  );
}

export default App;
