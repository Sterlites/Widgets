# 🎨 Algorithm Visualizer

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7.2.4-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind%20CSS-4.1.17-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

<p align="center">
  <b>An interactive, step-by-step sorting algorithm visualizer built with React and TypeScript</b>
</p>

<p align="center">
  <a href="#-live-demo">🚀 Live Demo</a> •
  <a href="#-features">✨ Features</a> •
  <a href="#-algorithms">📊 Algorithms</a> •
  <a href="#-getting-started">🚀 Getting Started</a> •
  <a href="#-project-structure">📁 Structure</a>
</p>

---

## 🖼️ Preview

![Algorithm Visualizer Preview](https://via.placeholder.com/1200x600/1e293b/ffffff?text=Algorithm+Visualizer+Preview)

*Interactive visualization of sorting algorithms with real-time step-by-step playback*

---

## ✨ Features

- 🎯 **Three Sorting Algorithms**: Bubble Sort, Quick Sort, and Merge Sort
- 🎬 **Step-by-Step Visualization**: Watch each comparison, swap, and merge in real-time
- 🎮 **Interactive Controls**: Play, pause, step forward/backward, and reset
- ⚡ **Adjustable Speed**: Control the animation speed from 0.5x to 4x
- 🎨 **Multiple Array Types**: Generate random, reversed, or nearly-sorted arrays
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices
- 🌙 **Modern Dark UI**: Beautiful gradient backgrounds with glassmorphism effects
- 🏷️ **Visual Indicators**: Color-coded bars (comparing, swapping, sorted, pivot)
- 📚 **Algorithm Info Panel**: Real-time descriptions and complexity analysis

---

## 📊 Algorithms

| Algorithm | Time Complexity | Space Complexity | Description |
|-----------|----------------|------------------|-------------|
| **Bubble Sort** | O(n²) | O(1) | Repeatedly compares adjacent elements and swaps them if they are in the wrong order |
| **Quick Sort** | O(n log n) | O(log n) | Picks a pivot element and partitions the array around it |
| **Merge Sort** | O(n log n) | O(n) | Divides the array into halves, recursively sorts them, then merges back together |

### Visual States

- 🔵 **Default**: Standard array element
- 🟡 **Comparing**: Elements being compared
- 🔴 **Swapping**: Elements being swapped
- 🟢 **Sorted**: Element in final sorted position
- 🟣 **Pivot**: Pivot element (Quick Sort)

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher (or **yarn** / **pnpm**)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/algo-visualizer.git
cd algo-visualizer
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the development server**

```bash
npm run dev
```

4. **Open your browser**

Navigate to [`http://localhost:5173`](http://localhost:5173)

---

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite development server with HMR |
| `npm run build` | Build the project for production (single file output) |
| `npm run preview` | Preview the production build locally |

---

## 📁 Project Structure

```
algo-visualizer/
├── 📄 index.html              # HTML entry point
├── 📄 package.json            # Dependencies and scripts
├── 📄 tsconfig.json           # TypeScript configuration
├── 📄 vite.config.ts          # Vite configuration
├── 📁 src/
│   ├── 📄 main.tsx            # Application entry point
│   ├── 📄 App.tsx             # Main application component
│   ├── 📄 types.ts            # TypeScript type definitions
│   ├── 📄 index.css           # Global styles
│   ├── 📁 algorithms/         # Sorting algorithm implementations
│   │   ├── 📄 index.ts        # Algorithm exports and info
│   │   ├── 📄 bubbleSort.ts   # Bubble Sort visualization
│   │   ├── 📄 quickSort.ts    # Quick Sort visualization
│   │   └── 📄 mergeSort.ts    # Merge Sort visualization
│   ├── 📁 components/         # React components
│   │   ├── 📄 AlgorithmSelector.tsx  # Algorithm selection UI
│   │   ├── 📄 ArrayBars.tsx          # Array visualization bars
│   │   ├── 📄 ArrayControls.tsx      # Array generation controls
│   │   ├── 📄 Controls.tsx           # Playback controls
│   │   └── 📄 InfoPanel.tsx          # Algorithm information panel
│   └── 📁 utils/
│       └── 📄 cn.ts           # Tailwind class name utilities
```

---

## 🏗️ Tech Stack

- **[React 19](https://react.dev/)** - UI library with hooks and concurrent features
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Vite](https://vitejs.dev/)** - Next-generation frontend build tool
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS framework
- **[vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)** - Bundles app into a single HTML file

---

## 🎮 How to Use

1. **Select an Algorithm**: Choose from Bubble Sort, Quick Sort, or Merge Sort
2. **Configure Array**: Adjust the array size (5-30 elements) and select array type
3. **Generate Array**: Click to generate random, reversed, or nearly-sorted arrays
4. **Control Playback**: Use the control bar to play, pause, step through, or reset
5. **Adjust Speed**: Use the speed slider to control animation speed
6. **Watch & Learn**: Observe the algorithm steps with color-coded visual feedback

---

## 🌟 Key Features Explained

### Step Generation
Each algorithm implementation generates a sequence of steps that capture the state of the array at each significant operation. This allows for precise playback control and detailed visualization.

### Visual Feedback
- **Color Coding**: Different colors indicate what operation is happening
- **Description Panel**: Real-time text description of each step
- **Progress Tracking**: Visual progress bar and step counter

### Array Generation
- **Random**: Completely random values for general testing
- **Reversed**: Worst-case scenario for some algorithms
- **Nearly Sorted**: Minimal swaps needed, good for best-case analysis

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Ideas for Contributions

- 🆕 Add more sorting algorithms (Heap Sort, Insertion Sort, Selection Sort)
- 🎨 Add light/dark theme toggle
- 📊 Add performance metrics and comparison charts
- 🔊 Add sound effects for swaps and comparisons
- 💾 Add export functionality for algorithm steps

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by various algorithm visualizers across the web
- Built with modern web technologies for optimal performance
- Designed for educational purposes to help understand sorting algorithms

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/yourusername">Your Name</a>
</p>

<p align="center">
  ⭐ Star this repository if you found it helpful!
</p>
