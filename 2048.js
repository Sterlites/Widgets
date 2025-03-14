// AI Script to play 2048 at https://2048game.com/ via console 
(function() {
    // Debug mode
    const DEBUG = false;
    
    // Game state tracking
    let gameRunning = true;
    let lastGridState = null;
    let stuckCounter = 0;
    let moveCount = 0;
    let highestTile = 0;
    let movePattern = [];
    let patternIndex = 0;
    let monotonicityWeight = 47.0;
    let emptyWeight = 270.0;
    let mergeWeight = 700.0;
    let cornerWeight = 20.0;
    let smoothnessWeight = 20.0;
    let chainWeight = 30.0;
    
    // Enhanced pattern strategies
    const patterns = {
        snake: [
            [15, 14, 13, 12],
            [8,  9,  10, 11],
            [7,  6,  5,  4],
            [0,  1,  2,  3]
        ],
        corner: [
            [0,  1,  2,  3],
            [1,  2,  3,  4],
            [2,  3,  4,  5],
            [3,  4,  5,  6]
        ],
        spiral: [
            [0,  1,  2,  3],
            [11, 12, 13, 4],
            [10, 15, 14, 5],
            [9,  8,  7,  6]
        ]
    };
    
    // Current pattern
    let currentPattern = 'snake';
    
    // Function to get the current game state from the DOM
    function getGameState() {
        const tiles = document.querySelectorAll('.tile');
        if (!tiles || tiles.length === 0) {
            if (DEBUG) console.error("No tiles found - make sure the game has started");
            return null;
        }
        
        // Create 4x4 grid filled with zeros
        let grid = Array(4).fill().map(() => Array(4).fill(0));
        
        // Fill grid with tile values
        for (const tile of tiles) {
            // Skip tiles that are in the process of being removed
            if (tile.classList.contains('tile-merged')) continue;
            
            // Extract position and value from class names
            const classList = Array.from(tile.classList);
            const posClass = classList.find(c => c.startsWith('tile-position-'));
            const valueClass = classList.find(c => c.startsWith('tile-') && !c.startsWith('tile-position-'));
            
            if (posClass && valueClass) {
                const [x, y] = posClass.replace('tile-position-', '').split('-').map(n => parseInt(n) - 1);
                const value = parseInt(valueClass.replace('tile-', ''));
                
                if (!isNaN(x) && !isNaN(y) && !isNaN(value) && x >= 0 && x < 4 && y >= 0 && y < 4) {
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
    function u() { // up
        const event = new KeyboardEvent('keydown', { 
            key: 'ArrowUp', keyCode: 38, which: 38, code: 'ArrowUp', bubbles: true
        });
        document.dispatchEvent(event);
        if (DEBUG) console.log("Move: UP");
    }
    
    function d() { // down
        const event = new KeyboardEvent('keydown', { 
            key: 'ArrowDown', keyCode: 40, which: 40, code: 'ArrowDown', bubbles: true
        });
        document.dispatchEvent(event);
        if (DEBUG) console.log("Move: DOWN");
    }
    
    function l() { // left
        const event = new KeyboardEvent('keydown', { 
            key: 'ArrowLeft', keyCode: 37, which: 37, code: 'ArrowLeft', bubbles: true
        });
        document.dispatchEvent(event);
        if (DEBUG) console.log("Move: LEFT");
    }
    
    function r() { // right
        const event = new KeyboardEvent('keydown', { 
            key: 'ArrowRight', keyCode: 39, which: 39, code: 'ArrowRight', bubbles: true
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
            if (!grid1[y] || !grid2[y] || grid1[y].length !== 4 || grid2[y].length !== 4) {
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
        let filtered = tiles.filter(val => val !== 0);
        
        // Merge adjacent identical tiles
        for (let i = 0; i < filtered.length - 1; i++) {
            if (filtered[i] === filtered[i+1]) {
                filtered[i] *= 2;
                filtered[i+1] = 0;
            }
        }
        
        // Filter zeros again
        filtered = filtered.filter(val => val !== 0);
        
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
            if (direction === 'up') {
                for (let col = 0; col < 4; col++) {
                    const column = [gridCopy[0][col], gridCopy[1][col], gridCopy[2][col], gridCopy[3][col]];
                    const originalColumn = [...column];
                    const newColumn = processTiles(column);
                    
                    for (let row = 0; row < 4; row++) {
                        if (gridCopy[row][col] !== newColumn[row]) {
                            moved = true;
                            // If two tiles merged, add to score
                            if (newColumn[row] > originalColumn[row] && newColumn[row] !== 0) {
                                score += newColumn[row];
                            }
                        }
                        gridCopy[row][col] = newColumn[row];
                    }
                }
            } else if (direction === 'down') {
                for (let col = 0; col < 4; col++) {
                    const column = [gridCopy[3][col], gridCopy[2][col], gridCopy[1][col], gridCopy[0][col]];
                    const originalColumn = [...column];
                    const newColumn = processTiles(column);
                    
                    for (let row = 0; row < 4; row++) {
                        if (gridCopy[3-row][col] !== newColumn[row]) {
                            moved = true;
                            // If two tiles merged, add to score
                            if (newColumn[row] > originalColumn[row] && newColumn[row] !== 0) {
                                score += newColumn[row];
                            }
                        }
                        gridCopy[3-row][col] = newColumn[row];
                    }
                }
            } else if (direction === 'left') {
                for (let row = 0; row < 4; row++) {
                    const originalRow = [...gridCopy[row]];
                    gridCopy[row] = processTiles(gridCopy[row]);
                    
                    for (let col = 0; col < 4; col++) {
                        if (originalRow[col] !== gridCopy[row][col]) {
                            moved = true;
                            // If two tiles merged, add to score
                            if (gridCopy[row][col] > originalRow[col] && gridCopy[row][col] !== 0) {
                                score += gridCopy[row][col];
                            }
                        }
                    }
                }
            } else if (direction === 'right') {
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
    
    // Advanced grid evaluation
    function evaluateGrid(grid) {
        if (!grid) return -Infinity;
        
        try {
            // 1. Count empty cells
            const emptyCells = grid.flat().filter(cell => cell === 0).length;
            let emptyScore = emptyCells * emptyWeight;
            
            // 2. Calculate monotonicity (prefer organized tiles)
            let monotonicity = 0;
            
            // Apply pattern weights
            let patternScore = 0;
            const patternWeights = patterns[currentPattern];
            
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    if (grid[row][col] > 0) {
                        patternScore += grid[row][col] * Math.pow(2, patternWeights[row][col]/2);
                    }
                }
            }
            
            // Check monotonicity in all directions
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 3; col++) {
                    if (grid[row][col] > 0 && grid[row][col+1] > 0) {
                        // For the snake pattern, we want decreasing values in odd rows
                        // and increasing values in even rows
                        if (currentPattern === 'snake') {
                            if (row % 2 === 0) { // Even rows: left to right
                                monotonicity += grid[row][col] >= grid[row][col+1] ? 
                                    grid[row][col] : -grid[row][col];
                            } else { // Odd rows: right to left
                                monotonicity += grid[row][col] <= grid[row][col+1] ? 
                                    grid[row][col+1] : -grid[row][col+1];
                            }
                        } else {
                            // For other patterns, we generally want decreasing values from the max
                            monotonicity += grid[row][col] >= grid[row][col+1] ? 
                                grid[row][col] : -grid[row][col];
                        }
                    }
                }
            }
            
            for (let col = 0; col < 4; col++) {
                for (let row = 0; row < 3; row++) {
                    if (grid[row][col] > 0 && grid[row+1][col] > 0) {
                        // For all patterns, we generally want decreasing values from top to bottom
                        monotonicity += grid[row][col] >= grid[row+1][col] ? 
                            grid[row][col] : -grid[row][col];
                    }
                }
            }
            
            // 3. Calculate smoothness (prefer adjacent tiles with similar values)
            let smoothness = 0;
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    if (grid[row][col] > 0) {
                        // Check right neighbor
                        if (col < 3 && grid[row][col+1] > 0) {
                            smoothness -= Math.abs(Math.log2(grid[row][col]) - Math.log2(grid[row][col+1]));
                        }
                        // Check bottom neighbor
                        if (row < 3 && grid[row+1][col] > 0) {
                            smoothness -= Math.abs(Math.log2(grid[row][col]) - Math.log2(grid[row+1][col]));
                        }
                    }
                }
            }
            
            // 4. Calculate mergeability (potential for merges)
            let merges = 0;
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 3; col++) {
                    if (grid[row][col] > 0 && grid[row][col] === grid[row][col+1]) {
                        merges += grid[row][col];
                    }
                }
            }
            
            for (let col = 0; col < 4; col++) {
                for (let row = 0; row < 3; row++) {
                    if (grid[row][col] > 0 && grid[row][col] === grid[row+1][col]) {
                        merges += grid[row][col];
                    }
                }
            }
            
            // 5. Calculate corner presence (prefer high values in corners)
            let cornerScore = 0;
            // Focus on bottom-right corner
            const corners = [
                {row: 0, col: 0},
                {row: 0, col: 3},
                {row: 3, col: 0},
                {row: 3, col: 3}
            ];
            
            // Find highest value and its position
            let maxVal = 0;
            let maxRow = -1;
            let maxCol = -1;
            
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    if (grid[row][col] > maxVal) {
                        maxVal = grid[row][col];
                        maxRow = row;
                        maxCol = col;
                    }
                }
            }
            
            // Check if highest value is in a corner
            for (const corner of corners) {
                if (corner.row === maxRow && corner.col === maxCol) {
                    cornerScore += maxVal * 2;
                    
                    // Check for decreasing values from this corner
                    const rowDir = corner.row === 0 ? 1 : -1;
                    const colDir = corner.col === 0 ? 1 : -1;
                    
                    let chainScore = 0;
                    let expectedValue = maxVal;
                    
                    // Check row chain
                    for (let c = maxCol, steps = 0; c >= 0 && c < 4 && steps < 3; c += colDir, steps++) {
                        expectedValue = expectedValue / 2;
                        if (grid[maxRow][c] > 0 && grid[maxRow][c] <= expectedValue) {
                            chainScore += grid[maxRow][c];
                        } else if (grid[maxRow][c] > expectedValue) {
                            chainScore -= grid[maxRow][c] / 2;
                        }
                    }
                    
                    // Reset expected value for column chain
                    expectedValue = maxVal;
                    
                    // Check column chain
                    for (let r = maxRow, steps = 0; r >= 0 && r < 4 && steps < 3; r += rowDir, steps++) {
                        expectedValue = expectedValue / 2;
                        if (grid[r][maxCol] > 0 && grid[r][maxCol] <= expectedValue) {
                            chainScore += grid[r][maxCol];
                        } else if (grid[r][maxCol] > expectedValue) {
                            chainScore -= grid[r][maxCol] / 2;
                        }
                    }
                    
                    cornerScore += chainScore * chainWeight / 100;
                }
            }
            
            // 6. Special penalty for high values in wrong positions
            let positionalPenalty = 0;
            const maxTile = Math.max(...grid.flat().filter(n => !isNaN(n)));
            
            if (maxTile >= 128) {
                // For a snake pattern, penalize high values not following the pattern
                if (currentPattern === 'snake') {
                    for (let row = 0; row < 4; row++) {
                        for (let col = 0; col < 4; col++) {
                            if (grid[row][col] >= maxTile / 2) {
                                // Check if this high value is not in optimal position based on pattern
                                const optimalPositionWeight = patternWeights[row][col];
                                if (optimalPositionWeight < 10) { // Lower weight in pattern means less optimal
                                    positionalPenalty -= grid[row][col] * (15 - optimalPositionWeight) / 5;
                                }
                            }
                        }
                    }
                } else if (currentPattern === 'corner') {
                    // For corner pattern, heavily penalize high values not in or adjacent to corner
                    const targetCorner = {row: 3, col: 3}; // Bottom-right default
                    
                    for (let row = 0; row < 4; row++) {
                        for (let col = 0; col < 4; col++) {
                            if (grid[row][col] >= maxTile / 2) {
                                const distanceFromCorner = Math.abs(row - targetCorner.row) + Math.abs(col - targetCorner.col);
                                if (distanceFromCorner > 1) { // Not in or adjacent to corner
                                    positionalPenalty -= grid[row][col] * distanceFromCorner;
                                }
                            }
                        }
                    }
                }
            }
            
            // Combine all factors with appropriate weights
            const totalScore = 
                patternScore + 
                monotonicity * monotonicityWeight / 100 + 
                emptyScore + 
                merges * mergeWeight / 100 + 
                cornerScore * cornerWeight / 10 + 
                smoothness * smoothnessWeight / 10 +
                positionalPenalty;
            
            return totalScore;
            
        } catch (e) {
            if (DEBUG) console.error("Error in evaluateGrid:", e);
            return -Infinity;
        }
    }
    
    // Advanced look-ahead with pruning
    function lookAheadEvaluation(grid, depth, alpha, beta, maximizingPlayer) {
        if (!grid || depth <= 0) {
            return evaluateGrid(grid);
        }
        
        if (maximizingPlayer) {
            let maxScore = -Infinity;
            const directions = ['up', 'down', 'left', 'right'];
            
            // Try each direction
            for (const direction of directions) {
                const { grid: nextGrid, moved } = simulateMove(grid, direction);
                if (moved) {
                    const score = lookAheadEvaluation(nextGrid, depth - 1, alpha, beta, false);
                    maxScore = Math.max(maxScore, score);
                    alpha = Math.max(alpha, score);
                    
                    // Alpha-beta pruning
                    if (beta <= alpha) break;
                }
            }
            
            return maxScore === -Infinity ? evaluateGrid(grid) : maxScore;
        } else {
            // Simulating the computer's turn (tile spawn)
            let minScore = Infinity;
            const emptyCells = [];
            
            // Find all empty cells
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    if (grid[row][col] === 0) {
                        emptyCells.push({row, col});
                    }
                }
            }
            
            if (emptyCells.length === 0) {
                return evaluateGrid(grid);
            }
            
            // Only sample a subset of possible spawn positions for performance
            const sampleSize = Math.min(3, emptyCells.length);
            const sampledCells = [];
            
            // Take a few random samples
            for (let i = 0; i < sampleSize; i++) {
                const randomIndex = Math.floor(Math.random() * emptyCells.length);
                sampledCells.push(emptyCells[randomIndex]);
                emptyCells.splice(randomIndex, 1);
            }
            
            // Try spawning 2 and 4 tiles at each position
            for (const cell of sampledCells) {
                const { row, col } = cell;
                
                // Try with 2 (90% probability)
                const gridWith2 = JSON.parse(JSON.stringify(grid));
                gridWith2[row][col] = 2;
                let scoreWith2 = lookAheadEvaluation(gridWith2, depth - 1, alpha, beta, true);
                
                // Try with 4 (10% probability)
                const gridWith4 = JSON.parse(JSON.stringify(grid));
                gridWith4[row][col] = 4;
                let scoreWith4 = lookAheadEvaluation(gridWith4, depth - 1, alpha, beta, true);
                
                // Weighted average based on spawn probabilities
                const combinedScore = 0.9 * scoreWith2 + 0.1 * scoreWith4;
                minScore = Math.min(minScore, combinedScore);
                beta = Math.min(beta, combinedScore);
                
                // Alpha-beta pruning
                if (beta <= alpha) break;
            }
            
            return minScore === Infinity ? evaluateGrid(grid) : minScore;
        }
    }
    
    // Function to decide the next move with advanced algorithms
    function decideNextMove() {
        const grid = getGameState();
        if (!grid) {
            if (DEBUG) console.warn("Could not get game state");
            return null;
        }
        
        const moves = [
            { direction: 'up', action: u },
            { direction: 'down', action: d },
            { direction: 'left', action: l },
            { direction: 'right', action: r }
        ];
        
        // Check if grid has changed since last move
        if (lastGridState && areGridsEqual(grid, lastGridState)) {
            stuckCounter++;
            if (stuckCounter > 3) {
                if (DEBUG) console.log("Grid hasn't changed - trying pattern-based move");
                // Use predefined move patterns to break out of local minima
                if (movePattern.length === 0) {
                    // Define pattern based on current highest tile position
                    let highestTilePos = {row: -1, col: -1};
                    let highestValue = 0;
                    
                    for (let row = 0; row < 4; row++) {
                        for (let col = 0; col < 4; col++) {
                            if (grid[row][col] > highestValue) {
                                highestValue = grid[row][col];
                                highestTilePos = {row, col};
                            }
                        }
                    }
                    
                    // Different patterns based on highest tile position
                    if (highestTilePos.row === 3 && highestTilePos.col === 3) {
                        // Bottom-right: prioritize up, then left
                        movePattern = ['up', 'left', 'up', 'right', 'down', 'left'];
                    } else if (highestTilePos.row === 3 && highestTilePos.col === 0) {
                        // Bottom-left: prioritize up, then right
                        movePattern = ['up', 'right', 'up', 'left', 'down', 'right'];
                    } else if (highestTilePos.row === 0 && highestTilePos.col === 3) {
                        // Top-right: prioritize down, then left
                        movePattern = ['down', 'left', 'down', 'right', 'up', 'left'];
                    } else if (highestTilePos.row === 0 && highestTilePos.col === 0) {
                        // Top-left: prioritize down, then right
                        movePattern = ['down', 'right', 'down', 'left', 'up', 'right'];
                    } else {
                        // Generic pattern
                        movePattern = ['up', 'right', 'down', 'left', 'up', 'right', 'down', 'left'];
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
        
        // Dynamically adjust pattern strategy based on game state
        const maxTile = Math.max(...grid.flat().filter(n => !isNaN(n)));
        if (maxTile !== highestTile) {
            highestTile = maxTile;
            
            // Find max tile position
            let maxRow = -1, maxCol = -1;
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    if (grid[row][col] === maxTile) {
                        maxRow = row;
                        maxCol = col;
                    }
                }
            }
            
            // Adjust strategy based on max tile position
            if ((maxRow === 3 && maxCol === 3) || (maxRow === 0 && maxCol === 0)) {
                currentPattern = 'corner';
                if (DEBUG) console.log(`Switching to corner pattern (highest: ${maxTile})`);
            } else if (maxTile >= 512) {
                currentPattern = 'snake';
                if (DEBUG) console.log(`Switching to snake pattern (highest: ${maxTile})`);
            } else if (maxTile <= 128) {
                // Early game: maximize merges and empty cells
                emptyWeight = 300;
                mergeWeight = 800;
                monotonicityWeight = 30;
                if (DEBUG) console.log(`Early game weights (highest: ${maxTile})`);
            } else if (maxTile <= 512) {
                // Mid game: focus on structure
                emptyWeight = 250;
                mergeWeight = 700;
                monotonicityWeight = 47;
                cornerWeight = 25;
                if (DEBUG) console.log(`Mid game weights (highest: ${maxTile})`);
            } else {
                // Late game: focus on maintaining pattern
                emptyWeight = 200;
                mergeWeight = 600;
                monotonicityWeight = 60;
                cornerWeight = 30;
                smoothnessWeight = 30;
                if (DEBUG) console.log(`Late game weights (highest: ${maxTile})`);
            }
        }
        
        // Determine look-ahead depth based on empty cells
        const emptyCells = grid.flat().filter(cell => cell === 0).length;
        let lookAheadDepth = 4; // Default
        
        if (emptyCells <= 2) {
            lookAheadDepth = 6; // Critical situation, look deeper
        } else if (emptyCells <= 5) {
            lookAheadDepth = 5; // Few empty cells, look deeper
        } else if (emptyCells >= 10) {
            lookAheadDepth = 3; // Many empty cells, can be more shallow
        }
        
        // Simulate and score each possible move with enhanced lookahead
        const validMoves = [];
        
        for (const move of moves) {
            const result = simulateMove(grid, move.direction);
            if (result.moved) {
                // Use minimax evaluation with alpha-beta pruning
                const score = lookAheadEvaluation(
                    result.grid, 
                    lookAheadDepth, 
                    -Infinity, 
                    Infinity, 
                    false // Max player just moved, now it's min player's turn
                );
                validMoves.push({ ...move, score });
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
          // If the first two moves are very close in score, sometimes choose the second one
          const scoreDiff = validMoves[0].score - validMoves[1].score;
          const relativeDiff = scoreDiff / Math.max(1, validMoves[0].score);
          
          // If scores are within 10% and we've been stuck recently, try alternative
          if (relativeDiff < 0.1 && stuckCounter > 0) {
              if (DEBUG) console.log("Choosing second-best move to avoid local optimum");
              return validMoves[1].action;
          }
          
          // Once in a while, pick a suboptimal move to explore new possibilities
          if (Math.random() < 0.03 && moveCount > 100) {
              const randomIndex = Math.floor(Math.random() * validMoves.length);
              if (DEBUG) console.log("Randomly exploring alternative move");
              return validMoves[randomIndex].action;
          }
      }
      
      // Return the action for the best move
      return validMoves[0].action;
  }
  
  // Main game loop with adaptive timing
  function gameStep() {
      if (!gameRunning) return;
      
      try {
          // Check if game is over
          if (isGameOver()) {
              const score = document.querySelector(".score-container")?.textContent || "Unknown";
              console.log(`%cGame over! Final score: ${score}`, "color: green; font-weight: bold;");
              console.log(`Total moves: ${moveCount}`);
              console.log(`Highest tile: ${highestTile}`);
              q();
              return;
          }
          
          // Get the next move
          const nextMove = decideNextMove();
          
          if (nextMove) {
              nextMove();
              moveCount++;
              
              // Update highest tile
              const grid = getGameState();
              if (grid) {
                  const maxTile = Math.max(...grid.flat().filter(n => !isNaN(n)));
                  if (maxTile > highestTile) {
                      highestTile = maxTile;
                      console.log(`New highest tile: ${highestTile}`);
                      
                      // If we've achieved 2048, slow down and try to maintain it
                      if (maxTile >= 2048) {
                          console.log("🎉 Reached 2048 tile! Trying to maintain it...");
                          // Adjust weights to preserve the 2048 tile
                          emptyWeight = 300;
                          mergeWeight = 900;
                          monotonicityWeight = 50;
                          cornerWeight = 30;
                      }
                  }
              }
              
              if (moveCount % 100 === 0) {
                  console.log(`Moves played: ${moveCount}, Highest tile: ${highestTile}, Pattern: ${currentPattern}`);
              }
              
              // Adaptive timing based on game state
              let delay = 10; // Default fast pace
              
              // Slow down when board is getting more complex
              const currentGrid = getGameState();
              if (currentGrid) {
                  const emptyCount = currentGrid.flat().filter(cell => cell === 0).length;
                  const maxTile = Math.max(...currentGrid.flat().filter(n => !isNaN(n)));
                  
                  // Be more careful when high tiles exist or few empty spaces
                  if (maxTile >= 1024 || emptyCount <= 3) {
                      delay = 50; // Slower for critical situations
                  } else if (maxTile >= 512 || emptyCount <= 6) {
                      delay = 30; // Medium speed for challenging situations
                  }
              }
              
              setTimeout(gameStep, delay);
          } else {
              console.log("No valid moves found - game may be stuck.");
              // Try one more time after a delay
              setTimeout(() => {
                  const nextMove = decideNextMove();
                  if (nextMove) {
                      nextMove();
                      moveCount++;
                      setTimeout(gameStep, 100);
                  } else {
                      q();
                  }
              }, 250);
          }
      } catch (e) {
          console.error("Error in game loop:", e);
          q();
      }
  }
  
  // Function to start auto-play
  function s() { // start
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
      currentPattern = 'snake';
      
      // Reset weights to defaults
      monotonicityWeight = 47.0;
      emptyWeight = 270.0;
      mergeWeight = 700.0;
      cornerWeight = 20.0;
      smoothnessWeight = 20.0;
      chainWeight = 30.0;
      
      // Start the game loop with initial delay
      setTimeout(gameStep, 100);
      return "Bot started!";
  }
  
  // Function to stop auto-play
  function q() { // quit
      gameRunning = false;
      console.log(`%cAuto-play stopped after ${moveCount} moves. Highest tile: ${highestTile}`, "color: blue; font-weight: bold;");
      return "Bot stopped!";
  }
  
  // Function to restart the game and begin playing again
  function n() { // new game
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
  function i() { // info
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
              { direction: 'up', name: 'UP' },
              { direction: 'down', name: 'DOWN' },
              { direction: 'left', name: 'LEFT' },
              { direction: 'right', name: 'RIGHT' }
          ];
          
          const validMoves = [];
          for (const move of moves) {
              const result = simulateMove(grid, move.direction);
              if (result.moved) {
                  validMoves.push({ 
                      ...move, 
                      score: evaluateGrid(result.grid),
                      merges: result.score
                  });
              }
          }
          
          validMoves.sort((a, b) => b.score - a.score);
          console.log("Best moves:");
          validMoves.forEach((move, i) => {
              console.log(`${i+1}. ${move.name} - Score: ${move.score}, Merges: ${move.merges}`);
          });
          
          return "Debug info printed to console";
      } else {
          return "Could not get game state.";
      }
  }
  
  // Set pattern function
  function p(pattern) { // pattern
      if (['corner', 'snake', 'spiral'].includes(pattern)) {
          currentPattern = pattern;
          console.log(`Manually switched to ${pattern} pattern`);
          return `Pattern set to ${pattern}`;
      } else {
          return "Invalid pattern. Use 'corner', 'snake', or 'spiral'";
      }
  }
  
  // Set weights function
  function w(weights) { // weights
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
              chain: chainWeight
          });
          
          return "Weights updated successfully";
      } catch (e) {
          return "Invalid weight format. Use JSON format, e.g. '{\"empty\":300,\"merge\":800}'";
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
  
  console.log("2048 AI loaded! Use these single-letter commands:");
  console.log("%c• s() - Start playing", "color: green");
  console.log("%c• q() - Quit/stop playing", "color: red");
  console.log("%c• n() - New game", "color: blue");
  console.log("%c• i() - Show info/debug", "color: purple");
  console.log("%c• p('pattern') - Change pattern (corner, snake, spiral)", "color: orange");
  console.log("%c• w('{\"empty\":300}') - Update weights", "color: cyan");
  console.log("%c• u(), d(), l(), r() - Manual moves", "color: magenta");
  
  // Start auto-playing immediately
  s();
  
  return "2048 AI initialized!";
})();