import { Route, Routes } from "react-router-dom";
import Home from "@/pages/Home";
import Room from "@/pages/Room";
import Library from "@/pages/Library";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/library" element={<Library />} />
      <Route path="/room/:roomId" element={<Room />} />
    </Routes>
  );
}
