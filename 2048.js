// AI Script to play 2048 at https://2048game.com/ via console
(function () {
  // Debug mode
  const DEBUG = false;

  // Performance tracking
  const PERFORMANCE = {
    moveCount: 0,
    avgMoveTime: 0,
    totalTime: 0,
    highestTile: 0,
    startTime: Date.now(),
    moveHistory: [],
    speedSetting: "normal",
    moveDelay: 100,
    kpi: {
      movesPerSecond: 0,
      successRate: 0,
      averageDepth: 0,
      efficiency: 0,
    },
  };

  // Speed control settings
  const SPEED_SETTINGS = {
    turbo: 0,
    fast: 50,
    normal: 100,
    slow: 200,
  };

  // Game state tracking
  let gameRunning = true;
  let lastGridState = null;
  let stuckCounter = 0;
  let moveCount = 0;
  let highestTile = 0;
  let movePattern = [];
  let patternIndex = 0;
  let monotonicityWeight = 50.0;
  let emptyWeight = 300.0;
  let mergeWeight = 800.0;
  let cornerWeight = 30.0;
  let smoothnessWeight = 25.0;
  let chainWeight = 40.0;
  let maxDepthReached = 0;

  // Enhanced pattern strategies
  const patterns = {
    snake: [
      [15, 14, 13, 12],
      [8, 9, 10, 11],
      [7, 6, 5, 4],
      [0, 1, 2, 3],
    ],
    corner: [
      [0, 1, 2, 3],
      [1, 2, 3, 4],
      [2, 3, 4, 5],
      [3, 4, 5, 6],
    ],
    spiral: [
      [0, 1, 2, 3],
      [11, 12, 13, 4],
      [10, 15, 14, 5],
      [9, 8, 7, 6],
    ],
    diagonal: [
      [15, 14, 10, 6],
      [13, 11, 7, 3],
      [9, 5, 2, 1],
      [4, 0, 0, 0],
    ],
  };

  // Current pattern
  let currentPattern = "snake";
  let targetCorner = { row: 3, col: 0 }; // Default corner (bottom-left)

  // Function to get the current game state from the DOM
  function getGameState() {
    const tiles = document.querySelectorAll(".tile");
    if (!tiles || tiles.length === 0) {
      if (DEBUG)
        console.error("No tiles found - make sure the game has started");
      return null;
    }

    // Create 4x4 grid filled with zeros
    let grid = Array(4)
      .fill()
      .map(() => Array(4).fill(0));

    // Fill grid with tile values
    for (const tile of tiles) {
      // Skip tiles that are in the process of being removed
      if (tile.classList.contains("tile-merged")) continue;

      // Extract position and value from class names
      const classList = Array.from(tile.classList);
      const posClass = classList.find((c) => c.startsWith("tile-position-"));
      const valueClass = classList.find(
        (c) => c.startsWith("tile-") && !c.startsWith("tile-position-")
      );

      if (posClass && valueClass) {
        const [x, y] = posClass
          .replace("tile-position-", "")
          .split("-")
          .map((n) => parseInt(n) - 1);
        const value = parseInt(valueClass.replace("tile-", ""));

        if (
          !isNaN(x) &&
          !isNaN(y) &&
          !isNaN(value) &&
          x >= 0 &&
          x < 4 &&
          y >= 0 &&
          y < 4
        ) {
          grid[y][x] = value;
        }
      }
    }

    return grid;
  }

  // Function to check if the game is over
  function isGameOver() {
    return document.querySelector(".game-message.game-over") !== null;
  }

  // Single-letter movement functions
  function u() {
    // up
    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      keyCode: 38,
      which: 38,
      code: "ArrowUp",
      bubbles: true,
    });
    document.dispatchEvent(event);
    if (DEBUG) console.log("Move: UP");
  }

  function d() {
    // down
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      keyCode: 40,
      which: 40,
      code: "ArrowDown",
      bubbles: true,
    });
    document.dispatchEvent(event);
    if (DEBUG) console.log("Move: DOWN");
  }

  function l() {
    // left
    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      keyCode: 37,
      which: 37,
      code: "ArrowLeft",
      bubbles: true,
    });
    document.dispatchEvent(event);
    if (DEBUG) console.log("Move: LEFT");
  }

  function r() {
    // right
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      keyCode: 39,
      which: 39,
      code: "ArrowRight",
      bubbles: true,
    });
    document.dispatchEvent(event);
    if (DEBUG) console.log("Move: RIGHT");
  }

  // Compare two grids
  function areGridsEqual(grid1, grid2) {
    if (!grid1 || !grid2) return false;

    // Check if both are 4x4 grids
    if (grid1.length !== 4 || grid2.length !== 4) return false;

    for (let y = 0; y < 4; y++) {
      if (
        !grid1[y] ||
        !grid2[y] ||
        grid1[y].length !== 4 ||
        grid2[y].length !== 4
      ) {
        return false;
      }

      for (let x = 0; x < 4; x++) {
        if (grid1[y][x] !== grid2[y][x]) {
          return false;
        }
      }
    }
    return true;
  }

  // Process a line of tiles for merging
  function processTiles(tiles) {
    // Filter out zeros
    let filtered = tiles.filter((val) => val !== 0);

    // Merge adjacent identical tiles
    for (let i = 0; i < filtered.length - 1; i++) {
      if (filtered[i] === filtered[i + 1]) {
        filtered[i] *= 2;
        filtered[i + 1] = 0;
      }
    }

    // Filter zeros again
    filtered = filtered.filter((val) => val !== 0);

    // Fill with zeros until length is 4
    while (filtered.length < 4) {
      filtered.push(0);
    }

    return filtered;
  }

  // Simulate a move
  function simulateMove(grid, direction) {
    if (!grid) return { grid: null, moved: false, score: 0 };

    // Create a copy of the grid
    const gridCopy = JSON.parse(JSON.stringify(grid));
    let moved = false;
    let score = 0;

    try {
      // Apply the move to the copy
      if (direction === "up") {
        for (let col = 0; col < 4; col++) {
          const column = [
            gridCopy[0][col],
            gridCopy[1][col],
            gridCopy[2][col],
            gridCopy[3][col],
          ];
          const originalColumn = [...column];
          const newColumn = processTiles(column);

          for (let row = 0; row < 4; row++) {
            if (gridCopy[row][col] !== newColumn[row]) {
              moved = true;
              // If two tiles merged, add to score
              if (
                newColumn[row] > originalColumn[row] &&
                newColumn[row] !== 0
              ) {
                score += newColumn[row];
              }
            }
            gridCopy[row][col] = newColumn[row];
          }
        }
      } else if (direction === "down") {
        for (let col = 0; col < 4; col++) {
          const column = [
            gridCopy[3][col],
            gridCopy[2][col],
            gridCopy[1][col],
            gridCopy[0][col],
          ];
          const originalColumn = [...column];
          const newColumn = processTiles(column);

          for (let row = 0; row < 4; row++) {
            if (gridCopy[3 - row][col] !== newColumn[row]) {
              moved = true;
              // If two tiles merged, add to score
              if (
                newColumn[row] > originalColumn[row] &&
                newColumn[row] !== 0
              ) {
                score += newColumn[row];
              }
            }
            gridCopy[3 - row][col] = newColumn[row];
          }
        }
      } else if (direction === "left") {
        for (let row = 0; row < 4; row++) {
          const originalRow = [...gridCopy[row]];
          gridCopy[row] = processTiles(gridCopy[row]);

          for (let col = 0; col < 4; col++) {
            if (originalRow[col] !== gridCopy[row][col]) {
              moved = true;
              // If two tiles merged, add to score
              if (
                gridCopy[row][col] > originalRow[col] &&
                gridCopy[row][col] !== 0
              ) {
                score += gridCopy[row][col];
              }
            }
          }
        }
      } else if (direction === "right") {
        for (let row = 0; row < 4; row++) {
          const reversedRow = [...gridCopy[row]].reverse();
          const originalRow = [...reversedRow];
          const newRow = processTiles(reversedRow).reverse();

          for (let col = 0; col < 4; col++) {
            if (gridCopy[row][col] !== newRow[col]) {
              moved = true;
              // If two tiles merged, add to score
              if (newRow[col] > gridCopy[row][col] && newRow[col] !== 0) {
                score += newRow[col];
              }
            }
            gridCopy[row][col] = newRow[col];
          }
        }
      }
    } catch (e) {
      if (DEBUG) console.error("Error in simulateMove:", e);
      return { grid: grid, moved: false, score: 0 };
    }

    return { grid: gridCopy, moved: moved, score: score };
  }

  // Get the highest tile value and its position
  function getHighestTileInfo(grid) {
    let maxVal = 0;
    let maxPos = { row: -1, col: -1 };

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (grid[row][col] > maxVal) {
          maxVal = grid[row][col];
          maxPos = { row, col };
        }
      }
    }

    return { value: maxVal, position: maxPos };
  }

  // Determine the best corner based on the current board state
  function determineBestCorner(grid) {
    const highestInfo = getHighestTileInfo(grid);
    const { row, col } = highestInfo.position;

    // If the highest tile is already in a corner, keep it there
    if ((row === 0 || row === 3) && (col === 0 || col === 3)) {
      return { row, col };
    }

    // Default to bottom-left
    return { row: 3, col: 0 };
  }

  // Check if a position is a corner
  function isCorner(row, col) {
    return (row === 0 || row === 3) && (col === 0 || col === 3);
  }

  // Calculate the path score for a specific pattern
  function calculatePatternScore(grid, pattern) {
    let score = 0;
    const maxTile = Math.max(...grid.flat().filter((n) => !isNaN(n)));

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (grid[row][col] > 0) {
          const weight = pattern[row][col];
          score += grid[row][col] * Math.pow(2, weight / 2);
        }
      }
    }

    return score;
  }

  // Advanced grid evaluation
  function evaluateGrid(grid) {
    if (!grid) return -Infinity;

    try {
      // 1. Count empty cells
      const emptyCells = grid.flat().filter((cell) => cell === 0).length;
      let emptyScore = emptyCells * emptyWeight;

      // 2. Calculate monotonicity (prefer organized tiles)
      let monotonicity = 0;

      // Apply pattern weights
      let patternScore = 0;
      const patternWeights = patterns[currentPattern];

      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          if (grid[row][col] > 0) {
            patternScore +=
              grid[row][col] * Math.pow(2, patternWeights[row][col] / 2);
          }
        }
      }

      // Get highest tile info
      const { value: maxTile, position: maxPos } = getHighestTileInfo(grid);

      // Check monotonicity in all directions
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          if (grid[row][col] > 0 && grid[row][col + 1] > 0) {
            // For the snake pattern, we want decreasing values in odd rows
            // and increasing values in even rows
            if (currentPattern === "snake") {
              if (row % 2 === 0) {
                // Even rows: left to right
                monotonicity +=
                  grid[row][col] >= grid[row][col + 1]
                    ? grid[row][col]
                    : -grid[row][col];
              } else {
                // Odd rows: right to left
                monotonicity +=
                  grid[row][col] <= grid[row][col + 1]
                    ? grid[row][col + 1]
                    : -grid[row][col + 1];
              }
            } else {
              // For other patterns, adapt based on the target corner
              const colDirection = targetCorner.col === 0 ? 1 : -1;
              if (
                (colDirection === 1 && grid[row][col] >= grid[row][col + 1]) ||
                (colDirection === -1 && grid[row][col] <= grid[row][col + 1])
              ) {
                monotonicity += Math.max(grid[row][col], grid[row][col + 1]);
              } else {
                monotonicity -= Math.min(grid[row][col], grid[row][col + 1]);
              }
            }
          }
        }
      }

      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 3; row++) {
          if (grid[row][col] > 0 && grid[row + 1][col] > 0) {
            // Adapt based on the target corner
            const rowDirection = targetCorner.row === 0 ? 1 : -1;
            if (
              (rowDirection === 1 && grid[row][col] >= grid[row + 1][col]) ||
              (rowDirection === -1 && grid[row][col] <= grid[row + 1][col])
            ) {
              monotonicity += Math.max(grid[row][col], grid[row + 1][col]);
            } else {
              monotonicity -= Math.min(grid[row][col], grid[row + 1][col]);
            }
          }
        }
      }

      // 3. Calculate smoothness (prefer adjacent tiles with similar values)
      let smoothness = 0;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          if (grid[row][col] > 0) {
            // Check right neighbor
            if (col < 3 && grid[row][col + 1] > 0) {
              smoothness -= Math.abs(
                Math.log2(grid[row][col]) - Math.log2(grid[row][col + 1])
              );
            }
            // Check bottom neighbor
            if (row < 3 && grid[row + 1][col] > 0) {
              smoothness -= Math.abs(
                Math.log2(grid[row][col]) - Math.log2(grid[row + 1][col])
              );
            }
          }
        }
      }

      // 4. Calculate mergeability (potential for merges)
      let merges = 0;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          if (grid[row][col] > 0 && grid[row][col] === grid[row][col + 1]) {
            merges += grid[row][col] * 2;
          }
        }
      }

      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 3; row++) {
          if (grid[row][col] > 0 && grid[row][col] === grid[row + 1][col]) {
            merges += grid[row][col] * 2;
          }
        }
      }

      // 5. Calculate corner and edge alignment
      let cornerScore = 0;

      // Bonus for having max tile in target corner
      if (maxPos.row === targetCorner.row && maxPos.col === targetCorner.col) {
        cornerScore += maxTile * 3;

        // Check for decreasing values from this corner
        const rowDir = targetCorner.row === 0 ? 1 : -1;
        const colDir = targetCorner.col === 0 ? 1 : -1;

        let chainScore = 0;
        let prevValue = maxTile;

        // Check row chain
        for (
          let c = targetCorner.col + colDir, steps = 1;
          c >= 0 && c < 4 && steps < 4;
          c += colDir, steps++
        ) {
          if (grid[targetCorner.row][c] > 0) {
            if (grid[targetCorner.row][c] <= prevValue) {
              chainScore += grid[targetCorner.row][c] * (5 - steps);
              prevValue = grid[targetCorner.row][c];
            } else {
              // Penalty for out-of-order values
              chainScore -= grid[targetCorner.row][c];
            }
          }
        }

        // Reset prevValue for column chain
        prevValue = maxTile;

        // Check column chain
        for (
          let r = targetCorner.row + rowDir, steps = 1;
          r >= 0 && r < 4 && steps < 4;
          r += rowDir, steps++
        ) {
          if (grid[r][targetCorner.col] > 0) {
            if (grid[r][targetCorner.col] <= prevValue) {
              chainScore += grid[r][targetCorner.col] * (5 - steps);
              prevValue = grid[r][targetCorner.col];
            } else {
              // Penalty for out-of-order values
              chainScore -= grid[r][targetCorner.col];
            }
          }
        }

        cornerScore += (chainScore * chainWeight) / 100;
      } else if (isCorner(maxPos.row, maxPos.col)) {
        // If max tile is in any corner, still good but not ideal if not target
        cornerScore += maxTile;
      } else {
        // Penalty for max tile not in any corner
        cornerScore -= maxTile / 2;

        // Extra penalty based on distance from target corner
        const distance =
          Math.abs(maxPos.row - targetCorner.row) +
          Math.abs(maxPos.col - targetCorner.col);
        cornerScore -= (maxTile * distance) / 10;
      }

      // 6. Edge alignment - reward tiles along the edges in decreasing order
      let edgeScore = 0;
      const edgeRows = targetCorner.row === 0 ? [0] : [3];
      const edgeCols = targetCorner.col === 0 ? [0] : [3];

      // Check edge rows
      for (const row of edgeRows) {
        let prev = -1;
        let inOrder = true;
        const colRange = targetCorner.col === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];

        for (const col of colRange) {
          if (grid[row][col] > 0) {
            if (prev === -1) {
              prev = grid[row][col];
            } else if (grid[row][col] > prev) {
              inOrder = false;
              break;
            }
            prev = grid[row][col];
            edgeScore += grid[row][col] / 2;
          }
        }

        if (inOrder) edgeScore += prev;
      }

      // Check edge columns
      for (const col of edgeCols) {
        let prev = -1;
        let inOrder = true;
        const rowRange = targetCorner.row === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];

        for (const row of rowRange) {
          if (grid[row][col] > 0) {
            if (prev === -1) {
              prev = grid[row][col];
            } else if (grid[row][col] > prev) {
              inOrder = false;
              break;
            }
            prev = grid[row][col];
            edgeScore += grid[row][col] / 2;
          }
        }

        if (inOrder) edgeScore += prev;
      }

      // 7. Risk assessment - check for potential traps
      let risk = 0;

      // Check for small values trapped between large values
      for (let row = 1; row < 3; row++) {
        for (let col = 1; col < 3; col++) {
          if (grid[row][col] > 0) {
            // Check if surrounded by much larger values
            const neighbors = [
              grid[row - 1][col],
              grid[row + 1][col],
              grid[row][col - 1],
              grid[row][col + 1],
            ].filter((v) => v > 0);

            const avgNeighbor =
              neighbors.reduce((sum, val) => sum + val, 0) /
              Math.max(1, neighbors.length);

            if (avgNeighbor > grid[row][col] * 4) {
              risk -= grid[row][col] * 2;
            }
          }
        }
      }

      // Special weight adjustments based on game phase
      let phaseMultiplier = 1.0;

      if (maxTile >= 1024) {
        // Late game: focus more on pattern and corner
        phaseMultiplier = 1.5;
        patternScore *= 1.3;
        cornerScore *= 1.5;
        edgeScore *= 1.3;
        emptyScore *= 0.8;
      } else if (maxTile >= 512) {
        // Mid-late game: balance between structure and merges
        phaseMultiplier = 1.2;
        patternScore *= 1.2;
        cornerScore *= 1.3;
      } else if (maxTile <= 64) {
        // Early game: focus on merges and empty cells
        merges *= 1.5;
        emptyScore *= 1.2;
        patternScore *= 0.7;
        cornerScore *= 0.5;
      }

      // Combine all factors with appropriate weights
      const totalScore =
        patternScore * phaseMultiplier +
        (monotonicity * monotonicityWeight) / 100 +
        emptyScore +
        (merges * mergeWeight) / 100 +
        (cornerScore * cornerWeight) / 10 +
        (edgeScore * cornerWeight) / 15 +
        (smoothness * smoothnessWeight) / 10 +
        risk;

      return totalScore;
    } catch (e) {
      if (DEBUG) console.error("Error in evaluateGrid:", e);
      return -Infinity;
    }
  }

  // Advanced look-ahead with pruning
  function lookAheadEvaluation(
    grid,
    depth,
    alpha,
    beta,
    maximizingPlayer,
    originalDepth
  ) {
    if (!grid) return { score: -Infinity, moves: [] };

    // Track maximum depth reached for debugging
    if (originalDepth - depth + 1 > maxDepthReached) {
      maxDepthReached = originalDepth - depth + 1;
      if (DEBUG) console.log(`New max depth reached: ${maxDepthReached}`);
    }

    if (depth <= 0) {
      return { score: evaluateGrid(grid), moves: [] };
    }

    if (maximizingPlayer) {
      const directions = ["up", "down", "left", "right"];
      let bestScore = -Infinity;
      let bestMoves = [];

      // Try each direction
      for (const direction of directions) {
        const { grid: nextGrid, moved } = simulateMove(grid, direction);
        if (moved) {
          const result = lookAheadEvaluation(
            nextGrid,
            depth - 1,
            alpha,
            beta,
            false,
            originalDepth
          );

          if (result.score > bestScore) {
            bestScore = result.score;
            bestMoves = [direction, ...result.moves];
          }

          alpha = Math.max(alpha, result.score);

          // Alpha-beta pruning
          if (beta <= alpha) break;
        }
      }

      if (bestScore === -Infinity) {
        return { score: evaluateGrid(grid), moves: [] };
      }

      return { score: bestScore, moves: bestMoves };
    } else {
      // Simulating the computer's turn (tile spawn)
      let worstScore = Infinity;
      let worstMoves = [];
      const emptyCells = [];

      // Find all empty cells
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          if (grid[row][col] === 0) {
            emptyCells.push({ row, col });
          }
        }
      }

      if (emptyCells.length === 0) {
        return { score: evaluateGrid(grid), moves: [] };
      }

      // Determine sample size based on depth and empty cells
      const sampleSize =
        depth <= 2
          ? Math.min(4, emptyCells.length)
          : Math.min(2, emptyCells.length);

      // Take strategic samples - prioritize cells adjacent to high values
      const strategicCells = [];
      const randomCells = [...emptyCells];

      // Find highest tile
      const highestTile = getHighestTileInfo(grid);

      // Sort cells by strategic importance (distance to high values)
      for (const cell of emptyCells) {
        let strategic = false;

        // Check if adjacent to any high value
        const adjacentPositions = [
          { row: cell.row - 1, col: cell.col },
          { row: cell.row + 1, col: cell.col },
          { row: cell.row, col: cell.col - 1 },
          { row: cell.row, col: cell.col + 1 },
        ];

        for (const pos of adjacentPositions) {
          if (pos.row >= 0 && pos.row < 4 && pos.col >= 0 && pos.col < 4) {
            if (grid[pos.row][pos.col] >= highestTile.value / 4) {
              strategic = true;
              break;
            }
          }
        }

        if (strategic) {
          strategicCells.push(cell);
          // Remove from random cells
          const index = randomCells.findIndex(
            (c) => c.row === cell.row && c.col === cell.col
          );
          if (index !== -1) randomCells.splice(index, 1);
        }
      }

      // Combine strategic and random cells up to sample size
      const sampledCells = [];
      while (
        sampledCells.length < sampleSize &&
        (strategicCells.length > 0 || randomCells.length > 0)
      ) {
        if (strategicCells.length > 0) {
          sampledCells.push(strategicCells.pop());
        } else {
          const randomIndex = Math.floor(Math.random() * randomCells.length);
          sampledCells.push(randomCells[randomIndex]);
          randomCells.splice(randomIndex, 1);
        }
      }

      // Try spawning 2 and 4 tiles at each position
      for (const cell of sampledCells) {
        const { row, col } = cell;

        // Try with 2 (90% probability)
        const gridWith2 = JSON.parse(JSON.stringify(grid));
        gridWith2[row][col] = 2;
        const resultWith2 = lookAheadEvaluation(
          gridWith2,
          depth - 1,
          alpha,
          beta,
          true,
          originalDepth
        );

        // Try with 4 (10% probability)
        const gridWith4 = JSON.parse(JSON.stringify(grid));
        gridWith4[row][col] = 4;
        const resultWith4 = lookAheadEvaluation(
          gridWith4,
          depth - 1,
          alpha,
          beta,
          true,
          originalDepth
        );

        // Weighted average based on spawn probabilities
        const combinedScore = 0.9 * resultWith2.score + 0.1 * resultWith4.score;

        if (combinedScore < worstScore) {
          worstScore = combinedScore;
          worstMoves =
            resultWith2.score <= resultWith4.score
              ? resultWith2.moves
              : resultWith4.moves;
        }

        beta = Math.min(beta, combinedScore);

        // Alpha-beta pruning
        if (beta <= alpha) break;
      }

      if (worstScore === Infinity) {
        return { score: evaluateGrid(grid), moves: [] };
      }

      return { score: worstScore, moves: worstMoves };
    }
  }

  // Detect potential deadlock situations
  function detectDeadlock(grid) {
    // Check if there are no empty cells
    const emptyCells = grid.flat().filter((cell) => cell === 0).length;
    if (emptyCells > 4) return false; // Not a deadlock risk yet

    // Check if any adjacent cells have the same value
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const val = grid[row][col];
        if (val === 0) continue;

        // Check right
        if (col < 3 && grid[row][col + 1] === val) return false;
        // Check down
        if (row < 3 && grid[row + 1][col] === val) return false;
      }
    }

    // If we have very few empty cells and no adjacent same values, potential deadlock
    return emptyCells <= 2;
  }

  // Function to decide the next move with advanced algorithms
  function decideNextMove() {
    const grid = getGameState();
    if (!grid) {
      if (DEBUG) console.warn("Could not get game state");
      return null;
    }

    const moves = [
      { direction: "up", action: u },
      { direction: "down", action: d },
      { direction: "left", action: l },
      { direction: "right", action: r },
    ];

    // Update target corner based on current board state
    if (moveCount % 20 === 0 || moveCount === 0) {
      targetCorner = determineBestCorner(grid);
      if (DEBUG)
        console.log(
          `Updated target corner to: row ${targetCorner.row}, col ${targetCorner.col}`
        );

      // Adjust pattern based on target corner
      if (targetCorner.row === 3 && targetCorner.col === 0) {
        currentPattern = "snake";
      } else if (targetCorner.row === 3 && targetCorner.col === 3) {
        // Modify pattern for bottom-right corner
        const modifiedSnake = JSON.parse(JSON.stringify(patterns.snake));
        for (let row = 0; row < 4; row++) {
          modifiedSnake[row].reverse();
        }
        patterns.modified = modifiedSnake;
        currentPattern = "modified";
      } else if (targetCorner.row === 0 && targetCorner.col === 0) {
        currentPattern = "diagonal";
      } else {
        // Top-right corner
        const modifiedDiagonal = JSON.parse(JSON.stringify(patterns.diagonal));
        for (let row = 0; row < 4; row++) {
          modifiedDiagonal[row].reverse();
        }
        patterns.modified = modifiedDiagonal;
        currentPattern = "modified";
      }
    }

    // Check if grid has changed since last move
    if (lastGridState && areGridsEqual(grid, lastGridState)) {
      stuckCounter++;
      if (stuckCounter > 2) {
        if (DEBUG)
          console.log("Grid hasn't changed - trying pattern-based move");
        // Use predefined move patterns to break out of local minima
        if (movePattern.length === 0) {
          // Define pattern based on target corner
          if (targetCorner.row === 3 && targetCorner.col === 0) {
            // Bottom-left: prioritize up, then right
            movePattern = ["up", "right", "down", "right", "up", "left"];
          } else if (targetCorner.row === 3 && targetCorner.col === 3) {
            // Bottom-right: prioritize up, then left
            movePattern = ["up", "left", "down", "left", "up", "right"];
          } else if (targetCorner.row === 0 && targetCorner.col === 0) {
            // Top-left: prioritize down, then right
            movePattern = ["down", "right", "up", "right", "down", "left"];
          } else {
            // Top-right: prioritize down, then left
            movePattern = ["down", "left", "up", "left", "down", "right"];
          }

          patternIndex = 0;
        }

        const patternDirection = movePattern[patternIndex];
        patternIndex = (patternIndex + 1) % movePattern.length;

        // Find the action for this direction
        for (const move of moves) {
          if (move.direction === patternDirection) {
            return move.action;
          }
        }

        // Fallback to random
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex].action;
      }
    } else {
      stuckCounter = 0;
      lastGridState = JSON.parse(JSON.stringify(grid));
      // Reset pattern if we successfully made a move
      movePattern = [];
      patternIndex = 0;
    }

    // Dynamically adjust weights based on game state
    const maxTile = Math.max(...grid.flat().filter((n) => !isNaN(n)));
    if (maxTile !== highestTile) {
      highestTile = maxTile;

      // Adjust strategy based on highest tile
      if (maxTile >= 1024) {
        // Late game: focus on structure
        emptyWeight = 250;
        mergeWeight = 650;
        monotonicityWeight = 60;
        cornerWeight = 40;
        smoothnessWeight = 30;
        chainWeight = 50;
        if (DEBUG) console.log(`Late game weights (highest: ${maxTile})`);
      } else if (maxTile >= 512) {
        // Mid-late game
        emptyWeight = 270;
        mergeWeight = 700;
        monotonicityWeight = 55;
        cornerWeight = 35;
        smoothnessWeight = 25;
        chainWeight = 45;
        if (DEBUG) console.log(`Mid-late game weights (highest: ${maxTile})`);
      } else if (maxTile >= 256) {
        // Mid game
        emptyWeight = 290;
        mergeWeight = 750;
        monotonicityWeight = 50;
        cornerWeight = 30;
        smoothnessWeight = 20;
        chainWeight = 40;
        if (DEBUG) console.log(`Mid game weights (highest: ${maxTile})`);
      } else {
        // Early game: maximize merges and empty cells
        emptyWeight = 300;
        mergeWeight = 800;
        monotonicityWeight = 40;
        cornerWeight = 20;
        smoothnessWeight = 15;
        chainWeight = 35;
        if (DEBUG) console.log(`Early game weights (highest: ${maxTile})`);
      }
    }

    // Check for deadlock situations
    const potentialDeadlock = detectDeadlock(grid);

    // Determine look-ahead depth based on empty cells and game state
    const emptyCells = grid.flat().filter((cell) => cell === 0).length;
    let lookAheadDepth = 5; // Default

    if (potentialDeadlock) {
      lookAheadDepth = 8; // Crisis mode
      if (DEBUG)
        console.log("DEADLOCK RISK DETECTED! Increasing search depth.");
    } else if (emptyCells <= 2) {
      lookAheadDepth = 7; // Critical situation
    } else if (emptyCells <= 4) {
      lookAheadDepth = 6; // Very few empty cells
    } else if (emptyCells >= 10) {
      lookAheadDepth = 4; // Many empty cells
    }

    // Simulate and score each possible move with enhanced lookahead
    const validMoves = [];
    let moveSequence = [];

    for (const move of moves) {
      const result = simulateMove(grid, move.direction);
      if (result.moved) {
        try {
          // Use full minimax evaluation with alpha-beta pruning
          const evaluation = lookAheadEvaluation(
            result.grid,
            lookAheadDepth,
            -Infinity,
            Infinity,
            false, // Max player just moved, now it's min player's turn
            lookAheadDepth
          );

          validMoves.push({
            ...move,
            score: evaluation.score,
            moves: [move.direction, ...evaluation.moves],
          });

          if (DEBUG && moveCount % 10 === 0) {
            console.log(`Move ${move.direction}: Score ${evaluation.score}`);
          }
        } catch (e) {
          if (DEBUG) console.error("Error in evaluation:", e);
          // Fallback to basic evaluation
          validMoves.push({
            ...move,
            score: evaluateGrid(result.grid),
            moves: [move.direction],
          });
        }
      }
    }

    if (validMoves.length === 0) {
      if (DEBUG) console.log("No valid moves found.");
      return null;
    }

    // Sort by score (highest first)
    validMoves.sort((a, b) => b.score - a.score);

    // Apply advanced heuristics to avoid getting stuck
    if (validMoves.length > 1) {
      // If the first two moves are very close in score, sometimes choose the second one
      const scoreDiff = validMoves[0].score - validMoves[1].score;
      const relativeDiff =
        scoreDiff / Math.max(1, Math.abs(validMoves[0].score));

      // If scores are within 5% and we've been stuck recently, try alternative
      if (relativeDiff < 0.05 && stuckCounter > 0) {
        if (DEBUG)
          console.log("Choosing second-best move to avoid local optimum");
        moveSequence = validMoves[1].moves;
        return validMoves[1].action;
      }

      // If we're in a potential deadlock, be more willing to try alternatives
      if (potentialDeadlock && validMoves.length >= 3) {
        // Check if the third move offers a significantly different approach
        const thirdScoreDiff = validMoves[0].score - validMoves[2].score;
        const thirdRelativeDiff =
          thirdScoreDiff / Math.max(1, Math.abs(validMoves[0].score));

        if (thirdRelativeDiff < 0.15) {
          if (DEBUG) console.log("DEADLOCK AVOIDANCE: Trying third-best move");
          moveSequence = validMoves[2].moves;
          return validMoves[2].action;
        }
      }

      // Once in a while, pick a suboptimal move to explore new possibilities
      if (Math.random() < 0.02 && moveCount > 50) {
        const randomIndex = Math.floor(
          Math.random() * Math.min(3, validMoves.length)
        );
        if (DEBUG) console.log("Randomly exploring alternative move");
        moveSequence = validMoves[randomIndex].moves;
        return validMoves[randomIndex].action;
      }
    }

    // For debugging: show planned move sequence
    if (DEBUG && moveCount % 20 === 0) {
      console.log(
        "Planned moves:",
        validMoves[0].moves.slice(0, 3).join(" → ")
      );
    }

    // Return the action for the best move
    moveSequence = validMoves[0].moves;
    return validMoves[0].action;
  }

  // Main game loop with adaptive timing
  function gameStep() {
    if (!gameRunning) return;

    const startTime = Date.now();
    try {
      // Check if game is over
      if (isGameOver()) {
        const score =
          document.querySelector(".score-container")?.textContent || "Unknown";
        console.log(
          `%cGame over! Final score: ${score}`,
          "color: green; font-weight: bold;"
        );
        console.log(`Total moves: ${moveCount}`);
        console.log(`Highest tile: ${highestTile}`);
        console.log(`Maximum search depth reached: ${maxDepthReached}`);
        q();
        return;
      }

      // Get the next move
      const nextMove = decideNextMove();

      if (nextMove) {
        nextMove();
        updatePerformance(true, maxDepthReached, startTime);
        moveCount++;

        // Update highest tile
        const grid = getGameState();
        if (grid) {
          const maxTile = Math.max(...grid.flat().filter((n) => !isNaN(n)));
          if (maxTile > highestTile) {
            highestTile = maxTile;
            console.log(`New highest tile: ${highestTile}`);

            // If we've achieved 2048, celebrate but keep playing
            if (maxTile >= 2048 && maxTile < 4096) {
              console.log("🎉🎉🎉 REACHED 2048 TILE! 🎉🎉🎉");
              // Adjust weights to preserve the structure
              emptyWeight = 250;
              mergeWeight = 700;
              monotonicityWeight = 60;
              cornerWeight = 40;
              smoothnessWeight = 30;
              chainWeight = 50;
            } else if (maxTile >= 4096) {
              console.log("🏆🏆🏆 AMAZING! REACHED 4096 TILE! 🏆🏆🏆");
              // Special weights for ultra-high scores
              emptyWeight = 230;
              mergeWeight = 650;
              monotonicityWeight = 70;
              cornerWeight = 50;
              smoothnessWeight = 35;
              chainWeight = 60;
            }
          }
        }

        if (moveCount % 100 === 0) {
          console.log(
            `Moves played: ${moveCount}, Highest tile: ${highestTile}, Pattern: ${currentPattern}`
          );
          console.log(
            `Target corner: Row ${targetCorner.row}, Col ${targetCorner.col}`
          );
        }

        // Adaptive timing based on game state
        let delay = 10; // Default fast pace

        // Slow down when board is getting more complex
        const currentGrid = getGameState();
        if (currentGrid) {
          const emptyCount = currentGrid
            .flat()
            .filter((cell) => cell === 0).length;
          const maxTile = Math.max(
            ...currentGrid.flat().filter((n) => !isNaN(n))
          );

          // Be more careful when high tiles exist or few empty spaces
          if (maxTile >= 2048 || emptyCount <= 2) {
            delay = 100; // Very slow for critical situations
          } else if (maxTile >= 1024 || emptyCount <= 4) {
            delay = 60; // Slower for challenging situations
          } else if (maxTile >= 512 || emptyCount <= 6) {
            delay = 30; // Medium speed
          }
        }

        setTimeout(gameStep, PERFORMANCE.moveDelay);
      } else {
        updatePerformance(false, 0, startTime);
        console.log("No valid moves found - game may be stuck.");
        // Try one more time after a delay
        setTimeout(() => {
          // Try random move as last resort
          const randomMove = [u, d, l, r][Math.floor(Math.random() * 4)];
          randomMove();
          moveCount++;
          setTimeout(gameStep, 100);
        }, 250);
      }
    } catch (e) {
      console.error("Error in game loop:", e);
      updatePerformance(false, 0, startTime);
      q();
    }
  }

  // Function to start auto-play
  function s() {
    // start
    if (gameRunning) {
      q();
    }

    console.log("🎮 AI playing 2048...");
    moveCount = 0;
    lastGridState = null;
    stuckCounter = 0;
    gameRunning = true;
    highestTile = 0;
    movePattern = [];
    patternIndex = 0;
    currentPattern = "snake";

    // Reset weights to defaults
    monotonicityWeight = 47.0;
    emptyWeight = 270.0;
    mergeWeight = 700.0;
    cornerWeight = 20.0;
    smoothnessWeight = 20.0;
    chainWeight = 30.0;

    // Reset performance tracking
    PERFORMANCE.startTime = Date.now();
    PERFORMANCE.moveCount = 0;
    PERFORMANCE.moveHistory = [];
    PERFORMANCE.highestTile = 0;
    PERFORMANCE.avgMoveTime = 0;
    updateLiveStats();

    // Start the game loop with initial delay
    setTimeout(gameStep, 100);
    return "Bot started!";
  }

  // Function to stop auto-play
  function q() {
    // quit
    gameRunning = false;
    console.log(
      `%cAuto-play stopped after ${moveCount} moves. Highest tile: ${highestTile}`,
      "color: blue; font-weight: bold;"
    );
    return "Bot stopped!";
  }

  // Function to restart the game and begin playing again
  function n() {
    // new game
    const restartButton = document.querySelector(".restart-button");
    if (restartButton) {
      restartButton.click();
      setTimeout(s, 500); // Start playing after a short delay
      return "Game restarted!";
    } else {
      console.log("Restart button not found.");
      return "Restart button not found.";
    }
  }

  // Debug function
  function i() {
    // info
    const grid = getGameState();
    if (grid) {
      console.log("Current grid state:");
      console.table(grid);
      console.log(`Moves played: ${moveCount}`);
      console.log(`Highest tile: ${highestTile}`);
      console.log(`Current pattern: ${currentPattern}`);

      // Compute and show evaluation score
      const score = evaluateGrid(grid);
      console.log(`Current evaluation score: ${score}`);

      // Show the best next move
      const moves = [
        { direction: "up", name: "UP" },
        { direction: "down", name: "DOWN" },
        { direction: "left", name: "LEFT" },
        { direction: "right", name: "RIGHT" },
      ];

      const validMoves = [];
      for (const move of moves) {
        const result = simulateMove(grid, move.direction);
        if (result.moved) {
          validMoves.push({
            ...move,
            score: evaluateGrid(result.grid),
            merges: result.score,
          });
        }
      }

      validMoves.sort((a, b) => b.score - a.score);
      console.log("Best moves:");
      validMoves.forEach((move, i) => {
        console.log(
          `${i + 1}. ${move.name} - Score: ${move.score}, Merges: ${
            move.merges
          }`
        );
      });

      return "Debug info printed to console";
    } else {
      return "Could not get game state.";
    }
  }

  // Set pattern function
  function p(pattern) {
    // pattern
    if (["corner", "snake", "spiral"].includes(pattern)) {
      currentPattern = pattern;
      console.log(`Manually switched to ${pattern} pattern`);
      return `Pattern set to ${pattern}`;
    } else {
      return "Invalid pattern. Use 'corner', 'snake', or 'spiral'";
    }
  }

  // Set weights function
  function w(weights) {
    // weights
    try {
      const parsed = JSON.parse(weights);
      if (parsed.monotonicity) monotonicityWeight = parsed.monotonicity;
      if (parsed.empty) emptyWeight = parsed.empty;
      if (parsed.merge) mergeWeight = parsed.merge;
      if (parsed.corner) cornerWeight = parsed.corner;
      if (parsed.smoothness) smoothnessWeight = parsed.smoothness;
      if (parsed.chain) chainWeight = parsed.chain;

      console.log("Weights updated:", {
        monotonicity: monotonicityWeight,
        empty: emptyWeight,
        merge: mergeWeight,
        corner: cornerWeight,
        smoothness: smoothnessWeight,
        chain: chainWeight,
      });

      return "Weights updated successfully";
    } catch (e) {
      return 'Invalid weight format. Use JSON format, e.g. \'{"empty":300,"merge":800}\'';
    }
  }

  // Expose single-letter control functions globally
  window.s = s; // start
  window.q = q; // quit/stop playing
  window.n = n; // new game
  window.i = i; // info/debug
  window.p = p; // set pattern
  window.w = w; // set weights

  // Movement functions
  window.u = u; // up
  window.d = d; // down
  window.l = l; // left
  window.r = r; // right

  // Speed control function
  window.setSpeed = function (speed) {
    if (typeof speed === "number") {
      PERFORMANCE.moveDelay = Math.max(0, speed);
      PERFORMANCE.speedSetting = "custom";
    } else if (SPEED_SETTINGS[speed]) {
      PERFORMANCE.moveDelay = SPEED_SETTINGS[speed];
      PERFORMANCE.speedSetting = speed;
    }
    console.log(
      `🚀 Speed set to ${PERFORMANCE.speedSetting} (${PERFORMANCE.moveDelay}ms delay)`
    );
  };

  // Performance monitoring
  function updatePerformance(moveSuccess, depth, startTime) {
    const moveTime = Date.now() - startTime;
    PERFORMANCE.moveCount++;
    PERFORMANCE.totalTime = Date.now() - PERFORMANCE.startTime;
    PERFORMANCE.avgMoveTime =
      (PERFORMANCE.avgMoveTime * (PERFORMANCE.moveCount - 1) + moveTime) /
      PERFORMANCE.moveCount;
    PERFORMANCE.moveHistory.push({
      success: moveSuccess,
      depth,
      time: moveTime,
    });

    // Update KPIs
    const recentMoves = PERFORMANCE.moveHistory.slice(-100);
    PERFORMANCE.kpi.movesPerSecond = (
      PERFORMANCE.moveCount /
      (PERFORMANCE.totalTime / 1000)
    ).toFixed(2);
    PERFORMANCE.kpi.successRate = (
      (recentMoves.filter((m) => m.success).length / recentMoves.length) *
      100
    ).toFixed(1);
    PERFORMANCE.kpi.averageDepth = (
      recentMoves.reduce((sum, m) => sum + m.depth, 0) / recentMoves.length
    ).toFixed(1);
    PERFORMANCE.kpi.efficiency = (
      PERFORMANCE.highestTile / Math.sqrt(PERFORMANCE.moveCount)
    ).toFixed(1);

    // Update live display
    updateLiveStats();
  }

  // Live stats display
  function updateLiveStats() {
    console.clear();
    console.log(
      "%c2048 AI Performance Monitor",
      "font-size: 14px; font-weight: bold; color: #2c3e50"
    );
    console.table({
      "Game Stats": {
        Moves: PERFORMANCE.moveCount,
        "Highest Tile": PERFORMANCE.highestTile,
        "Running Time": `${Math.floor(PERFORMANCE.totalTime / 1000)}s`,
        "Speed Mode": PERFORMANCE.speedSetting,
      },
      Performance: {
        "Moves/Second": PERFORMANCE.kpi.movesPerSecond,
        "Success Rate %": PERFORMANCE.kpi.successRate,
        "Avg Search Depth": PERFORMANCE.kpi.averageDepth,
        "Efficiency Score": PERFORMANCE.kpi.efficiency,
      },
    });
  }

  console.log("2048 AI loaded! Use these single-letter commands:");
  console.log("%c• s() - Start playing", "color: green");
  console.log("%c• q() - Quit/stop playing", "color: red");
  console.log("%c• n() - New game", "color: blue");
  console.log("%c• i() - Show info/debug", "color: purple");
  console.log(
    "%c• p('pattern') - Change pattern (corner, snake, spiral)",
    "color: orange"
  );
  console.log("%c• w('{\"empty\":300}') - Update weights", "color: cyan");
  console.log("%c• u(), d(), l(), r() - Manual moves", "color: magenta");
  console.log(
    "%c• setSpeed('turbo'|'fast'|'normal'|'slow'|number) - Control speed",
    "color: brown"
  );

  // Start auto-playing immediately
  s();

  return "2048 AI initialized!";
})();
