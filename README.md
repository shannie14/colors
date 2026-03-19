# colors

**GPU-accelerated abstract liquid background generator using WebGL 2 fluid dynamics.**

A real-time Navier-Stokes fluid simulation that produces stunning, endlessly evolving abstract visuals — similar to professional "liquid art" screensavers and 4K background videos.

![preview](https://img.shields.io/badge/WebGL_2.0-Fluid_Dynamics-blue?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## Quick Start (Claude Code + VS Code on Mac)

### Prerequisites

- **Node.js 18+** — install via `brew install node` or [nodejs.org](https://nodejs.org)
- **VS Code** — [code.visualstudio.com](https://code.visualstudio.com)
- **Claude Code** — Anthropic's CLI coding tool

### Step-by-Step Setup

Open your terminal and run these commands:

```bash
# 1. Navigate to where you want the project
cd ~/Projects   # or wherever you keep code

# 2. Copy the project (if received as a folder) or create it fresh
#    If you already have the 'colors' folder:
cd colors

# 3. Install dependencies
npm install

# 4. Start the dev server
npm run dev
```

This opens your browser to `http://localhost:5173` with the live simulation.

### Using Claude Code

If you want to iterate on the project with Claude Code:

```bash
# In the colors directory
claude

# Then ask things like:
# "Add a new palette called 'Sunset' with warm orange/pink/purple colors"
# "Make the auto-splat create spiral patterns"
# "Add a recording feature that exports to WebM video"
# "Increase simulation resolution for 4K displays"
```

---

## Architecture

```
colors/
├── index.html              # Entry point + UI overlay
├── vite.config.js          # Vite bundler config
├── package.json
├── README.md
└── src/
    ├── main.js             # Simulation engine + render loop
    ├── shaders.js          # All GLSL shader programs
    ├── gl-utils.js         # WebGL helpers (FBOs, compilation)
    └── palettes.js         # Color palette definitions
```

### How the Algorithm Works

The simulation solves the **incompressible Navier-Stokes equations** on a 2D grid using the GPU:

```
∂v/∂t + (v·∇)v = -∇p + ν∇²v + f
∇·v = 0  (incompressibility constraint)
```

**Each frame executes these steps:**

1. **External Forces** — Mouse interaction or auto-splats inject velocity and colored dye into the field
2. **Vorticity Confinement** — Computes curl of velocity field and applies a corrective force to preserve small-scale swirling details that numerical diffusion would otherwise destroy
3. **Advection** — Moves both the velocity field and the dye field along the flow using semi-Lagrangian backtracing with bilinear interpolation
4. **Divergence Computation** — Measures how much fluid is "compressing" or "expanding" at each cell
5. **Pressure Solve** — 20 Jacobi iterations solve the Poisson pressure equation to find the pressure field that will enforce incompressibility
6. **Projection** — Subtracts the pressure gradient from velocity, making the field divergence-free
7. **Bloom Post-Processing** — Bright regions are extracted, progressively downsampled/blurred, then composited back for a luminous glow effect
8. **Display** — Final tone mapping + vignette renders the dye field to screen

### Key Technical Details

| Component | Resolution | Format |
|-----------|-----------|--------|
| Velocity field | 256² | RG16F (2-channel half-float) |
| Dye/color field | 1024² | RGBA16F (4-channel half-float) |
| Pressure field | 256² | R16F (1-channel half-float) |
| Bloom chain | 512² → 1² | RGBA16F, 8 mip levels |

---

## Controls

| Input | Action |
|-------|--------|
| **Click + Drag** | Paint fluid with velocity + color |
| **Scroll** | Change brush size |
| **P** | Cycle color palette |
| **A** | Toggle auto-paint mode |
| **Space** | Burst (random multi-splat explosion) |
| **B** | Toggle bloom post-processing |
| **R** | Reset simulation |
| **S** | Save screenshot as PNG |

---

## Color Palettes

8 curated palettes included:

- **Deep Ocean** — Blues, teals, electric greens
- **Neon Abyss** — Hot pinks, cyans, violets
- **Molten Earth** — Reds, oranges, golds
- **Aurora** — Greens, purples, ethereal blues
- **Bioluminescence** — Deep sea greens and aquas
- **Cyberpunk** — Magentas, electric blues, neon yellow
- **Ink & Gold** — Dark indigos with metallic gold
- **Coral Reef** — Warm pinks, ocean blues, sandy gold

### Adding Custom Palettes

Edit `src/palettes.js` and add to the `palettes` object:

```js
'My Palette': [
  [r, g, b],  // values 0.0 – 1.0
  [r, g, b],
  // ... 4-8 colors recommended
],
```

---

## Customization Guide

### Simulation Parameters (in `src/main.js` config object)

```js
SIM_RESOLUTION: 256,        // Grid resolution (128–512, higher = more detail, slower)
DYE_RESOLUTION: 1024,       // Color resolution (512–2048)
DENSITY_DISSIPATION: 0.97,  // How fast colors fade (0.95–1.0)
VELOCITY_DISSIPATION: 0.98, // How fast motion decays (0.95–1.0)
CURL: 30,                   // Vorticity strength (0–50, higher = more swirls)
PRESSURE_ITERATIONS: 20,    // Solver accuracy (10–40)
SPLAT_RADIUS: 0.25,         // Brush size
SPLAT_FORCE: 6000,          // How hard mouse pushes fluid
```

### Creating Video Backgrounds

1. Run the simulation and press **S** to capture individual frames
2. For video recording, add the MediaRecorder API (ask Claude Code to help)
3. Or use OBS Studio to capture the browser window at 4K

---

## Building for Production

```bash
npm run build
```

Output goes to `dist/` — deploy anywhere (Netlify, Vercel, GitHub Pages, etc).

```bash
# Preview the production build
npm run preview
```

---

## Performance Notes

- Runs at 60fps on most modern GPUs (integrated graphics included)
- Uses half-float textures for precision without the cost of full float
- Resolution automatically scales with device pixel ratio (capped at 2x)
- WebGL 2.0 required (supported in all modern browsers)

---

## License

MIT — use freely for any purpose.
