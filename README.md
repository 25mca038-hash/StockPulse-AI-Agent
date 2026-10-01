# StockPulse AI 📦🤖

StockPulse AI is an intelligent inventory management application powered by **Python**, **LangChain**, and **React + TypeScript (Vite)**. It provides real-time stock tracking, automated reordering recommendations, and an autonomous AI agent capable of answering inventory questions, identifying low-stock items, and directly updating inventory stock levels.

---

## 🌟 Key Features

- **Autonomous LangChain AI Agent**: Utilizes the LangChain framework with structured tool calling (`@tool`) to understand natural language user queries and take real actions.
- **Smart Inventory Actions**:
  - `check_inventory`: Full inventory overview with stock health indicators.
  - `update_stock`: Add or remove specific quantities from products.
  - `low_stock_alert`: Automatically detect products needing reorder with shortage analysis.
  - `restock_product`: Instantly replenish products back to their minimum threshold.
- **Interactive UI**:
  - Live inventory dashboard with key metrics (Total Products, Total Units, Low Stock, Out of Stock).
  - Add product and adjust stock modals.
  - Formatted Markdown tables rendered directly in the AI response panel.
- **Resilient Architecture**:
  - LangChain tool calling backed by `openai/gpt-oss-20b` via NVIDIA NIM.
  - Structured prompt chain fallback.
  - Deterministic local heuristics to ensure zero downtime.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.12, Flask, LangChain, LangChain-OpenAI, Pydantic, Gunicorn
- **Frontend**: React 19, TypeScript, Vite
- **AI Model**: NVIDIA NIM API (`openai/gpt-oss-20b`) via LangChain

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python**: 3.10+ (with pip)
- **Node.js**: 18+ (with npm)

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
NVIDIA_API_KEY="your_nvidia_api_key_here"
PORT=3000
```

### 3. Install Dependencies
```bash
# Python backend dependencies
pip install -r requirements.txt

# Frontend dependencies
npm install
```

### 4. Run Locally

#### Start the Python LangChain Backend:
```bash
python server.py
```
Backend runs at `http://localhost:3000`.

#### Start the Frontend Dev Server:
```bash
npm run dev
```
Frontend runs at `http://localhost:5173` with automatic `/api` proxying to the backend.

---

## 🌐 Production Deployment

The project includes `render.yaml` pre-configured for Render.com deployment:

- **Build Command**: `npm install && npm run build && pip install -r requirements.txt`
- **Start Command**: `gunicorn server:app --bind 0.0.0.0:$PORT`
- **Environment Variables**: Set `NVIDIA_API_KEY` in the Render dashboard.
