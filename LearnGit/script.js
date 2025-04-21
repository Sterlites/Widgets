document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const btnInit = document.getElementById('btn-init');
    const btnStatus = document.getElementById('btn-status');
    const btnLog = document.getElementById('btn-log');
    const btnCreateFile = document.getElementById('btn-create-file');
    const btnModifyFile = document.getElementById('btn-modify-file');
    const btnCreateConfig = document.getElementById('btn-create-config');
    const btnAddGitignore = document.getElementById('btn-add-gitignore');
    const btnAddIndex = document.getElementById('btn-add-index');
    const btnAddAll = document.getElementById('btn-add-all');
    const btnCommit = document.getElementById('btn-commit');
    const btnCommitAm = document.getElementById('btn-commit-am');
    const btnDiff = document.getElementById('btn-diff');
    const btnBranchFeature = document.getElementById('btn-branch-feature');
    const btnCheckoutFeature = document.getElementById('btn-checkout-feature');
    const btnCheckoutMain = document.getElementById('btn-checkout-main');
    const btnCheckoutCommit = document.getElementById('btn-checkout-commit');
    const btnMergeFeature = document.getElementById('btn-merge-feature');
    const btnRebaseMain = document.getElementById('btn-rebase-main');
    const btnClone = document.getElementById('btn-clone');
    const btnRemoteAdd = document.getElementById('btn-remote-add');
    const btnPush = document.getElementById('btn-push');
    const btnPushFeatureUpstream = document.getElementById('btn-push-feature-upstream');
    const btnFetch = document.getElementById('btn-fetch');
    const btnPull = document.getElementById('btn-pull');
    const btnRemoteCommit = document.getElementById('btn-remote-commit');
    const btnStash = document.getElementById('btn-stash');
    const btnStashPop = document.getElementById('btn-stash-pop');

    const workingDirFiles = document.querySelector('#working-dir .files');
    const stagingAreaFiles = document.querySelector('#staging-area .files');
    const localRepoContent = document.querySelector('#local-repo .repo-content');
    const remoteRepoContent = document.querySelector('#remote-repo .repo-content');
    const stashAreaFiles = document.querySelector('#stash-area .files');
    const localHeadPointer = document.getElementById('local-head');
    const terminalOutput = document.getElementById('terminal-output');
    const explanation = document.getElementById('explanation');
    const remoteUrlDisplay = document.getElementById('remote-url');

    // --- Git State Simulation ---
    let gitInitialized = false;
    let files = {}; // { 'filename.ext': { content: '...', status: 'untracked' | 'modified' | 'staged' | 'tracked', area: 'working' | 'staging' | 'stash' } }
    let localRepo = { commits: {}, branches: {}, head: null, remoteUrl: null }; // head: { type: 'branch' | 'commit', target: 'branchName' | 'commitHash' }
    let remoteRepo = { commits: {}, branches: {} }; // Simulates remote
    let ignoredFiles = new Set();
    let stash = []; // Array of stashed states
    let commitCounter = 0;

    const COMMIT_NODE_SIZE = 30; // Adjust based on CSS
    const VERTICAL_SPACING = 60;
    const HORIZONTAL_SPACING = 50;

    // --- Utility Functions ---
    function logToTerminal(message, type = 'output', command = null) {
        const entry = document.createElement('span');
        if (command) {
            const cmdSpan = document.createElement('span');
            cmdSpan.className = 'command';
            cmdSpan.textContent = `$ ${command}`;
            terminalOutput.appendChild(cmdSpan);
        }
        entry.className = type; // 'output', 'error', 'warning', 'command'
        entry.textContent = message;
        terminalOutput.appendChild(entry);
        terminalOutput.scrollTop = terminalOutput.scrollHeight; // Scroll to bottom
    }

    function updateExplanationText(text) {
        explanation.textContent = text;
    }

    function generateCommitHash(id) {
        // Simple hash generation for visualization
        return id.toString(16).padStart(7, '0').substring(0, 7);
    }

    function createFileElement(name, fileData) {
        const fileEl = document.createElement('div');
        fileEl.classList.add('file');
        fileEl.dataset.filename = name;
        fileEl.textContent = name;
        if (ignoredFiles.has(name)) {
             fileEl.classList.add('ignored');
        } else if (fileData) {
             fileEl.classList.add(fileData.status); // Untracked files won't have a status initially in the state
        }
        // Add animation class
        fileEl.classList.add('file-enter');
        requestAnimationFrame(() => {
            fileEl.classList.add('file-entering');
        });

        return fileEl;
    }

    function renderFilesUI() {
        workingDirFiles.innerHTML = '';
        stagingAreaFiles.innerHTML = '';
        stashAreaFiles.innerHTML = '';

        // Clear files marked for stash before re-rendering
        const filesToKeep = {};
        for (const name in files) {
            if (files[name].area !== 'stash') {
                filesToKeep[name] = files[name];
            }
        }
         files = filesToKeep; // Update state only with non-stashed files

        // Render actual files
        for (const name in files) {
            const fileData = files[name];
            const fileEl = createFileElement(name, fileData);
            if (fileData.area === 'working') {
                workingDirFiles.appendChild(fileEl);
            } else if (fileData.area === 'staging') {
                stagingAreaFiles.appendChild(fileEl);
            }
        }
         // Render stashed files separately
         if (stash.length > 0) {
             const latestStash = stash[stash.length - 1];
             Object.keys(latestStash.files).forEach(name => {
                 const fileEl = createFileElement(name, latestStash.files[name]);
                 fileEl.classList.add('staged'); // Visually represent stashed state
                 stashAreaFiles.appendChild(fileEl);
             });
         }
    }

    function getCommitPosition(commitHash, repoData, positionsCache) {
        if (positionsCache[commitHash]) return positionsCache[commitHash];

        const commit = repoData.commits[commitHash];
        if (!commit) return null;

        // Find max depth of parents
        let maxParentDepth = -1;
        let parentWithMaxDepth = null;
        if (commit.parents && commit.parents.length > 0) {
            commit.parents.forEach(parentId => {
                const parentPos = getCommitPosition(parentId, repoData, positionsCache);
                if (parentPos && parentPos.depth > maxParentDepth) {
                    maxParentDepth = parentPos.depth;
                    parentWithMaxDepth = parentId;
                }
            });
        }

        const depth = maxParentDepth + 1;

        // Basic horizontal positioning (needs improvement for complex branches)
        // Count siblings at this depth to offset horizontally
        let siblingIndex = 0;
         let siblingsAtDepth = 0;
         Object.values(repoData.commits).forEach(c => {
             const pos = getCommitPosition(c.hash, repoData, positionsCache); // Recursive call might be heavy
             if(pos && pos.depth === depth) {
                 siblingsAtDepth++;
                 if (c.timestamp < commit.timestamp) { // Simple ordering
                     siblingIndex++;
                 }
             }
         });


        // Adjust x based on depth and branch (very basic)
         let xOffset = 0;
         if (commit.branch && commit.branch !== 'main') {
              // Try to assign consistent lanes to branches - complex problem
              // Simple approach: offset non-main branches
             xOffset = (Object.keys(repoData.branches).indexOf(commit.branch) || 1) * HORIZONTAL_SPACING * 1.5;
         }


        const pos = {
            x: 20 + depth * HORIZONTAL_SPACING + xOffset, // Offset branches more
            y: 50 + siblingIndex * (VERTICAL_SPACING / (siblingsAtDepth || 1) ) , // Basic vertical spread
            depth: depth
        };
         positionsCache[commitHash] = pos; // Cache result
        return pos;
    }

     function drawLine(startX, startY, endX, endY, branchClass, parentElement) {
        const length = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
        const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

        const line = document.createElement('div');
        line.classList.add('commit-link');
        if (branchClass) line.classList.add(branchClass);
        line.style.width = `${length}px`;
        line.style.left = `${startX}px`;
        line.style.top = `${startY}px`;
        line.style.transform = `rotate(${angle}deg)`;
        parentElement.appendChild(line);
    }

    function renderCommitsUI(repoContentElement, repoData) {
        repoContentElement.innerHTML = ''; // Clear previous rendering
         if (!repoData || Object.keys(repoData.commits).length === 0) {
             // Optionally display a message like "No commits yet"
             repoContentElement.textContent = 'No commits yet.';
             return;
         } else {
             repoContentElement.textContent = ''; // Clear the message if there are commits
         }


        const positions = {}; // Cache positions during this render: { hash: {x, y, depth} }
        const commitElements = {}; // Store created elements: { hash: element }
        const branchCommits = {}; // { branchName: latestCommitHash }

         // Calculate latest commit for each branch
         Object.entries(repoData.branches).forEach(([branchName, commitHash]) => {
             branchCommits[branchName] = commitHash;
         });

        // 1. Calculate all positions first (handles dependencies better)
        Object.keys(repoData.commits).forEach(hash => getCommitPosition(hash, repoData, positions));


        // 2. Draw lines (parents first)
         Object.values(repoData.commits).forEach(commit => {
             const commitPos = positions[commit.hash];
             if (!commitPos) return;

             (commit.parents || []).forEach(parentId => {
                 const parentPos = positions[parentId];
                 if (parentPos) {
                     // Draw line from parent center to commit center
                     const startX = parentPos.x + COMMIT_NODE_SIZE / 2;
                     const startY = parentPos.y + COMMIT_NODE_SIZE / 2;
                     const endX = commitPos.x + COMMIT_NODE_SIZE / 2;
                     const endY = commitPos.y + COMMIT_NODE_SIZE / 2;
                     const parentCommit = repoData.commits[parentId];
                     const branchClass = parentCommit ? getBranchClass(parentCommit.branch) : 'main-branch'; // Default or parent's branch
                     drawLine(startX, startY, endX, endY, branchClass, repoContentElement);
                 }
             });
         });


        // 3. Draw commit nodes
        Object.values(repoData.commits).forEach(commit => {
            const pos = positions[commit.hash];
             if (!pos) return; // Skip if position couldn't be calculated

            const node = document.createElement('div');
            node.classList.add('commit-node');
            const branchClass = getBranchClass(commit.branch);
            if (branchClass) node.classList.add(branchClass);
            if (commit.isMergeCommit) node.classList.add('merge-commit');

            node.style.left = `${pos.x}px`;
            node.style.top = `${pos.y}px`;
            node.title = `Commit: ${commit.hash}\nBranch: ${commit.branch || 'N/A'}\nMessage: ${commit.message}\nParents: ${commit.parents?.join(', ') || 'None'}`;
             node.textContent = commit.hash.substring(0, 2); // Show first 2 chars
             node.dataset.commitHash = commit.hash; // For checkout button

            repoContentElement.appendChild(node);
            commitElements[commit.hash] = node; // Store for head/branch pointers
        });

         // 4. Draw Branch Labels
         Object.entries(repoData.branches).forEach(([branchName, commitHash]) => {
             const commitEl = commitElements[commitHash];
             if (commitEl) {
                 const label = document.createElement('div');
                 label.classList.add('branch-label');
                 const branchClass = getBranchClass(branchName);
                 if (branchClass) label.classList.add(branchClass);
                 // Check if it's a remote tracking branch
                 if (repoData === localRepo && branchName.startsWith('origin/')) {
                     label.classList.add('remote-branch');
                 }

                 label.textContent = branchName;
                 label.style.left = `${parseInt(commitEl.style.left, 10) + COMMIT_NODE_SIZE + 5}px`; // Position right of node
                 label.style.top = `${parseInt(commitEl.style.top, 10)}px`;
                 repoContentElement.appendChild(label);
             }
         });

        // 5. Update Local HEAD pointer (only for local repo)
        if (repoData === localRepo && localRepo.head) {
            updateHeadPointerUI();
        }
    }

    function getBranchClass(branchName) {
        if (!branchName) return 'main-branch'; // Default if undefined
        if (branchName === 'main' || branchName === 'origin/main') return 'main-branch';
        if (branchName === 'feature' || branchName === 'origin/feature') return 'feature-branch';
        return null; // Default color or style
    }

    function updateHeadPointerUI() {
        if (!localRepo.head) {
            localHeadPointer.style.display = 'none';
            return;
        }

        localHeadPointer.style.display = 'block';
        let targetElement = null;
        let isDetached = false;

        if (localRepo.head.type === 'branch') {
            const branchName = localRepo.head.target;
            const commitHash = localRepo.branches[branchName];
            targetElement = localRepoContent.querySelector(`.commit-node[data-commit-hash="${commitHash}"]`);
            localHeadPointer.classList.remove('detached');
        } else { // type === 'commit'
            const commitHash = localRepo.head.target;
            targetElement = localRepoContent.querySelector(`.commit-node[data-commit-hash="${commitHash}"]`);
            isDetached = true;
            localHeadPointer.classList.add('detached');
        }

        if (targetElement) {
             // Position slightly above the target commit node
            localHeadPointer.style.left = `${parseInt(targetElement.style.left, 10)}px`;
             localHeadPointer.style.top = `${parseInt(targetElement.style.top, 10) - COMMIT_NODE_SIZE - 5}px`; // Adjust spacing
        } else {
            localHeadPointer.style.display = 'none'; // Hide if target commit isn't rendered
        }
    }

     function findLatestCommit(repoData, branchName = null) {
         const targetBranch = branchName || (localRepo.head && localRepo.head.type === 'branch' ? localRepo.head.target : 'main'); // Default to main if head is detached
         const headCommitHash = repoData.branches[targetBranch];
         return repoData.commits[headCommitHash] || null;
     }

    function getWorkingChanges() {
        const changes = {};
        for (const name in files) {
            if (files[name].area === 'working' && files[name].status !== 'untracked') {
                changes[name] = files[name];
            }
        }
        return changes;
    }
     function getStagedChanges() {
         const changes = {};
         for (const name in files) {
             if (files[name].area === 'staging') {
                 changes[name] = files[name];
             }
         }
         return changes;
     }

     function getUntrackedFiles() {
         const untracked = [];
         for (const name in files) {
             if (files[name].status === 'untracked' && files[name].area === 'working' && !ignoredFiles.has(name)) {
                 untracked.push(name);
             }
         }
         return untracked;
     }

     function isWorkingTreeClean() {
          for (const name in files) {
              if (files[name].area === 'working' && files[name].status !== 'tracked' && !ignoredFiles.has(name)) {
                  return false; // Modified or untracked (not ignored) files exist
              }
              if (files[name].area === 'staging') {
                  return false; // Staged files exist
              }
          }
          return true;
     }

    function findCommonAncestor(commitHash1, commitHash2, repoData) {
        if (!commitHash1 || !commitHash2 || !repoData.commits[commitHash1] || !repoData.commits[commitHash2]) return null;

        const ancestors1 = new Set();
        let q = [commitHash1];
        while(q.length > 0) {
            const current = q.shift();
            if (!current || ancestors1.has(current)) continue;
            ancestors1.add(current);
            (repoData.commits[current]?.parents || []).forEach(p => q.push(p));
        }

        q = [commitHash2];
        while(q.length > 0) {
            const current = q.shift();
            if (!current) continue;
            if (ancestors1.has(current)) return current; // Found common ancestor
             if (repoData.commits[current]) { // Avoid processing non-existent commits
                 (repoData.commits[current]?.parents || []).forEach(p => {
                     // Prevent infinite loops if history gets weird (though shouldn't happen in Git)
                     if(!q.includes(p)) q.push(p);
                 });
             }
        }
        return null; // Should theoretically always find one if repo started from a root
    }


    // --- Git Command Implementations ---

    function handleInit() {
        if (gitInitialized) {
            logToTerminal('Repository already initialized.', 'warning', 'git init');
            updateExplanationText("Already a Git repository.");
            return;
        }
        gitInitialized = true;
        files = {}; // Clear any pre-existing files for this demo
        ignoredFiles = new Set();
        stash = [];
        commitCounter = 0;
        // Initial commit setup (optional, but common)
        // For simplicity, we'll let the first 'git commit' be the root
        localRepo = {
            commits: {},
            branches: { 'main': null }, // No commits yet, main points to null
            head: { type: 'branch', target: 'main' },
            remoteUrl: null
        };
         remoteRepo = { commits: {}, branches: {} }; // Reset remote sim too

        logToTerminal('Initialized empty Git repository in /visualizer/.git/', 'output', 'git init');
        updateExplanationText("Git repository created! The 'main' branch exists but has no commits yet. Add some files.");
        renderFilesUI();
        renderCommitsUI(localRepoContent, localRepo);
        renderCommitsUI(remoteRepoContent, remoteRepo);
        updateRemoteUrlUI();
        enableCommands(true);
        btnInit.disabled = true;
        btnClone.disabled = true; // Can't clone if you just init'd
    }

    function handleStatus() {
        if (!gitInitialized) {
            logToTerminal('fatal: not a git repository', 'error', 'git status');
            return;
        }
        logToTerminal('', 'output', 'git status'); // Log command itself

        const headTarget = localRepo.head.target;
        const headType = localRepo.head.type;

        if (headType === 'branch') {
            logToTerminal(`On branch ${headTarget}`);
        } else {
            logToTerminal(`HEAD detached at ${headTarget.substring(0, 7)}`);
        }

        const stagedChanges = getStagedChanges();
         const stagedFiles = Object.keys(stagedChanges);
         if (stagedFiles.length > 0) {
            logToTerminal('\nChanges to be committed:');
            stagedFiles.forEach(name => logToTerminal(`  (use "git restore --staged <file>..." to unstage)`, 'output')); // Simplified msg
            stagedFiles.forEach(name => logToTerminal(`\t${files[name].originalStatus === 'untracked' ? 'new file:' : 'modified:'} ${name}`, 'output')); // Show if new or modified when staged
         }

         const workingChanges = {};
         for(const name in files) {
             if (files[name].area === 'working' && files[name].status === 'modified' && !ignoredFiles.has(name)) {
                 workingChanges[name] = files[name];
             }
         }
         const modifiedFiles = Object.keys(workingChanges);
         if (modifiedFiles.length > 0) {
              logToTerminal('\nChanges not staged for commit:');
              logToTerminal(`  (use "git add <file>..." to update what will be committed)`);
              logToTerminal(`  (use "git restore <file>..." to discard changes in working directory)`);
              modifiedFiles.forEach(name => logToTerminal(`\tmodified:   ${name}`, 'warning'));
         }


        const untracked = getUntrackedFiles();
        if (untracked.length > 0) {
            logToTerminal('\nUntracked files:');
            logToTerminal('  (use "git add <file>..." to include in what will be committed)');
            untracked.forEach(name => logToTerminal(`\t${name}`, 'error')); // Often shown in red
        }

        if (stagedFiles.length === 0 && modifiedFiles.length === 0 && untracked.length === 0) {
             const headCommitHash = headType === 'branch' ? localRepo.branches[headTarget] : headTarget;
             if (!headCommitHash) {
                 logToTerminal('\nNo commits yet');
             }
             logToTerminal('\nnothing to commit, working tree clean');
         }

        updateExplanationText("Status shows differences between Working Dir, Staging Area, and your last commit (HEAD).");
    }

     function handleLog() {
        if (!gitInitialized) {
            logToTerminal('fatal: not a git repository', 'error', 'git log');
            return;
        }
         logToTerminal('', 'output', 'git log'); // Log command itself

         let currentHash = localRepo.head.type === 'branch' ? localRepo.branches[localRepo.head.target] : localRepo.head.target;
         let count = 0;
         const MAX_LOG = 10; // Limit log output

         if (!currentHash) {
             logToTerminal('(no commits yet on this branch)');
             updateExplanationText("Showing commit history. No commits have been made on this branch yet.");
             return;
         }

         while (currentHash && count < MAX_LOG) {
             const commit = localRepo.commits[currentHash];
             if (!commit) break; // Should not happen in clean state

             let headMarker = '';
             if (currentHash === (localRepo.head.type === 'branch' ? localRepo.branches[localRepo.head.target] : localRepo.head.target)) {
                 headMarker = ` (HEAD -> ${localRepo.head.target}${localRepo.head.type === 'commit' ? ' [detached]' : ''})`;
             }

              // Find branches pointing to this commit
              let branchMarkers = '';
              Object.entries(localRepo.branches).forEach(([bName, bHash]) => {
                  if (bHash === currentHash && bName !== localRepo.head.target) { // Don't repeat HEAD target
                      branchMarkers += `, ${bName}`;
                  }
              });
               Object.entries(localRepo.branches).forEach(([bName, bHash]) => {
                    if (bName.startsWith('origin/') && bHash === currentHash) {
                        branchMarkers += `, ${bName}`;
                    }
                });
                if (branchMarkers) branchMarkers = ` (${branchMarkers.substring(2)})`; // Remove leading ', '

             logToTerminal(`commit ${commit.hash}${headMarker}${branchMarkers}`, 'warning'); // Often yellow
             logToTerminal(`Author: Simulated User <user@example.com>`); // Simulated
             logToTerminal(`Date:   ${new Date(commit.timestamp).toString()}`); // Simulated
             logToTerminal(`\n    ${commit.message}\n`);

             // Follow the first parent for simplicity in log
             currentHash = commit.parents && commit.parents.length > 0 ? commit.parents[0] : null;
             count++;
         }
         if (currentHash) {
             logToTerminal('...'); // Indicate more history exists
         }
         updateExplanationText("Showing commit history for the current branch/commit (most recent first). HEAD shows your current position.");
     }

    function handleCreateFile(name = 'index.js', content = `console.log('Hello Git!');`) {
        if (!gitInitialized) {
            logToTerminal('Create failed: Initialize Git first (`git init`).', 'error');
            return;
        }
        if (files[name]) {
             logToTerminal(`File '${name}' already exists. Use 'Modify' button.`, 'warning');
             return;
        }
        files[name] = { content: content, status: 'untracked', area: 'working', originalStatus: 'untracked' };
        logToTerminal(`Created '${name}' in Working Directory.`, 'output', `echo "${content}" > ${name}`); // Simulate command
        updateExplanationText(`Created '${name}'. It's 'untracked' by Git. Use 'git add' to stage it.`);
        renderFilesUI();
    }

    function handleModifyFile(name = 'index.js') {
        if (!gitInitialized || !files[name]) {
            logToTerminal(`Modify failed: File '${name}' does not exist or Git not initialized.`, 'error');
             return;
        }
         if (files[name].area !== 'working' && files[name].area !== 'staging') { // Can't modify stashed/committed directly
             logToTerminal(`Modify failed: Cannot directly modify '${name}' in its current state (${files[name].area}). Checkout first if needed.`, 'error');
             return;
         }

        const newContent = `${files[name].content}\nconsole.log('Modified at ${new Date().toLocaleTimeString()}');`;
        files[name].content = newContent;
         // Only change status if it wasn't already modified or untracked
         if (files[name].status === 'tracked' || files[name].status === 'staged') { // If it was tracked or staged, modifying makes it 'modified' in working dir
            files[name].status = 'modified';
             files[name].area = 'working'; // Bring back to working if it was staged
         } else if (files[name].status === 'untracked') {
             // Modifying an untracked file keeps it untracked
         }
         // If it was already 'modified', it stays 'modified'

        logToTerminal(`Modified '${name}' in Working Directory.`, 'output', `vim ${name}`); // Simulate command
        updateExplanationText(`Modified '${name}'. Use 'git add' to stage the changes.`);
        renderFilesUI();
    }

     function handleAddGitignore() {
        if (!gitInitialized) {
            logToTerminal('Add failed: Initialize Git first (`git init`).', 'error');
            return;
        }
         const gitignoreContent = 'config.prop\n'; // File to ignore
         const fileName = '.gitignore';
         const pattern = 'config.prop';

         if (!files[fileName]) {
             files[fileName] = { content: gitignoreContent, status: 'untracked', area: 'working', originalStatus: 'untracked' };
             logToTerminal(`Created '${fileName}'`, 'output', `echo "${pattern}" > ${fileName}`);
         } else {
              files[fileName].content += gitignoreContent; // Append if exists
              if (files[fileName].status === 'tracked' || files[fileName].status === 'staged') {
                  files[fileName].status = 'modified';
                  files[fileName].area = 'working'; // Bring back if staged
              }
              logToTerminal(`Updated '${fileName}'`, 'output', `echo "${pattern}" >> ${fileName}`);
         }

         // Add the pattern to our ignored set
         ignoredFiles.add(pattern);

         // Update the visual status of the ignored file if it exists
         if (files[pattern]) {
             renderFilesUI(); // Re-render to apply ignored style
         }

         updateExplanationText(`Added 'config.prop' to .gitignore. Git will now ignore this file. Don't forget to 'git add .gitignore' and commit it!`);
         renderFilesUI(); // Render .gitignore itself
     }

    function handleAdd(fileName) {
        if (!gitInitialized) {
            logToTerminal('fatal: not a git repository', 'error', 'git add');
            return;
        }

        let filesToAdd = [];
        const commandStr = `git add ${fileName}`;

        if (fileName === '.') {
            // Add all modified and untracked (not ignored) files in working dir
             for (const name in files) {
                 if (files[name].area === 'working' && !ignoredFiles.has(name) && (files[name].status === 'modified' || files[name].status === 'untracked')) {
                      filesToAdd.push(name);
                 }
             }
             // Also stage files that were previously staged but then modified again (status is modified)
        } else if (files[fileName]) {
             if (ignoredFiles.has(fileName)) {
                 logToTerminal(`warning: The following paths are ignored by one of your .gitignore files:\n${fileName}\nuse -f if you really want to add them.`, 'warning', commandStr);
                 updateExplanationText(`'${fileName}' is ignored by .gitignore. Use 'git add -f ${fileName}' to force add (not simulated here).`);
                 return;
             }
            if (files[fileName].area === 'working' && (files[fileName].status === 'modified' || files[fileName].status === 'untracked')) {
                filesToAdd.push(fileName);
            } else if (files[fileName].area === 'staging') {
                 logToTerminal(`'${fileName}' is already staged.`, 'output', commandStr);
                 return; // No change needed
             } else {
                  logToTerminal(`No changes detected for '${fileName}' in working directory.`, 'output', commandStr);
                  return;
             }
        } else {
            logToTerminal(`fatal: pathspec '${fileName}' did not match any files`, 'error', commandStr);
            updateExplanationText(`File '${fileName}' not found in your working directory.`);
            return;
        }

        if (filesToAdd.length === 0 && fileName === '.') {
             logToTerminal('Nothing specified, nothing added.', 'output', commandStr);
             updateExplanationText("No modified or new (untracked) files to add.");
             return;
        }

        filesToAdd.forEach(name => {
            files[name].area = 'staging';
            // Keep track if it was originally untracked
            files[name].originalStatus = files[name].originalStatus || files[name].status; // Store original if not already stored
            files[name].status = 'staged';
        });

        logToTerminal(`Staged ${filesToAdd.join(', ')}.`, 'output', commandStr);
        updateExplanationText(`${filesToAdd.join(', ')} moved to the Staging Area. Ready to be committed.`);
        renderFilesUI();
    }

    function handleCommit(stageAllFirst = false) {
        if (!gitInitialized) {
            logToTerminal('fatal: not a git repository', 'error', 'git commit');
            return;
        }

        const commandStr = stageAllFirst ? 'git commit -am "..."' : 'git commit -m "..."';

         if (stageAllFirst) {
             // Simulate adding all tracked files first
             let stagedSomething = false;
             for (const name in files) {
                  // Check if it's modified and tracked (implicitly, not 'untracked')
                 if (files[name].area === 'working' && files[name].status === 'modified' && !ignoredFiles.has(name)) {
                     files[name].area = 'staging';
                     files[name].status = 'staged';
                     stagedSomething = true;
                 }
             }
         }

        const stagedChanges = getStagedChanges();
        const stagedFiles = Object.keys(stagedChanges);

        if (stagedFiles.length === 0) {
            logToTerminal('nothing to commit, working tree clean', 'output', commandStr);
             if (stageAllFirst && !isWorkingTreeClean()) { // -am specific message if only untracked exist
                 logToTerminal('(use "git add" to track untracked files)', 'warning');
             }
            updateExplanationText("No changes added to the Staging Area. Use 'git add' first.");
            return;
        }

        commitCounter++;
        const commitId = commitCounter;
        const commitHash = generateCommitHash(commitId);
         const parentHash = localRepo.head ? (localRepo.head.type === 'branch' ? localRepo.branches[localRepo.head.target] : localRepo.head.target) : null;
        const currentBranch = localRepo.head && localRepo.head.type === 'branch' ? localRepo.head.target : null; // Null if detached

         // Create file snapshot for the commit
         const commitFilesSnapshot = {};
         // 1. Copy files from parent commit (if exists)
         if (parentHash && localRepo.commits[parentHash]) {
             Object.assign(commitFilesSnapshot, localRepo.commits[parentHash].files);
         }
         // 2. Apply staged changes
         stagedFiles.forEach(name => {
             commitFilesSnapshot[name] = { ...files[name], area: 'committed' }; // Store a copy, mark as committed
         });


        const commitMessage = stageAllFirst ? `Commit ${commitId} via -am` : `Commit ${commitId}: Staged changes`; // Simple message
        const newCommit = {
            hash: commitHash,
            message: commitMessage,
            parents: parentHash ? [parentHash] : [],
            timestamp: Date.now(),
            branch: currentBranch, // Record branch at time of commit (can change with rebase)
             files: commitFilesSnapshot, // Snapshot of files at this commit
             isMergeCommit: false
        };

        localRepo.commits[commitHash] = newCommit;

        // Update HEAD and current branch pointer
        if (localRepo.head.type === 'branch') {
            localRepo.branches[localRepo.head.target] = commitHash;
        } else { // Detached HEAD - just update HEAD
            localRepo.head.target = commitHash;
        }

         // Clear staging area and update status of committed files
         stagedFiles.forEach(name => {
             files[name].area = 'working'; // Back to working dir
             files[name].status = 'tracked'; // Now tracked (or stays tracked)
             delete files[name].originalStatus; // Reset original status marker
         });

         logToTerminal(`[${localRepo.head.target} ${commitHash}] ${commitMessage}`, 'output', commandStr);
         logToTerminal(`${stagedFiles.length} file(s) changed.`, 'output'); // Simplified status
         updateExplanationText(`Created commit ${commitHash.substring(0,7)} on branch ${currentBranch || '[detached]'}. Staging Area is now empty. Changes are saved in the Local Repo.`);

        renderFilesUI();
        renderCommitsUI(localRepoContent, localRepo); // Re-render commits
    }

    function handleBranchFeature() {
         if (!gitInitialized) {
             logToTerminal('fatal: not a git repository', 'error', 'git branch');
             return;
         }
         const branchName = 'feature';
         const commandStr = `git branch ${branchName}`;

         if (localRepo.branches[branchName]) {
             logToTerminal(`fatal: A branch named '${branchName}' already exists.`, 'error', commandStr);
             updateExplanationText(`Branch '${branchName}' already exists.`);
             return;
         }

         // Branch points to the same commit as HEAD
         const currentCommitHash = localRepo.head.type === 'branch' ? localRepo.branches[localRepo.head.target] : localRepo.head.target;

          if (!currentCommitHash) {
             logToTerminal(`Cannot create branch '${branchName}': The current HEAD is unborn. Commit first.`, 'error', commandStr);
             updateExplanationText(`Cannot create a branch until the first commit is made.`);
             return;
         }


         localRepo.branches[branchName] = currentCommitHash;
         logToTerminal(`Created branch '${branchName}'.`, 'output', commandStr);
         updateExplanationText(`Created new branch 'feature'. It points to the same commit as HEAD (${currentCommitHash.substring(0,7)}). Use 'git checkout feature' to switch to it.`);
         renderCommitsUI(localRepoContent, localRepo); // Re-render to show new branch label
     }

     function handleCheckout(target) { // Target can be branch name or commit hash
         if (!gitInitialized) {
             logToTerminal('fatal: not a git repository', 'error', 'git checkout');
             return;
         }

         const commandStr = `git checkout ${target}`;
         let newHead = null;
         let targetCommitHash = null;
         let isBranchSwitch = false;

         // Check if target is a branch
         if (localRepo.branches[target]) {
             if (localRepo.head.type === 'branch' && localRepo.head.target === target) {
                 logToTerminal(`Already on '${target}'`, 'output', commandStr);
                 updateExplanationText(`You are already on the '${target}' branch.`);
                 return;
             }
             // Check for uncommitted changes before switching branches
             if (!isWorkingTreeClean()) {
                  logToTerminal(`error: Your local changes to the following files would be overwritten by checkout:\n... (simulation)\nPlease commit your changes or stash them before you switch branches.`, 'error', commandStr);
                  updateExplanationText(`You have uncommitted changes. Commit or stash them before switching branches to avoid losing work.`);
                  return;
             }

             newHead = { type: 'branch', target: target };
             targetCommitHash = localRepo.branches[target];
              isBranchSwitch = true;
             logToTerminal(`Switched to branch '${target}'`, 'output', commandStr);
         }
         // Check if target is a commit hash (simplified check)
         else if (localRepo.commits[target] || Object.values(localRepo.commits).find(c => c.hash.startsWith(target))) {
             const fullHash = Object.values(localRepo.commits).find(c => c.hash.startsWith(target))?.hash || target;

              if (!localRepo.commits[fullHash]) {
                  logToTerminal(`fatal: reference is not a tree: ${target}`, 'error', commandStr);
                  return;
              }
               // Check for uncommitted changes
               if (!isWorkingTreeClean()) {
                   logToTerminal(`error: Your local changes would be overwritten by checkout.\nPlease commit or stash changes.`, 'error', commandStr);
                   updateExplanationText(`You have uncommitted changes. Commit or stash them before checking out a commit.`);
                   return;
               }


             newHead = { type: 'commit', target: fullHash };
             targetCommitHash = fullHash;
             logToTerminal(`Note: switching to '${fullHash.substring(0,7)}'.\n`, 'output', commandStr);
             logToTerminal(`You are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n`);
             logToTerminal(`HEAD is now at ${fullHash.substring(0,7)} ${localRepo.commits[fullHash].message}`);
         } else {
             logToTerminal(`error: pathspec '${target}' did not match any file(s) known to git`, 'error', commandStr);
             updateExplanationText(`Could not find a branch or commit matching '${target}'.`);
             return;
         }

         localRepo.head = newHead;

         // --- Update Working Directory ---
         // Reset files based on the target commit's snapshot
         files = {}; // Clear current working/staging state
         const targetCommit = localRepo.commits[targetCommitHash];
         if (targetCommit && targetCommit.files) {
              Object.entries(targetCommit.files).forEach(([name, fileData]) => {
                  // Create a fresh copy for the working directory
                  files[name] = {
                      content: fileData.content,
                      status: 'tracked', // Files from a commit are 'tracked'
                      area: 'working'
                  };
              });
         } // If targetCommitHash is null (e.g., switching to an unborn branch), files remain empty.


         updateExplanationText(isBranchSwitch
             ? `Switched to branch '${target}'. Your Working Directory now matches this branch's last commit.`
             : `Switched to commit ${targetCommitHash.substring(0,7)}. You're in a 'detached HEAD' state. Working Directory matches this commit. New commits won't belong to any branch unless you create one.`);

         renderFilesUI();
         renderCommitsUI(localRepoContent, localRepo); // Update commits and HEAD pointer visuals
     }

    function handleMergeFeature() {
         if (!gitInitialized || !localRepo.head || localRepo.head.type !== 'branch') {
             logToTerminal('Merge failed: Not on a branch or Git not initialized.', 'error', 'git merge feature');
             return;
         }
          if (!localRepo.branches['feature']) {
              logToTerminal("Merge failed: Branch 'feature' not found.", 'error', 'git merge feature');
              return;
          }
          if (!isWorkingTreeClean()) {
              logToTerminal('Merge failed: You have uncommitted changes. Commit or stash first.', 'error', 'git merge feature');
              return;
          }


         const currentBranchName = localRepo.head.target;
         const featureBranchName = 'feature';
         const currentCommitHash = localRepo.branches[currentBranchName];
         const featureCommitHash = localRepo.branches[featureBranchName];

          if (currentCommitHash === featureCommitHash) {
              logToTerminal(`Already up to date.`, 'output', 'git merge feature');
              updateExplanationText(`Branch '${currentBranchName}' already contains all changes from 'feature'.`);
              return;
          }


         // Find common ancestor
         const commonAncestorHash = findCommonAncestor(currentCommitHash, featureCommitHash, localRepo);

          // --- Fast-forward merge ---
          if (commonAncestorHash === currentCommitHash) {
              logToTerminal(`Updating ${currentCommitHash.substring(0,7)}..${featureCommitHash.substring(0,7)}`);
              logToTerminal('Fast-forward');
              // Simply move the current branch pointer to the feature branch pointer
              localRepo.branches[currentBranchName] = featureCommitHash;
              localRepo.head.target = currentBranchName; // Ensure head follows

              // Update working directory to match the new head
              files = {}; // Clear current working/staging state
              const targetCommit = localRepo.commits[featureCommitHash];
              if (targetCommit && targetCommit.files) {
                  Object.entries(targetCommit.files).forEach(([name, fileData]) => {
                      files[name] = { content: fileData.content, status: 'tracked', area: 'working' };
                  });
              }

              updateExplanationText(`Fast-forward merge completed. '${currentBranchName}' now points to the same commit as 'feature'.`);

          }
           // --- Three-way merge ---
           else {
                logToTerminal(`Attempting merge... (Simulating 3-way merge)`);
                // *** Basic Conflict Simulation ***
                let conflictDetected = false;
                const baseCommit = localRepo.commits[commonAncestorHash];
                const currentCommit = localRepo.commits[currentCommitHash];
                const featureCommit = localRepo.commits[featureCommitHash];

                 const mergedFiles = { ...(baseCommit?.files || {}) }; // Start with ancestor files

                 // Apply changes from current branch
                 for (const name in currentCommit?.files || {}) {
                      if (!baseCommit?.files || !baseCommit.files[name] || baseCommit.files[name].content !== currentCommit.files[name].content) {
                          mergedFiles[name] = { ...currentCommit.files[name] }; // Add new or changed file
                      }
                 }
                  // Apply changes from feature branch, checking for conflicts
                  for (const name in featureCommit?.files || {}) {
                       const baseContent = baseCommit?.files?.[name]?.content;
                       const currentContent = currentCommit?.files?.[name]?.content; // Content in current (target) branch's commit
                       const featureContent = featureCommit.files[name].content;

                       const changedInCurrent = currentContent !== baseContent;
                       const changedInFeature = featureContent !== baseContent;

                       if (changedInFeature) {
                           if (mergedFiles[name] && changedInCurrent && mergedFiles[name].content !== featureContent) {
                               // CONFLICT! Same file changed differently in both branches since ancestor
                               conflictDetected = true;
                                mergedFiles[name].content = `<<<<<<< HEAD\n${mergedFiles[name].content}\n=======\n${featureContent}\n>>>>>>> feature`;
                                mergedFiles[name].status = 'conflicted'; // Mark for UI
                                logToTerminal(`CONFLICT (content): Merge conflict in ${name}`, 'error');
                           } else if (!mergedFiles[name] || !changedInCurrent) {
                                // Add new file from feature or update if only feature changed it
                                mergedFiles[name] = { ...featureCommit.files[name] };
                           }
                       }
                  }


                if (conflictDetected) {
                    // Update working directory with conflict markers
                     files = {}; // Clear previous state
                     Object.entries(mergedFiles).forEach(([name, fileData]) => {
                         files[name] = {
                             content: fileData.content,
                             // Status is tricky - Git leaves conflicted files unmerged
                             status: fileData.status === 'conflicted' ? 'conflicted' : 'modified', // Mark others as modified relative to old HEAD
                             area: 'working'
                         };
                     });
                     logToTerminal(`Automatic merge failed; fix conflicts and then commit the result.`, 'error');
                     updateExplanationText(`Merge conflict! Files marked red have conflicts. Manually edit them (not simulated), 'git add' the resolved files, and then 'git commit'.`);
                     renderFilesUI(); // Show conflict markers
                     // Don't update commits or HEAD yet
                     return; // Stop merge process here in simulation

                } else {
                     // No conflicts - Create Merge Commit
                     commitCounter++;
                     const mergeCommitHash = generateCommitHash(commitCounter);
                     const mergeMessage = `Merge branch 'feature' into ${currentBranchName}`;

                     const mergeCommit = {
                         hash: mergeCommitHash,
                         message: mergeMessage,
                         parents: [currentCommitHash, featureCommitHash], // Two parents!
                         timestamp: Date.now(),
                         branch: currentBranchName,
                         files: {}, // Snapshot of merged files
                         isMergeCommit: true
                     };

                      // Update the snapshot in the merge commit
                      Object.entries(mergedFiles).forEach(([name, fileData]) => {
                           mergeCommit.files[name] = { ...fileData, area: 'committed', status: 'tracked' };
                      });


                     localRepo.commits[mergeCommitHash] = mergeCommit;
                     localRepo.branches[currentBranchName] = mergeCommitHash; // Update current branch pointer
                     localRepo.head.target = currentBranchName; // Ensure head follows

                     // Update working directory
                     files = {}; // Clear current state
                     Object.entries(mergeCommit.files).forEach(([name, fileData]) => {
                          files[name] = { content: fileData.content, status: 'tracked', area: 'working' };
                     });

                     logToTerminal(`Merge made by the 'recursive' strategy.`, 'output'); // Simulate Git message
                     updateExplanationText(`Successfully merged 'feature' into '${currentBranchName}' by creating a merge commit (${mergeCommitHash.substring(0,7)}).`);
                 }

           }

        renderFilesUI();
        renderCommitsUI(localRepoContent, localRepo);
    }

    // --- Remote Operations ---
    function handleRemoteAdd() {
         if (!gitInitialized) {
              logToTerminal('fatal: not a git repository', 'error', 'git remote add');
              return;
         }
         if (localRepo.remoteUrl) {
              logToTerminal(`fatal: remote origin already exists.`, 'error', 'git remote add origin ...');
              updateExplanationText(`A remote named 'origin' is already configured.`);
              return;
         }
         // Simulate adding a remote URL
         localRepo.remoteUrl = "github.com/user/repo.git"; // Example URL
         // If remote repo is empty, mirror local main branch if it exists
          if (Object.keys(remoteRepo.commits).length === 0 && localRepo.branches['main'] && localRepo.commits[localRepo.branches['main']]) {
               // Let's not auto-sync here, make user push explicitly
          }

         logToTerminal(`Added remote 'origin'.`, 'output', `git remote add origin ${localRepo.remoteUrl}`);
         updateExplanationText(`Connected local repository to a simulated remote named 'origin'. Now you can push/pull.`);
         updateRemoteUrlUI();
         renderCommitsUI(remoteRepoContent, remoteRepo); // Render remote (likely empty initially)
     }

    function handlePush(setUpstream = false, branchToPush = null) {
         if (!gitInitialized || !localRepo.remoteUrl) {
             logToTerminal('Push failed: No remote configured or Git not initialized.', 'error', 'git push');
             return;
         }
         if (!localRepo.head) {
             logToTerminal('Push failed: HEAD is missing.', 'error', 'git push'); // Should not happen
             return;
         }

         const currentLocalBranch = branchToPush || (localRepo.head.type === 'branch' ? localRepo.head.target : null);
         if (!currentLocalBranch) {
             logToTerminal('Push failed: You are in a detached HEAD state. Push requires a branch.', 'error', 'git push');
             updateExplanationText("Cannot push while in detached HEAD state. Checkout a branch first.");
             return;
         }
         const commandStr = setUpstream ? `git push -u origin ${currentLocalBranch}` : `git push`;

         const localCommitHash = localRepo.branches[currentLocalBranch];
         if (!localCommitHash) {
             logToTerminal(`Push failed: Branch '${currentLocalBranch}' has no commits.`, 'error', commandStr);
             return;
         }
          const remoteCommitHash = remoteRepo.branches[currentLocalBranch]; // Check if branch exists remotely

         // --- Simple Push Simulation ---
         // Check if remote is ahead (needs pull/fetch first) - Simplified check
         // A real check involves finding common ancestor and seeing if remote has commits local doesn't
         const remoteCommitsSet = new Set(Object.keys(remoteRepo.commits));
         let localNeedsPull = false;
          let ancestor = localCommitHash;
          while(ancestor) {
              if (!remoteCommitsSet.has(ancestor) && remoteCommitHash) { // If remote branch exists and we find a local commit not on remote, that's fine for push
                 // This check is too simple for real divergence.
                 // A better check: Is remoteCommitHash an ancestor of localCommitHash? If not, rejected.
             }
             if (remoteCommitHash === ancestor) break; // Found common point or remote base
              const commit = localRepo.commits[ancestor];
              ancestor = commit?.parents?.[0]; // Follow first parent
          }
          // If remoteCommitHash exists and is NOT an ancestor of localCommitHash (or equal), then remote is ahead or diverged.
          if (remoteCommitHash && remoteCommitHash !== localCommitHash && !isAncestor(remoteCommitHash, localCommitHash, localRepo)) {
               localNeedsPull = true;
          }


         if (localNeedsPull) {
             logToTerminal(`! [rejected]        ${currentLocalBranch} -> ${currentLocalBranch} (fetch first)`, 'error', commandStr);
             logToTerminal(`error: failed to push some refs to '${localRepo.remoteUrl}'`);
             logToTerminal(`hint: Updates were rejected because the remote contains work that you do`);
             logToTerminal(`hint: not have locally. This is usually caused by another repository pushing`);
             logToTerminal(`hint: to the same ref. You may want to first integrate the remote changes`);
             logToTerminal(`hint: (e.g., 'git pull ...') before pushing again.`);
             updateExplanationText(`Push rejected! The remote branch has changes you don't have locally. Use 'git fetch' or 'git pull' first.`);
             return;
         }

         // Copy necessary commits and update remote branch pointer
         const commitsToPush = {};
         let q = [localCommitHash];
         const visited = new Set();

         while (q.length > 0) {
             const current = q.shift();
             if (!current || visited.has(current) || remoteRepo.commits[current]) continue; // Already exists remotely or visited

             visited.add(current);
             const commitData = localRepo.commits[current];
             if(commitData) {
                 commitsToPush[current] = { ...commitData }; // Copy commit data
                 (commitData.parents || []).forEach(p => q.push(p));
             }
         }

          // Add pushed commits to remote repo state
          Object.assign(remoteRepo.commits, commitsToPush);
          // Update remote branch pointer
          remoteRepo.branches[currentLocalBranch] = localCommitHash;

          // If setting upstream, maybe store this link locally (not strictly needed for this viz)
          if (setUpstream) {
              localRepo.branches[`origin/${currentLocalBranch}`] = localCommitHash; // Simulate remote tracking branch creation/update
          }

          logToTerminal(`Enumerating objects: ..., done.`, 'output', commandStr);
          logToTerminal(`Writing objects: 100% (...), done.`);
          logToTerminal(`To ${localRepo.remoteUrl}`);
          const newBranchMarker = !remoteCommitHash ? '[new branch]' : '';
          logToTerminal(` * ${newBranchMarker}      ${currentLocalBranch} -> ${currentLocalBranch}`);
           if (setUpstream) {
                logToTerminal(`Branch '${currentLocalBranch}' set up to track remote branch '${currentLocalBranch}' from 'origin'.`);
           }

         updateExplanationText(`Pushed commits from local '${currentLocalBranch}' to remote 'origin/${currentLocalBranch}'.`);
         renderCommitsUI(localRepoContent, localRepo); // Update local tracking branches
         renderCommitsUI(remoteRepoContent, remoteRepo); // Update remote view
     }

     function handleFetch() {
         if (!gitInitialized || !localRepo.remoteUrl) {
             logToTerminal('Fetch failed: No remote configured or Git not initialized.', 'error', 'git fetch');
             return;
         }
         logToTerminal('', 'output', 'git fetch'); // Log command itself

         let fetchedNewCommits = false;
         let fetchedNewBranches = false;

         // Simulate fetching: copy remote commits/branches to local under 'origin/' namespace
         Object.keys(remoteRepo.commits).forEach(hash => {
             if (!localRepo.commits[hash]) {
                 localRepo.commits[hash] = { ...remoteRepo.commits[hash] }; // Copy commit data if missing
                 fetchedNewCommits = true;
             }
         });

         Object.entries(remoteRepo.branches).forEach(([branchName, commitHash]) => {
             const remoteTrackingBranch = `origin/${branchName}`;
             if (localRepo.branches[remoteTrackingBranch] !== commitHash) {
                 localRepo.branches[remoteTrackingBranch] = commitHash; // Update or create local tracking branch pointer
                 fetchedNewBranches = true; // Or branch updated
             }
         });

         if (!fetchedNewCommits && !fetchedNewBranches) {
             logToTerminal('Already up to date.');
         } else {
             logToTerminal(`From ${localRepo.remoteUrl}`);
             Object.entries(remoteRepo.branches).forEach(([branchName, commitHash]) => {
                 // Show summary of fetched branches - simplified
                 logToTerminal(` * [new branch]      ${branchName}     -> origin/${branchName}`); // Assume new for simplicity
             });
         }

         updateExplanationText(`Fetched changes from the remote 'origin'. New commits/branches are downloaded to your local repo (visible as 'origin/...'). Your working directory and local branches ('main', 'feature') are NOT updated yet. Use 'git merge origin/...' or 'git pull' to integrate.`);
         renderCommitsUI(localRepoContent, localRepo); // Re-render local repo to show tracking branches
     }

     function handlePull() {
         if (!gitInitialized || !localRepo.remoteUrl) {
             logToTerminal('Pull failed: No remote configured or Git not initialized.', 'error', 'git pull');
             return;
         }
          if (!localRepo.head || localRepo.head.type !== 'branch') {
              logToTerminal('Pull failed: You are not on a branch.', 'error', 'git pull');
              return;
          }
          if (!isWorkingTreeClean()) {
                logToTerminal('Pull failed: You have uncommitted changes. Commit or stash first.', 'error', 'git pull');
                return;
           }


         const currentBranch = localRepo.head.target;
         const remoteTrackingBranch = `origin/${currentBranch}`;

         logToTerminal('', 'output', 'git pull'); // Log command itself

         // 1. Simulate Fetch first
         handleFetch(); // Reuse fetch logic (logs its own output)

         // 2. Simulate Merge
         const localCommit = localRepo.branches[currentBranch];
         const remoteCommit = localRepo.branches[remoteTrackingBranch]; // Get the just-fetched remote state

         if (!remoteCommit) {
             logToTerminal(`There is no tracking information for the current branch.`, 'warning');
             // Or specific message if branch doesn't exist on remote
             updateExplanationText(`Could not pull. Remote branch 'origin/${currentBranch}' doesn't seem to exist or tracking isn't set up.`);
             return;
         }

         if (localCommit === remoteCommit) {
             logToTerminal(`Already up to date.`, 'output');
             updateExplanationText(`Your local branch '${currentBranch}' is already synchronized with the remote 'origin/${currentBranch}'.`);
             return;
         }

         // Use merge logic, merging the remote tracking branch into the current local branch
          // Re-find common ancestor based on potentially updated localRepo.commits
          const commonAncestorHash = findCommonAncestor(localCommit, remoteCommit, localRepo);

          // Fast-forward scenario
          if (commonAncestorHash === localCommit) {
              logToTerminal(`Updating ${localCommit.substring(0,7)}..${remoteCommit.substring(0,7)}`);
              logToTerminal('Fast-forward');
              localRepo.branches[currentBranch] = remoteCommit; // Update local branch
              localRepo.head.target = currentBranch;

              // Update working directory
              files = {};
              const targetCommit = localRepo.commits[remoteCommit];
              if (targetCommit && targetCommit.files) {
                  Object.entries(targetCommit.files).forEach(([name, fileData]) => {
                      files[name] = { content: fileData.content, status: 'tracked', area: 'working' };
                  });
              }
              updateExplanationText(`Pulled and fast-forwarded '${currentBranch}' to match 'origin/${currentBranch}'.`);

          }
          // Merge scenario (potentially with conflicts)
          else {
                // Reuse the merge logic, but merge `remoteTrackingBranch`
                // For simplicity, let's just call the merge logic directly,
                // pretending 'feature' was the remote tracking branch name.
                // A more robust sim would pass the correct remote branch name.
                logToTerminal(`Attempting merge of 'origin/${currentBranch}' into '${currentBranch}'...`);

                 // *** This part needs the actual merge logic from handleMergeFeature adapted ***
                 // *** to merge `remoteCommit` onto `localCommit` based on `commonAncestorHash` ***
                 // *** Due to complexity, this simulation will skip actual conflict generation ***
                 // *** during pull and assume a merge commit is needed if not fast-forward ***

                 commitCounter++;
                 const mergeCommitHash = generateCommitHash(commitCounter);
                 const mergeMessage = `Merge remote-tracking branch 'origin/${currentBranch}' into ${currentBranch}`;
                 const mergedFilesSnapshot = { ...(localRepo.commits[localCommit]?.files || {}), ...(localRepo.commits[remoteCommit]?.files || {}) }; // Oversimplified merge

                 const mergeCommit = {
                     hash: mergeCommitHash,
                     message: mergeMessage,
                     parents: [localCommit, remoteCommit],
                     timestamp: Date.now(),
                     branch: currentBranch,
                     files: {}, // Needs proper calculation
                     isMergeCommit: true
                 };
                 // Calculate merged files properly (complex part)
                 // For demo: just combine files, favoring remote version for simplicity
                  Object.entries(mergedFilesSnapshot).forEach(([name, fileData]) => {
                      mergeCommit.files[name] = { ...fileData, area: 'committed', status: 'tracked' };
                  });


                 localRepo.commits[mergeCommitHash] = mergeCommit;
                 localRepo.branches[currentBranch] = mergeCommitHash;
                 localRepo.head.target = currentBranch;

                 files = {}; // Update working dir
                  Object.entries(mergeCommit.files).forEach(([name, fileData]) => {
                      files[name] = { content: fileData.content, status: 'tracked', area: 'working' };
                  });


                 logToTerminal(`Merge made by the 'recursive' strategy.`, 'output'); // Simulate Git message
                 updateExplanationText(`Pulled and merged remote changes into '${currentBranch}' creating merge commit ${mergeCommitHash.substring(0,7)}.`);
                 // TODO: Add conflict handling simulation here for `git pull` as well.
          }

         renderFilesUI();
         renderCommitsUI(localRepoContent, localRepo);
     }


     function handleRemoteCommit() {
         // Simulate another developer making a commit on the remote main branch
         if (!localRepo.remoteUrl) {
             logToTerminal('Simulation failed: Remote not configured.', 'warning');
             return;
         }

         const remoteMainHash = remoteRepo.branches['main'];
         if (!remoteMainHash) {
             logToTerminal('Simulation failed: Remote "main" branch has no commits yet.', 'warning');
             return;
         }

         commitCounter++; // Use global counter for uniqueness simulation
         const newRemoteCommitHash = generateCommitHash(commitCounter + 1000); // Offset to avoid local collision
         const newCommit = {
             hash: newRemoteCommitHash,
             message: `Remote commit ${commitCounter}`,
             parents: [remoteMainHash],
             timestamp: Date.now() + 1000, // Slightly later time
             branch: 'main',
             files: { ...remoteRepo.commits[remoteMainHash]?.files }, // Copy files
             isMergeCommit: false
         };
         // Simulate a change in the remote commit
         const fileNameToChange = 'index.js';
         if (newCommit.files[fileNameToChange]) {
             newCommit.files[fileNameToChange].content += `\n// Remote change ${commitCounter}`;
         } else { // If file doesn't exist, add it
              newCommit.files['remote_file.txt'] = { content: 'Added remotely', status: 'tracked', area: 'committed' };
         }


         remoteRepo.commits[newRemoteCommitHash] = newCommit;
         remoteRepo.branches['main'] = newRemoteCommitHash; // Update remote main pointer

         logToTerminal(`Simulated: Another developer pushed commit ${newRemoteCommitHash.substring(0,7)} to remote 'origin/main'.`, 'output');
         updateExplanationText("Simulated a commit pushed by someone else to the remote 'main' branch. Use 'git fetch' or 'git pull' to get these changes.");
         renderCommitsUI(remoteRepoContent, remoteRepo); // Update remote view
     }

     function handleStash() {
          if (!gitInitialized) {
              logToTerminal('fatal: not a git repository', 'error', 'git stash');
              return;
          }
           const workingChanges = getWorkingChanges();
           const stagedChanges = getStagedChanges();
           const untrackedFiles = getUntrackedFiles(); // Git stash usually doesn't stash untracked unless specified

           if (Object.keys(workingChanges).length === 0 && Object.keys(stagedChanges).length === 0) {
               logToTerminal('No local changes to save', 'output', 'git stash');
               updateExplanationText("No changes in the working directory or staging area to stash.");
               return;
           }

           // Create stash entry
           const stashEntry = { files: {}, timestamp: Date.now() };
           Object.assign(stashEntry.files, workingChanges, stagedChanges); // Combine working and staged

           stash.push(stashEntry);

           // Clean working directory and staging area
           Object.keys(stashEntry.files).forEach(name => {
                const headCommitHash = localRepo.head.type === 'branch' ? localRepo.branches[localRepo.head.target] : localRepo.head.target;
                const commit = localRepo.commits[headCommitHash];

                if (commit && commit.files[name]) {
                    // Revert file to the state in HEAD
                    files[name] = { ...commit.files[name], area: 'working', status: 'tracked' };
                } else {
                     // If the file didn't exist in HEAD (was new/untracked), remove it
                     delete files[name];
                }
           });
           // Untracked files remain in the working dir in default stash

           logToTerminal(`Saved working directory and index state WIP on ${localRepo.head.target}: ${localRepo.commits[localRepo.head.target]?.hash.substring(0,7) || 'Unborn'} ...`, 'output', 'git stash');
           updateExplanationText(`Stashed changes. Working directory and staging area are now clean (matching HEAD). Use 'git stash pop' to reapply.`);
           renderFilesUI();
           // Stash area UI needs rendering
     }

      function handleStashPop() {
           if (!gitInitialized) {
               logToTerminal('fatal: not a git repository', 'error', 'git stash pop');
               return;
           }
           if (stash.length === 0) {
               logToTerminal('No stash entries found.', 'output', 'git stash pop');
               updateExplanationText("There are no stashed changes to apply.");
               return;
           }

           const stashToPop = stash.pop(); // Get the latest stash

           // Apply stashed changes back to working directory
           // Basic simulation: overwrite existing files, mark as modified/staged as they were
           // Real git stash pop attempts a merge and can cause conflicts
           logToTerminal('Applying stashed changes... (Simplified simulation)', 'output', 'git stash pop');
           let conflictSimulated = false;
           for (const name in stashToPop.files) {
                const stashedData = stashToPop.files[name];
                if (files[name] && files[name].content !== stashedData.content && files[name].status !== 'untracked' && files[name].area === 'working') {
                    // Simulate a basic conflict if working dir file changed since stashing
                    // More complex conflicts (e.g., staged vs stash) aren't simulated here
                     files[name].content = `<<<<<<< Updated upstream\n${files[name].content}\n=======\n${stashedData.content}\n>>>>>>> Stashed changes`;
                     files[name].status = 'conflicted';
                     files[name].area = 'working';
                     conflictSimulated = true;
                     logToTerminal(`CONFLICT (content): Merge conflict in ${name}`, 'error');

                } else {
                    // Apply the stashed change
                    files[name] = { ...stashedData }; // Restore content, status, and area
                     // Ensure area is appropriate (usually working or staging)
                     if (files[name].area !== 'staging') {
                         files[name].area = 'working';
                     }
                }
           }

          renderFilesUI(); // Update UI including stash area (now empty)

          if (conflictSimulated) {
               logToTerminal('Automatic merge failed; fix conflicts and then commit the result.', 'error');
               updateExplanationText('Stash applied, but conflicts occurred! Resolve conflicts in red files, then add and commit.');
           } else {
               logToTerminal('Changes applied from stash.');
               updateExplanationText('Successfully applied stashed changes. Stash list is now empty.');
           }
      }


    // --- Initialization and Event Listeners ---
    function enableCommands(enable) {
        const buttons = document.querySelectorAll('.controls-container button');
        buttons.forEach(button => {
            // Keep init/clone disabled state separate
            if (button.id !== 'btn-init' && button.id !== 'btn-clone') {
                 button.disabled = !enable;
            }
             // Specific logic for clone/init
             if (button.id === 'btn-init') button.disabled = enable; // Disable init *after* initializing
             if (button.id === 'btn-clone') button.disabled = enable; // Disable clone *after* initializing
        });
         // Initially, only allow init or clone
         if (!gitInitialized) {
             buttons.forEach(button => {
                 if (button.id !== 'btn-init' && button.id !== 'btn-clone') {
                     button.disabled = true;
                 } else {
                     button.disabled = false;
                 }
             });
         }
    }

     function updateRemoteUrlUI() {
         remoteUrlDisplay.textContent = localRepo.remoteUrl ? `Connected: ${localRepo.remoteUrl}` : 'Not Connected';
     }


    // --- Attach Event Listeners ---
    btnInit.onclick = handleInit;
    btnStatus.onclick = handleStatus;
    btnLog.onclick = handleLog;
    btnCreateFile.onclick = () => handleCreateFile('index.js', `console.log('Initial content');`);
    btnModifyFile.onclick = () => handleModifyFile('index.js');
    btnCreateConfig.onclick = () => handleCreateFile('config.prop', 'API_KEY=SECRET123');
    btnAddGitignore.onclick = handleAddGitignore;
    btnAddIndex.onclick = () => handleAdd('index.js');
    btnAddAll.onclick = () => handleAdd('.');
    btnCommit.onclick = () => handleCommit(false);
    btnCommitAm.onclick = () => handleCommit(true);
    // btnDiff.onclick = handleDiff; // TODO: Implement Diff
    btnBranchFeature.onclick = handleBranchFeature;
    btnCheckoutFeature.onclick = () => handleCheckout('feature');
    btnCheckoutMain.onclick = () => handleCheckout('main');
    btnCheckoutCommit.onclick = () => {
         // Find the *first* parent of the current HEAD for demo purposes
         const currentHash = localRepo.head.type === 'branch' ? localRepo.branches[localRepo.head.target] : localRepo.head.target;
         const parentHash = localRepo.commits[currentHash]?.parents?.[0];
         if (parentHash) {
             handleCheckout(parentHash);
         } else {
             logToTerminal('Cannot checkout parent: No parent commit found.', 'warning');
         }
     };
    btnMergeFeature.onclick = handleMergeFeature;
    // btnRebaseMain.onclick = handleRebase; // TODO: Implement Rebase
    btnClone.onclick = () => { alert('Clone simulation resets current state and copies remote. OK?'); handleInit(); handleRemoteAdd(); handleFetch(); handleCheckout('main'); }; // Simplified clone
    btnRemoteAdd.onclick = handleRemoteAdd;
    btnPush.onclick = () => handlePush(false);
    btnPushFeatureUpstream.onclick = () => handlePush(true, 'feature');
    btnFetch.onclick = handleFetch;
    btnPull.onclick = handlePull;
    btnRemoteCommit.onclick = handleRemoteCommit;
    btnStash.onclick = handleStash;
    btnStashPop.onclick = handleStashPop;


    // Initial setup
    enableCommands(false); // Disable most commands initially

}); // End DOMContentLoaded