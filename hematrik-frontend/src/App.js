import React from "react";
import "./App.css";
import { BrowserRouter } from "react-router-dom";
import AppRouter from "./AppRouter";
import { HematrikDataProvider } from "./data/HematrikDataContext";

export default function App() {
  const enablePolling = process.env.NODE_ENV !== "test";

  return (
    <BrowserRouter>
      <HematrikDataProvider enabled={enablePolling} pollMs={3000}>
        <AppRouter />
      </HematrikDataProvider>
    </BrowserRouter>
  );
}