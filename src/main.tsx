import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./sim/gateway"; // wires nginx routes and the auto-kitchen requester
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
