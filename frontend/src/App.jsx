import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import TopBar from "./components/shell/TopBar";
import Sidebar from "./components/shell/Sidebar";
import StatusBar from "./components/shell/StatusBar";
import CommandPalette from "./components/shell/CommandPalette";
import Tour from "./components/shell/Tour";
import ErrorBoundary from "./components/ErrorBoundary";
import { prefetchAllCoreData } from "./utils/apiCache";
import { titleForPath } from "./navigation";
import './index.css';

// Eagerly loaded core pages for instant, lag-free navigation
import Home from "./pages/Home";
import Stocks from "./pages/Stocks";
import Models from "./pages/Models";
import UnifiedScreener from "./pages/UnifiedScreener";
import TechnicalScreener from "./pages/TechnicalScreener";
import Portfolio from "./pages/Portfolio";
import AlphaInsights from "./pages/AlphaInsights";
import Brokerages from "./pages/Brokerages";
import ResearchReports from "./pages/ResearchReports";
import ViopScreener from "./pages/ViopScreener";
import Discovery from "./pages/Discovery";
import Analytics from "./pages/Analytics";
import Industries from "./pages/Industries";
import Compare from "./pages/Compare";
import Macro from "./pages/Macro";
import Backtest from "./pages/Backtest";
import Strategies from "./pages/Strategies";
import Copilot from "./pages/Copilot";
import Studio from "./pages/Studio";
import NotFound from "./pages/NotFound";

// Only dynamic parameter pages are lazily loaded
const StockDetail = React.lazy(() => import("./pages/StockDetail"));
const BrokerageDetail = React.lazy(() => import("./pages/BrokerageDetail"));

const PageLoader = () => null; // Seamless transitions without jarring loading screens

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
  return null;
}

function Shell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Ctrl/⌘+K is reserved for global search only.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="terminal-container">
      <DocumentTitle />
      <TopBar onOpenSearch={() => setSearchOpen(true)} />

      <div className="app-container">
        <Sidebar />

        <main className="main-content">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/discovery" element={<Discovery />} />
                <Route path="/stocks" element={<Stocks />} />
                <Route path="/screener" element={<UnifiedScreener />} />
                <Route path="/technical-screener" element={<TechnicalScreener />} />
                <Route path="/teknik-radar" element={<TechnicalScreener />} />
                <Route path="/alpha" element={<AlphaInsights />} />
                <Route path="/viop" element={<ViopScreener />} />
                <Route path="/reports" element={<ResearchReports />} />
                <Route path="/brokerages" element={<Brokerages />} />
                <Route path="/models" element={<Models />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/industries" element={<Industries />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/macro" element={<Macro />} />
                <Route path="/backtest" element={<Backtest />} />
                <Route path="/strategies" element={<Strategies />} />
                <Route path="/copilot" element={<Copilot />} />
                <Route path="/studio" element={<Studio />} />
                <Route path="/hisse/:ticker" element={<StockDetail />} />
                <Route path="/kurum/:kurumName" element={<BrokerageDetail />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <StatusBar />
      <CommandPalette open={searchOpen} onClose={closeSearch} />
      <Tour />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    prefetchAllCoreData();
  }, []);

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
