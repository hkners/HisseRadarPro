# HisseRadarPro Frontend Architecture & Research Reports UI Integration Analysis

**Author:** `teamwork_preview_explorer_m1_2`  
**Date:** 2026-08-03  
**Target Application:** `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\frontend`

---

## 1. Technical Stack & Build Configuration

### 1.1 Core Tooling & Dependencies (`package.json`, `vite.config.js`)
- **Framework:** React `v19.2.8` (`react`, `react-dom`)
- **Routing:** React Router DOM `v7.18.2` (`react-router-dom`)
- **Data Visualization:** Recharts `v3.10.1` (`recharts`)
- **Build System:** Vite `v8.2.0` (`@vitejs/plugin-react`)
- **Linting:** Oxlint `v1.75.0` (`oxlint`)
- **CSS / UI Libraries:** 
  - **No external CSS frameworks** (Tailwind CSS, Material UI, Bootstrap, etc. are **not installed**).
  - **No external icon libraries** (Lucide / Lucide React are **not installed**).
  - Styling is entirely custom CSS defined in `src/index.css` and `src/App.css`.

### 1.2 Design Language & Styling System
The application implements a custom retro **Bloomberg / Financial Cyber Terminal** theme:
- **Font:** Google Font `'Roboto Mono', monospace`
- **Color Palette:**
  - Background Primary: `#000000` (Pure Black)
  - Background Secondary: `#0a0a0a` / `#1a1a1a` (Dark Gray panels/headers)
  - Hover Background: `#1c1c1c`
  - Text Main: `#e0e0e0`
  - Text Muted: `#888888`
  - Text Highlight / Warnings: `#ffcc00` (Amber / Yellow)
  - Color Up (Bullish): `#00ff00` (Neon Green)
  - Color Down (Bearish): `#ff3333` (Bright Red)
  - Color Neutral / Cyan: `#00e5ff`
- **Re-usable CSS Classes:**
  - `.panel` & `.panel-header`: Bordered terminal containers with uppercase headers.
  - `.data-table`: Terminal data grids with right-aligned numeric data, hoverable rows (`.row-hoverable`), and left-aligned first columns.
  - `.ticker-link`: High-contrast link styling for stock tickers and brokerages.
  - `.search-box`: Black input field with terminal border and yellow outline on focus.
  - `.btn-read`: Minimalist bracketed buttons (`[+] READ`, `[-] CLOSE`).
  - `.accordion-row` & `.accordion-content`: Sub-table expandable panels for full report text display.

### 1.3 State Management & API Layer
- **State Management:** Local React component state (`useState`, `useEffect`, `useMemo`). There is currently no global state library (Redux, Zustand) or server-state manager (TanStack Query).
- **API Requests:** Native `fetch()` calls directly inside component `useEffect()` hooks, targeting `http://localhost:8012/api/*` backend endpoints.
- **Service Layer:** Currently non-existent. API endpoint strings are hardcoded in individual page components (`Home.jsx`, `Stocks.jsx`, `StockDetail.jsx`, `BrokerageDetail.jsx`, `Screener.jsx`, `Models.jsx`).

---

## 2. Codebase Structure & Existing Views

### 2.1 Directory Map (`src/`)
```
src/
├── App.css               # Legacy Vite CSS + utility classes
├── App.jsx               # Terminal Layout (Sidebar + Header + React Router Routes)
├── index.css             # Main Terminal Design System (Variables, Tables, Panels, Heatmaps)
├── main.jsx              # Application entry point
├── assets/               # Images and SVG icons
├── data/                 # Local mock datasets (hisseData.json, modelData.json)
└── pages/                # Page components mapped to routes
    ├── Home.jsx           # Terminal Dashboard (Top Recommendations + Broker Directory Summary)
    ├── Stocks.jsx         # BIST Index Tracker (Symbol search & list)
    ├── StockDetail.jsx    # 4-Panel Stock Analysis Dashboard
    ├── Brokerages.jsx     # Brokerage Directory
    ├── BrokerageDetail.jsx# Single Brokerage Report History
    ├── Screener.jsx       # Consensus Screener (Multi-report aggregated upside)
    ├── Models.jsx         # Model Portfolios Grid & Image Modal Lightbox
    └── Portfolio.jsx      # Placeholder ("Coming Soon")
```

### 2.2 Navigation & Routing Map
| Route | Component | Description | Current Features |
|---|---|---|---|
| `/` | `Home.jsx` | Dashboard | Top Recommendations alert table & Brokerage stats overview |
| `/stocks` | `Stocks.jsx` | BIST Stock List | Live symbol search bar, live price display, link to stock detail |
| `/screener` | `Screener.jsx` | Consensus Screener | Multi-report aggregated consensus target, upside potential sorting |
| `/brokerages` | `Brokerages.jsx` | Broker Directory | Broker list, total reports count, average claimed upside potential |
| `/models` | `Models.jsx` | Model Portfolios | Portfolio cards, lightbox modal showing report infographics |
| `/portfolio` | `Portfolio.jsx` | User Portfolio | Placeholder page |
| `/hisse/:ticker` | `StockDetail.jsx` | Stock Analysis | Recharts interactive area chart with drag-measurement, metrics, heatmap financials, and report target table |
| `/kurum/:kurumName` | `BrokerageDetail.jsx` | Brokerage Analysis | Filtered report history for specific broker with expandable full text accordion |

---

## 3. Existing Data Schema for Research Reports

From inspecting `StockDetail.jsx`, `BrokerageDetail.jsx`, and `src/data/hisseData.json`, scraped research report items share the following JSON structure:

```json
{
  "id": 1,
  "hisse": "Aksigorta",
  "kurum": "Pusula Yatırım",
  "mevcutFiyat": "6.75",
  "hedefFiyat": "12.61",
  "potansiyel": "%86,81",
  "tarih": "31 Temmuz 2026",
  "link": "https://www.hisseonerileri.com/i/aksigorta-hisse-onerisi-pusula-yatirim-31-07-2026/",
  "full_text": "Öneri: AL\nPotansiyel: %86,81\nSon Fiyat: 6,75 TL\nHedef Fiyat: 12,61 TL..."
}
```

---

## 4. UI Integration Strategy for Research Reports

To deliver a seamless, high-performance UI experience for research reports, we propose adding a dedicated **"ARAŞTIRMA RAPORLARI" (Research Reports)** hub while enriching cross-page navigation.

### 4.1 Navigation Integration
1. **Sidebar Navigation Update (`src/App.jsx`)**:
   Add new menu link:
   ```jsx
   <Link to="/reports" className={`sidebar-link ${location.pathname === '/reports' ? 'active' : ''}`}>
     &gt; RAPORLAR (RESEARCH)
   </Link>
   ```
2. **Cross-Link Enhancements**:
   - In `StockDetail.jsx`: Add `[VIEW ALL REPORTS FOR TICKER]` button leading to `/reports?ticker=AKBNK`.
   - In `BrokerageDetail.jsx`: Add `[FILTER IN REPORTS HUB]` button leading to `/reports?kurum=ziraat-yatirim`.
   - In `Home.jsx` / `Screener.jsx`: Add quick link `[EXPLORE ALL SCRAPED REPORTS]`.

### 4.2 Dedicated Page Architecture (`src/pages/ResearchReports.jsx`)
Create a terminal page containing a **Filter Toolbar**, **Report Summary Bar**, **Interactive Data Table**, and **Detail Reader View**.

#### A. Filter Toolbar & Controls
- **Ticker Filter:** Search input with autocomplete/dropdown (e.g. `AKBNK`, `GARAN`, `THYAO`).
- **Brokerage (Kurum) Filter:** Select dropdown populated dynamically from available brokers (`Pusula Yatırım`, `Ziraat Yatırım`, `Gedik Yatırım`, `Şeker Yatırım`, `Tera Yatırım`, `Ak Yatırım`, etc.).
- **Rating / Recommendation Filter:** Multi-select/dropdown for extracted rating (`AL`, `TUT`, `SAT`, `Endeks Üstü Getiri`, `Nötr`).
- **Target Price Upside Filter:** Slider or quick buttons (`Tüm Potansiyeller`, `> %20 Upside`, `> %50 Upside`, `> %80 Upside`).
- **Date Range Filter:** Preset selector (`Tümü`, `Son 7 Gün`, `Son 30 Gün`, `Temmuz 2026`, custom date).
- **Keyword Search:** Search inside report full text (`full_text`).

#### B. Display Modes
1. **Interactive Data Table (Terminal Default View)**:
   - **Columns:** `TICKER`, `KURUM (BROKER)`, `TARİH (DATE)`, `ÖNERİ (RATING)`, `MEVCUT FİYAT`, `HEDEF FİYAT`, `POTANSİYEL (%)`, `İŞLEM`.
   - **Sorting:** Interactive click-to-sort on `TARİH`, `POTANSİYEL`, `HEDEF FİYAT`, `TICKER`.
   - **Expandable Accordion:** Clicking `[+] READ` toggles row expansion to display:
     - Formatted full report body text (`full_text`).
     - Key recommendation badges (Target Price, Implied Upside, Rating).
     - Direct link `[ORİJİNAL KAYNAĞA GİT]` to scraped report source.
2. **Terminal Modal Reader (`ReportModal.jsx` / Lightbox)**:
   - For deep reading without losing list context, clicking report title opens a full modal window with metadata, original source link, and clean monospace text presentation (similar to `Models.jsx` modal overlay).

---

## 5. Architectural Recommendations

### 5.1 Centralized API Service (`src/services/api.js`)
Currently, `fetch()` calls are duplicated across pages. We recommend creating `src/services/api.js`:

```javascript
const BASE_URL = 'http://localhost:8012/api';

export const api = {
  getStocks: () => fetch(`${BASE_URL}/stocks`).then(res => res.json()),
  getStockDetail: (ticker) => fetch(`${BASE_URL}/stocks/${ticker}`).then(res => res.json()),
  getRecommendations: (ticker) => fetch(`${BASE_URL}/recommendations/${ticker}`).then(res => res.json()),
  getAllReports: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${BASE_URL}/reports?${query}`).then(res => res.json());
  },
  getKurumStats: () => fetch(`${BASE_URL}/kurum-stats`).then(res => res.json()),
  getKurumDetail: (name) => fetch(`${BASE_URL}/kurum/${name}`).then(res => res.json()),
  getScreener: () => fetch(`${BASE_URL}/screener`).then(res => res.json()),
  getModels: () => fetch(`${BASE_URL}/models`).then(res => res.json()),
};
```

### 5.2 Component Refactoring Opportunities
- **`ReportTable.jsx` Component:** Extract report rendering logic shared between `StockDetail.jsx`, `BrokerageDetail.jsx`, and `ResearchReports.jsx` to prevent code duplication.
- **`FilterBar.jsx` Component:** Reusable terminal filter control bar component.

---

## 6. Verification & Quality Checks

1. **Terminal Aesthetics Compliance:** Ensure all new components use `var(--font-mono)`, terminal panel structures (`.panel`, `.panel-header`, `.panel-content`), and theme variables.
2. **Responsive Scrolling:** Maintain strict `max-height` with `overflow-y: auto` for large data tables (e.g. 300+ reports).
3. **URL Parameter Syncing:** Use `useSearchParams` from `react-router-dom` so filter states (ticker, broker, date) persist when users bookmark or share report links.
