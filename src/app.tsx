import WebcamFeed from "./components/webcam-feed"

function App() {
  return (
    <main className="flex flex-col padding-20 w-full items-center justify-center">
      <h1 className="font-black text-3xl">Welcome to Spell Vision!!</h1>
      <div className="flex items-center flex-row h-screen w-full gap-2">
        {/* Implement the video feeds here */}
        <WebcamFeed />
      </div>
    </main>
  )
}

export default App
