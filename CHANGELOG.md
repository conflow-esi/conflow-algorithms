# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-05-26

### Fixed
- Exclude test files from the published package.

## [1.0.0] - 2026-05-26

### Added
- `ILPSolver` — globally optimal paper-reviewer assignment via Integer Linear Programming.
- `GreedySolver` — fast baseline assignment using score-descending greedy fill.
- `AssignmentFormatter` — static helpers `groupByReviewer` and `groupByPaper`.
- Core types: `Reviewer`, `Paper`, `Bid`, `Conflict`, `Assignment`, `AssignmentResult`, `AssignmentMetrics`, `IAssignmentSolver`.
