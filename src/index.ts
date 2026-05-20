/**
 * conflow-algorithms
 * -----------------------------------------------------------------------------
 * Foundational architecture for generic Paper-Reviewer assignment algorithms
 * used in scientific conferences.
 *
 * Design notes:
 *  - Pure, mathematical core: no database, ORM, HTTP, or framework dependencies.
 *  - Schema-agnostic DTOs: only opaque string IDs are exchanged with callers.
 *  - Strategy Pattern: all solvers implement `IAssignmentSolver`, so algorithms
 *    (Greedy, ILP, Hungarian, Simulated Annealing, ...) are interchangeable
 *    behind a single, stable contract.
 *  - Zero external dependencies in this core layer.
 *
 * @packageDocumentation
 */

// Re-export all types and interfaces
export * from './types.js';

// Re-export utility classes
export * from './utils/AssignmentFormatter.js';

// Re-export solver implementations
export * from './solvers/GreedySolver.js';
export * from './solvers/ILPSolver.js';
