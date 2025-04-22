# Contributing to Sterlites Interactive Git Visualizer

First off, thank you for considering contributing to the Sterlites Interactive Git Visualizer! This tool was built from our experience at Sterlites.com and is now open-sourced for the community to enhance. It's people like you that help make this tool a great educational resource for developers of all experience levels.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Requests](#pull-requests)
- [Development Workflow](#development-workflow)
  - [Project Structure](#project-structure)
  - [Coding Standards](#coding-standards)
  - [Testing](#testing)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior through GitHub issues or by contacting the project maintainer.

## Getting Started

Contributions to this project are made via Issues and Pull Requests (PRs). A few general guidelines:

- Search existing Issues and PRs before creating your own
- We work on a fork-and-pull model, so fork the repository to your own account
- Work on a feature branch in your fork, not directly on `main`
- Keep PRs focused on a single topic to make review easier

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report. Following these guidelines helps maintainers understand your report, reproduce the behavior, and find related reports.

**Before Submitting A Bug Report:**

- Check the [issues](https://github.com/Sterlites/Widgets/issues) to see if the problem has already been reported
- Perform a quick search to see if the problem has been reported already

**How Do I Submit A Good Bug Report?**

- Use a clear and descriptive title
- Describe the exact steps to reproduce the problem
- Provide specific examples to demonstrate the steps
- Describe the behavior you observed after following the steps
- Explain which behavior you expected to see instead and why
- Include screenshots if possible
- Include your browser and operating system information

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion, including completely new features and minor improvements to existing functionality.

**Before Submitting An Enhancement Suggestion:**

- Check if the enhancement has already been suggested
- Check if the functionality already exists but isn't obvious

**How Do I Submit A Good Enhancement Suggestion?**

- Use a clear and descriptive title
- Provide a step-by-step description of the suggested enhancement
- Provide specific examples to demonstrate the steps
- Describe the current behavior and explain which behavior you expected to see instead
- Explain why this enhancement would be useful to most users
- List some other applications where this enhancement exists, if applicable
- Include mockups or examples if possible

### Your First Code Contribution

Unsure where to begin contributing? You can start by looking through these `beginner-friendly` and `help-wanted` issues:

- [Beginner-friendly issues](https://github.com/Sterlites/Widgets/labels/beginner-friendly) - issues which should only require a few lines of code
- [Help wanted issues](https://github.com/Sterlites/Widgets/labels/help-wanted) - issues which should be a bit more involved than beginner issues

### Pull Requests

- Fill in the required template (automatically loaded when you create a PR)
- Do not include issue numbers in the PR title
- Include screenshots and animated GIFs in your PR whenever possible
- Follow the JavaScript styleguide
- Include thoughtfully-worded, well-structured tests
- Document new code
- End all files with a newline

### Issue and PR Templates

This project provides templates to standardize contributions:

1. **Bug Report Template**: Use this when reporting bugs. It includes fields for:

   - Bug description
   - Steps to reproduce
   - Expected vs. actual behavior
   - Environment details
   - Screenshots

2. **Feature Request Template**: Use this when suggesting enhancements. It includes fields for:

   - Feature description
   - Problem it solves
   - Proposed solution
   - Alternative solutions

3. **Pull Request Template**: Automatically loaded when you create a PR. It includes:
   - Description of changes
   - Related issue reference
   - Type of change
   - Testing information
   - Checklist for completeness

These templates help ensure that all necessary information is provided, making it easier for maintainers to understand and address your contributions.

## Development Workflow

### Project Structure

```
Widgets/LearnGit/
├── index.html          # Main HTML file with the widget structure
├── style.css           # CSS styles for the visualizer
├── script.js           # JavaScript code for Git simulation and visualization
├── README.md           # Main documentation file
├── CONTRIBUTING.md     # This file
├── LICENSE             # MIT License file
├── .gitignore          # Git ignore file for excluding files from version control
├── .github/            # GitHub specific files
│   ├── PULL_REQUEST_TEMPLATE.md  # Template for pull requests
│   └── ISSUE_TEMPLATE/          # Templates for issues
│       ├── bug_report.md         # Bug report template
│       └── feature_request.md    # Feature request template
```

### Coding Standards

#### JavaScript

- Use ES6+ features where appropriate
- Use 2 spaces for indentation
- Use semicolons
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Use camelCase for variables and functions
- Use PascalCase for classes
- Use UPPERCASE for constants

#### HTML

- Use semantic HTML5 elements
- Use 2 spaces for indentation
- Use double quotes for attributes
- Include appropriate ARIA attributes for accessibility

#### CSS

- Use 2 spaces for indentation
- Use kebab-case for class names
- Group related properties
- Add comments for complex selectors or rules
- Use responsive design principles

### Testing

Currently, the project doesn't have automated tests. If you're adding a new feature, please manually test it thoroughly across different browsers (Chrome, Firefox, Safari, Edge).

When submitting a PR, please include:

- What you tested
- How you tested it
- Any browsers/devices you've verified it on

## Community

### Communication Channels

- GitHub Issues: For bug reports and feature requests
- GitHub Discussions: For general questions and discussions
- Email: For private communications if needed

### Recognition

Contributors will be recognized in the README.md file and in release notes.

---

Thank you for contributing to the Sterlites Interactive Git Visualizer! Your efforts help make version control more accessible and understandable for developers everywhere - from new grads to senior engineers to vibe coders.

Better tools create better developers. #LearnGit
