# Contributing to MediaConverter

I appreciate your interest in contributing to **MediaConverter**.  
I want you to know that contributions are welcome and appreciated. This document explains how to contribute effectively to the project.

---

## Ways to Contribute

You can contribute in several ways:

- Reporting bugs
- Proposing new features
- Improving documentation
- Fixing bugs
- Improving performance
- Writing tests
- Refactoring code

---

## Getting Started

1. Fork the repository

2. Clone your fork

```bash
git clone https://github.com/YOUR_USERNAME/mediaconverter.git
cd mediaconverter
```
3. Add the upstream repository

```git remote add upstream https://github.com/sadimanna/mediaconverter.git```

---

### Development Setup

MediaConverter is written in Rust and depends on FFmpeg. Install Rust and FFmpeg in your environment

---

### Branching

Create a new branch for each change.

#### Example:

```git checkout -b feature/batch-video-processing```

#### Suggested prefixes:
```
feature/
fix/
docs/
refactor/
test/
```

---

### Commit Messages

Use clear and concise commit messages.

#### Format:

> type: short description

Examples:

> feat: add batch video conversion
> 
> fix: correct frame extraction bug
> 
> docs: update installation instructions
> 
> refactor: simplify ffmpeg wrapper

---

### Pull Requests

#### Before submitting a Pull Request:

Ensure the project builds successfully

#### Your PR description should explain:

> what the change does
> 
> why it is needed
>
> any related issues

---

### Reporting Bugs

If you encounter a bug, please open an issue using the **Bug Report** template and include the following information:

- **Operating system** (e.g., Linux, macOS, Windows)
- **Rust version** (`rustc --version`)
- **FFmpeg version** (`ffmpeg -version`)
- **Steps to reproduce the issue**
- **Error logs or output**, if available

Providing detailed information helps us diagnose and fix the issue more quickly.

---

### Feature Requests

Feature suggestions are welcome.

If you have an idea for improving MediaConverter, please open a **Feature Request** issue and include:

- **The problem you want to solve**
- **The proposed solution or feature**
- **Any alternative approaches** you have considered
