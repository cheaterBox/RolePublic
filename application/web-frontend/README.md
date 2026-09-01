# RoleTect Web Frontend

The Next.js 15 web client for **RoleTect** — supporting real-time resume tailoring, job description parsing, LaTeX compilation, and AI-assisted workflows.

---

## 🚀 Quick Start

### Running with Bun (Recommended)
```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

The application will be live at [http://localhost:3000](http://localhost:3000).

---

## ⚙️ Configuration & Environment

The frontend connects to the RoleTect Axum API server. Set these in `.env.local` or parent environment:

```bash
# Internal API URL (server-side proxying in Docker/Node)
INTERNAL_API_URL=http://127.0.0.1:8080

# Public API URL (client-side browser requests)
NEXT_PUBLIC_API_URL=http://localhost:8080

# API Bearer Token
NEXT_PUBLIC_API_TOKEN=roletect_vps_master_token_2026
```

---

## 🛠️ Available Scripts

| Command | Action |
| :--- | :--- |
| `bun run dev` | Start Next.js development server on `:3000` |
| `bun run build` | Build standalone production distribution |
| `bun run start` | Start production server |
| `bun run lint` | Run Biome linter check |
| `bun run format` | Auto-format source files with Biome |
| `bun test` | Run frontend test suite |

