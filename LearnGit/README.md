# Sterlites Interactive Git Visualizer

![Git Visualizer Banner](https://via.placeholder.com/1200x300/0d1117/ffffff?text=Interactive+Git+Visualizer)

## 🚀 Overview

The Interactive Git Visualizer is a powerful visual tool that transforms how everyone understands Git concepts through intuitive visualization and hands-on interaction. Built from experience at Sterlites.com, this web-based widget provides a clear visualization of Git's core areas (Working Directory, Staging Area, Local Repository, and Remote Repository) and demonstrates how Git commands affect these areas in real-time.

Perfect for:

- 🎓 New grads learning Git for the first time
- 👨‍🏫 Senior engineers teaching version control concepts
- 👩‍💻 "Vibe coders" looking to understand Git fundamentals
- 🧠 Teams seeking faster onboarding and fewer errors

## ✨ Features

### 📊 Complete Visual Representation

- **Multi-area visualization**: See all Git areas (Working Directory, Staging Area, Stash, Local Repository, Remote Repository) in a single view
- **File tracking**: Watch files move between different Git areas as you execute commands
- **Branch visualization**: Clear visual representation of branches and their relationships
- **Commit history**: Visual commit graph showing the project history
- **HEAD pointer**: Visual indicator of where HEAD is pointing

### 🎮 Interactive Learning

- **Command simulation**: Execute Git commands through buttons and see immediate visual results
- **Real-time updates**: All visualizations update instantly when commands are executed
- **Terminal output**: See the simulated terminal output for each command
- **Explanations**: Get clear explanations of what each command does

### 📚 Comprehensive Git Workflow Coverage

- **Basic operations**: init, add, commit, status, log
- **Branching operations**: branch creation, checkout, merge
- **Remote operations**: clone, remote add, push, pull, fetch
- **Advanced features**: stash, stash pop

### 🎨 User-Friendly Design

- **Tabbed interface**: Commands organized into logical categories
- **Tooltips**: Helpful tooltips explaining each command
- **Responsive layout**: Works on different screen sizes
- **Color-coded elements**: Easy visual differentiation between states and areas

## 🛠️ Installation

### Option 1: Direct Download

1. Download the repository as a ZIP file
2. Extract the contents to your local machine
3. Open `index.html` in your web browser

### Option 2: Clone the Repository

```bash
git clone https://github.com/Sterlites/Widgets.git
cd Widgets/LearnGit
# Open index.html in your browser
```

### Option 3: Host on a Web Server

1. Upload the files to your web server
2. Navigate to the appropriate URL in your browser

## 📖 Usage Guide

### Getting Started

1. Open `index.html` in your web browser
2. Click the "git init" button to initialize a new repository
3. Use the "Create index.js" button to create a sample file
4. Explore different Git commands using the tabbed interface

### Basic Workflow Example

1. Create a file using "Create index.js"
2. Stage the file with "git add index.js"
3. Commit the file with "git commit -m '...'"
4. Modify the file with "Modify index.js"
5. See the changes with "git status"
6. Stage and commit again to create a new commit

### Branching Workflow Example

1. Create and commit some files to establish a history
2. Create a new branch with "git branch feature"
3. Switch to the branch with "git checkout feature"
4. Make changes and commits on the feature branch
5. Switch back to main with "git checkout main"
6. Merge the feature branch with "git merge feature"

### Remote Operations Example

1. Set up a remote connection with "git remote add origin"
2. Push your changes with "git push"
3. Simulate remote changes with "Remote Commit (Sim)"
4. Fetch changes with "git fetch"
5. Merge or pull the changes

## 🧩 Project Structure

```
Widgets/LearnGit/
├── index.html          # Main HTML file with the widget structure
├── style.css           # CSS styles for the visualizer
├── script.js           # JavaScript code for Git simulation and visualization
├── README.md           # This documentation file
├── CONTRIBUTING.md     # Contribution guidelines
├── LICENSE             # MIT License file
├── .gitignore          # Git ignore file for excluding files from version control
├── .github/            # GitHub specific files
│   ├── PULL_REQUEST_TEMPLATE.md  # Template for pull requests
│   └── ISSUE_TEMPLATE/          # Templates for issues
│       ├── bug_report.md         # Bug report template
│       └── feature_request.md    # Feature request template
```

## 🔧 Customization

### Styling

You can customize the appearance of the visualizer by modifying the `style.css` file. The visualizer uses a clean, modern design with a color scheme that highlights different Git states and areas.

### Adding New Commands

To add new Git commands:

1. Add a new button in the appropriate tab section in `index.html`
2. Create a handler function in `script.js`
3. Connect the button to the handler function
4. Implement the visualization logic for the new command

## 🤝 Contributing

This tool is now yours to enhance! We've open-sourced it for the community to build upon. Here's how you can contribute:

### Reporting Issues

- Use the GitHub issue tracker to report bugs
- Include detailed steps to reproduce the issue
- Mention your browser and operating system

### Submitting Pull Requests

1. Fork the repository
2. Create a new branch for your feature (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request using the provided template

### Using Issue and PR Templates

This project includes templates for:

- Bug reports: Use this template when reporting issues
- Feature requests: Use this template when suggesting enhancements
- Pull requests: This template will automatically load when you create a PR

These templates help ensure that you provide all the necessary information for maintainers to understand and address your contributions effectively.

### Feature Ideas for Contributors

- Implement additional Git commands (rebase, cherry-pick, etc.)
- Add more advanced visualizations (commit graph improvements, etc.)
- Create themed skins/styles for the visualizer
- Add interactive tutorials/guided workflows
- Improve accessibility features
- Add localization support for multiple languages
- Create automated tests for the codebase

### Code Style Guidelines

- Use consistent indentation (2 spaces)
- Follow JavaScript best practices
- Add comments for complex logic
- Keep functions small and focused
- Use meaningful variable and function names

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- Created by the team at [Sterlites.com](https://sterlites.com) based on real-world experience
- Built to address common Git learning challenges and reduce onboarding time
- Designed to help teams reduce errors and improve Git workflow understanding
- Now open-sourced for the community to enhance and build upon
- Built with HTML, CSS, and vanilla JavaScript

## 📬 Contact

If you have any questions, suggestions, or just want to say hello, please reach out:

- GitHub Issues: [Create an issue](https://github.com/Sterlites/Widgets/issues)
- GitHub: [Sterlites](https://github.com/Sterlites)
- Twitter: [@rohit_dwivedi](https://twitter.com/rohit_dwivedi)
- Website: [Sterlites.com](https://sterlites.com)

---

<p align="center">Made with ❤️ for the developer community</p>
<p align="center">Better tools create better developers. #LearnGit</p>
