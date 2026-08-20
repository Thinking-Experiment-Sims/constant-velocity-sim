# Constant Velocity: Two Cars (Physics Inquiry Simulation)

An interactive, zero-dependency physics simulation for 11th-grade physics students exploring the **Constant Velocity Particle Model (CVPM)** and Modeling Instruction pedagogy.

Part of **The Thinking Experiment (PhysicsKit)** interactive physics collection:
👉 [https://thinking-experiment-sims.github.io/interactive-physics/](https://thinking-experiment-sims.github.io/interactive-physics/)

---

## 🚗 Overview

Students observe two motorized toy cars moving along a track, collect position vs. time data, derive mathematical models, analyze experimental uncertainty, and predict the exact time and location where the two cars will cross paths.

### 🌟 Key Features
- **Fast vs. Slow Cars:** Red Car A runs at $15.0\text{ cm/s}$ (Fast), Blue Car B runs at $5.0\text{ cm/s}$ (Slow).
- **Crossing Lanes:** Red Car A moves along the top track lane while Blue Car B moves along the bottom track lane, allowing them to cleanly cross paths without colliding.
- **Dual Timing Modes:**
  - **Auto (Photogate Sensors):** Automated timestamps logged as cars pass each 30 cm interval mark ($0, 30, 60, 90, 120, 150, 180, 210, 240\text{ cm}$).
  - **Manual (Stopwatch Split):** Students press the `Split` button (or Spacebar) as the car crosses lines, capturing human reaction time latency ($\pm 0.15\text{--}0.25\text{ s}$) to teach experimental uncertainty.
- **Real-Time Interactive Graphing:** Live position-vs-time scatter plot with dynamic time scaling and linear regression line fitting ($x = v \cdot t + x_0$), $R^2$ calculation, and percent error.
- **Predict the Meeting Point Challenge:** Interactive challenge where students verify their derived models, algebraically calculate collision coordinates ($t_{\text{meet}}, x_{\text{meet}}$), and verify with a simultaneous run.
- **Structured CER Guided Discovery:** Formatted questions covering starting position ($y$-intercept), direction of motion (slope sign), physical meaning of slope, reaction time uncertainty, and model limits.

---

## 🎨 Design System

Follows **The Thinking Experiment** brand guidelines:
- **Teal Headers / Primary:** `#0f7e9b` / `#095f76`
- **Amber Accents / Highlights:** `#d67b19`
- **Card Background:** Pure white `#ffffff` on `#e9f4fb` grid
- **Strictly Prohibited:** No Purple or Gold.

---

## 🚀 Running Locally

No build step, framework, or dependencies required.

Using Python:
```bash
python3 -m http.server 8000
```
Then open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 📁 File Structure

```
constant-velocity-sim/
├── index.html                           # Main UI markup & guided inquiry
├── styles.css                            # Styling adhering to The Thinking Experiment
├── src/
│   ├── constantVelocityApp.js            # Animation loop, canvas rendering, UI events
│   └── constantVelocityPhysics.js        # Pure physics math & linear regression
├── tests/
│   └── constantVelocityPhysics.test.js   # Automated unit tests
├── package.json                          # ES module definition
└── README.md                             # Documentation
```

---

## 🧪 Testing

Run unit tests directly with Node.js:
```bash
node tests/constantVelocityPhysics.test.js
```

---

## 📄 License & Attribution

© 2026 Vladimir Lopez · The Thinking Experiment · Interactive Physics Simulations
