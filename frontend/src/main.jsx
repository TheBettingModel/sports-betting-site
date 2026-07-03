import "./styles/tbm-theme.css";
import "./styles/tbm-layout.css";
import "./styles/tbm-cards.css";
import "./styles/tbm-badges.css";
import "./styles/tbm-mobile.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
